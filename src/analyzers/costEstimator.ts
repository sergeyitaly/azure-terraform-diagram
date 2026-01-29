// src/analyzers/costEstimator.ts
import { TerraformResource } from '../terraformParser';
import {
    CostEstimate,
    CostBreakdown,
    SKUInfo,
    TagCompliance,
    CostCenter,
    CostOptimization
} from '../types/cost';
import {
    AZURE_PRICING,
    getPricingForType,
    estimateMonthlyCost,
    getSKUInfo
} from '../data/azurePricing';

/**
 * Estimates costs for Azure resources based on Terraform configurations
 */
export class CostEstimator {
    private resources: TerraformResource[];
    private currency: string;
    private region: string;

    constructor(resources: TerraformResource[], currency: string = 'USD', region: string = 'eastus') {
        this.resources = resources;
        this.currency = currency;
        this.region = region;
    }

    /**
     * Estimate costs for all resources
     */
    estimateAll(): Map<string, CostEstimate> {
        const results = new Map<string, CostEstimate>();

        for (const resource of this.resources) {
            const estimate = this.estimateResource(resource);
            if (estimate) {
                results.set(`${resource.type}_${resource.name}`, estimate);
            }
        }

        return results;
    }

    /**
     * Estimate cost for a single resource
     */
    estimateResource(resource: TerraformResource): CostEstimate | undefined {
        const pricing = getPricingForType(resource.type);
        if (!pricing) {
            return this.estimateGenericResource(resource);
        }

        const sku = this.extractSKU(resource);
        const tierInfo = getSKUInfo(resource.type, sku);

        if (!tierInfo) {
            return this.estimateGenericResource(resource);
        }

        const details: CostBreakdown[] = [];
        let monthlyCost = 0;

        // Calculate based on pricing model
        switch (pricing.pricingModel) {
            case 'hourly':
                monthlyCost = (tierInfo.hourlyRate || 0) * 730; // ~730 hours per month
                details.push({
                    component: 'Compute',
                    unit: 'Hours',
                    quantity: 730,
                    rate: tierInfo.hourlyRate || 0,
                    cost: monthlyCost
                });
                break;

            case 'monthly':
                monthlyCost = tierInfo.monthlyRate || 0;
                details.push({
                    component: 'Base cost',
                    unit: 'Month',
                    quantity: 1,
                    rate: tierInfo.monthlyRate || 0,
                    cost: monthlyCost
                });
                break;

            case 'per-unit':
                // Estimate usage (default to 100 units for storage, etc.)
                const estimatedUnits = this.estimateUnits(resource);
                monthlyCost = (tierInfo.perUnitRate || 0) * estimatedUnits;
                details.push({
                    component: tierInfo.unit || 'Units',
                    unit: tierInfo.unit || 'unit',
                    quantity: estimatedUnits,
                    rate: tierInfo.perUnitRate || 0,
                    cost: monthlyCost
                });
                break;

            case 'consumption':
                // For consumption-based, provide an estimate
                monthlyCost = tierInfo.monthlyRate || 0;
                if (monthlyCost === 0 && tierInfo.perUnitRate) {
                    // Estimate 1M requests/month for functions, etc.
                    const estimatedRequests = 1000000;
                    monthlyCost = (tierInfo.perUnitRate || 0) * estimatedRequests;
                }
                details.push({
                    component: 'Estimated usage',
                    unit: tierInfo.unit || 'requests',
                    quantity: 1000000,
                    rate: tierInfo.perUnitRate || 0,
                    cost: monthlyCost
                });
                break;

            case 'reserved':
                monthlyCost = tierInfo.monthlyRate || 0;
                details.push({
                    component: 'Reserved capacity',
                    unit: 'Month',
                    quantity: 1,
                    rate: tierInfo.monthlyRate || 0,
                    cost: monthlyCost
                });
                break;
        }

        // Add additional costs based on resource type
        this.addAdditionalCosts(resource, details);
        monthlyCost = details.reduce((sum, d) => sum + d.cost, 0);

        return {
            monthlyCost: Math.round(monthlyCost * 100) / 100,
            yearlyCost: Math.round(monthlyCost * 12 * 100) / 100,
            currency: this.currency,
            tier: tierInfo.tier,
            sku: sku,
            region: this.region,
            details,
            confidence: this.getConfidenceLevel(resource),
            notes: this.getNotes(resource)
        };
    }

    /**
     * Estimate cost for resources without specific pricing data
     */
    private estimateGenericResource(resource: TerraformResource): CostEstimate | undefined {
        // Skip resources that are typically free
        const freeResources = [
            'azurerm_resource_group',
            'azurerm_virtual_network',
            'azurerm_subnet',
            'azurerm_network_interface',
            'azurerm_network_security_group',
            'azurerm_network_security_rule',
            'azurerm_route_table',
            'azurerm_route',
            'azurerm_private_dns_zone',
            'azurerm_private_dns_zone_virtual_network_link',
            'azurerm_role_assignment',
            'azurerm_user_assigned_identity',
            'azurerm_subnet_network_security_group_association',
            'azurerm_subnet_route_table_association'
        ];

        if (freeResources.includes(resource.type)) {
            return {
                monthlyCost: 0,
                yearlyCost: 0,
                currency: this.currency,
                tier: 'Free',
                sku: 'N/A',
                region: this.region,
                details: [],
                confidence: 'high',
                notes: ['This resource type is typically free']
            };
        }

        // Return undefined for unknown resources
        return undefined;
    }

    /**
     * Extract SKU from resource attributes
     */
    private extractSKU(resource: TerraformResource): string {
        const attrs = resource.attributes || {};

        // Try various SKU attribute names
        const skuCandidates = [
            attrs.sku_name,
            attrs.sku?.name,
            attrs.sku,
            attrs.size,
            attrs.vm_size,
            attrs.tier,
            attrs.account_tier && attrs.account_replication_type
                ? `${attrs.account_tier}_${attrs.account_replication_type}`
                : undefined,
            attrs.sku_tier,
            attrs.edition
        ];

        for (const candidate of skuCandidates) {
            if (candidate && typeof candidate === 'string') {
                return candidate;
            }
        }

        // Type-specific extraction
        switch (resource.type) {
            case 'azurerm_kubernetes_cluster':
                return attrs.sku_tier || 'Free';

            case 'azurerm_redis_cache':
                if (attrs.sku_name && attrs.family && attrs.capacity !== undefined) {
                    return `${attrs.sku_name}_${attrs.family}${attrs.capacity}`;
                }
                return attrs.sku_name || 'Basic_C0';

            case 'azurerm_cosmosdb_account':
                if (attrs.enable_automatic_failover || attrs.enable_multiple_write_locations) {
                    return 'Provisioned_1000';
                }
                return attrs.offer_type === 'Standard' ? 'Provisioned_400' : 'Serverless';

            default:
                return 'Standard';
        }
    }

    /**
     * Estimate units for per-unit pricing
     */
    private estimateUnits(resource: TerraformResource): number {
        const attrs = resource.attributes || {};

        switch (resource.type) {
            case 'azurerm_storage_account':
                // Estimate 100 GB default storage
                return 100;

            case 'azurerm_managed_disk':
                return attrs.disk_size_gb || 128;

            case 'azurerm_log_analytics_workspace':
                // Estimate 10 GB/day ingestion
                return 10 * 30;

            case 'azurerm_application_insights':
                // Estimate 5 GB/month
                return 5;

            case 'azurerm_key_vault':
                // Estimate 1000 operations
                return 1;

            default:
                return 100;
        }
    }

    /**
     * Add additional costs based on resource specifics
     */
    private addAdditionalCosts(resource: TerraformResource, details: CostBreakdown[]): void {
        const attrs = resource.attributes || {};

        switch (resource.type) {
            case 'azurerm_kubernetes_cluster':
                // Add node pool costs
                this.addAKSNodePoolCosts(resource, details);
                break;

            case 'azurerm_virtual_machine':
            case 'azurerm_linux_virtual_machine':
            case 'azurerm_windows_virtual_machine':
                // Add disk costs
                this.addVMDiskCosts(resource, details);
                break;

            case 'azurerm_storage_account':
                // Add transaction costs estimate
                details.push({
                    component: 'Transactions (est.)',
                    unit: '10K transactions',
                    quantity: 100,
                    rate: 0.004,
                    cost: 0.40
                });
                break;

            case 'azurerm_application_gateway':
                // Add data processing costs
                details.push({
                    component: 'Data processed (est.)',
                    unit: 'GB',
                    quantity: 100,
                    rate: 0.008,
                    cost: 0.80
                });
                break;

            case 'azurerm_firewall':
                // Add data processing costs
                details.push({
                    component: 'Data processed (est.)',
                    unit: 'GB',
                    quantity: 100,
                    rate: 0.016,
                    cost: 1.60
                });
                break;
        }
    }

    /**
     * Add AKS node pool costs
     */
    private addAKSNodePoolCosts(resource: TerraformResource, details: CostBreakdown[]): void {
        const attrs = resource.attributes || {};
        const defaultPool = attrs.default_node_pool;

        if (defaultPool && typeof defaultPool === 'object') {
            const vmSize = defaultPool.vm_size || 'Standard_D2s_v3';
            const nodeCount = defaultPool.node_count || 3;

            // Get VM pricing
            const vmPricing = getPricingForType('azurerm_linux_virtual_machine');
            if (vmPricing) {
                const vmTier = vmPricing.tiers[vmSize];
                if (vmTier) {
                    const nodeMonthlyCost = (vmTier.hourlyRate || 0.096) * 730 * nodeCount;
                    details.push({
                        component: `Worker Nodes (${nodeCount}x ${vmSize})`,
                        unit: 'node-month',
                        quantity: nodeCount,
                        rate: (vmTier.hourlyRate || 0.096) * 730,
                        cost: nodeMonthlyCost
                    });
                }
            }
        }
    }

    /**
     * Add VM disk costs
     */
    private addVMDiskCosts(resource: TerraformResource, details: CostBreakdown[]): void {
        const attrs = resource.attributes || {};
        const osDisk = attrs.os_disk;

        if (osDisk && typeof osDisk === 'object') {
            const diskType = osDisk.storage_account_type || 'Premium_LRS';
            const diskSize = osDisk.disk_size_gb || 128;

            // Estimate disk costs
            const diskPricePerGB = diskType.includes('Premium') ? 0.15 : 0.05;
            const diskCost = diskPricePerGB * diskSize;

            details.push({
                component: `OS Disk (${diskType})`,
                unit: 'GB',
                quantity: diskSize,
                rate: diskPricePerGB,
                cost: diskCost
            });
        }
    }

    /**
     * Get confidence level for estimate
     */
    private getConfidenceLevel(resource: TerraformResource): 'high' | 'medium' | 'low' {
        const pricing = getPricingForType(resource.type);

        if (!pricing) {
            return 'low';
        }

        const sku = this.extractSKU(resource);
        const tierInfo = getSKUInfo(resource.type, sku);

        if (!tierInfo) {
            return 'low';
        }

        // Consumption-based pricing is less certain
        if (pricing.pricingModel === 'consumption') {
            return 'medium';
        }

        return 'high';
    }

    /**
     * Get notes for the estimate
     */
    private getNotes(resource: TerraformResource): string[] {
        const notes: string[] = [];
        const attrs = resource.attributes || {};

        // Add relevant notes based on resource configuration
        switch (resource.type) {
            case 'azurerm_kubernetes_cluster':
                if (attrs.sku_tier === 'Free') {
                    notes.push('Using free tier - no SLA');
                }
                if (attrs.default_node_pool?.enable_auto_scaling) {
                    notes.push('Auto-scaling enabled - costs may vary');
                }
                break;

            case 'azurerm_app_service':
            case 'azurerm_linux_web_app':
            case 'azurerm_function_app':
                if (this.extractSKU(resource).includes('F1')) {
                    notes.push('Using free tier - limited resources');
                }
                break;

            case 'azurerm_cosmosdb_account':
                if (attrs.enable_automatic_failover) {
                    notes.push('Multi-region - costs will be multiplied');
                }
                break;

            case 'azurerm_storage_account':
                if (attrs.account_replication_type?.includes('GRS')) {
                    notes.push('Geo-redundant storage - higher costs');
                }
                break;
        }

        notes.push('Prices are estimates and may vary by region and contract');

        return notes;
    }

    /**
     * Extract SKU information for all resources
     */
    extractAllSKUInfo(): Map<string, SKUInfo> {
        const results = new Map<string, SKUInfo>();

        for (const resource of this.resources) {
            const info = this.extractSKUInfo(resource);
            results.set(`${resource.type}_${resource.name}`, info);
        }

        return results;
    }

    /**
     * Extract SKU information for a single resource
     */
    extractSKUInfo(resource: TerraformResource): SKUInfo {
        const attrs = resource.attributes || {};
        const sku = this.extractSKU(resource);

        return {
            tier: attrs.sku_tier || attrs.tier || attrs.account_tier || 'Standard',
            sku: sku,
            size: attrs.size || attrs.vm_size,
            family: attrs.family,
            capacity: attrs.capacity || attrs.instances || attrs.node_count || 1
        };
    }

    /**
     * Analyze tag compliance for all resources
     */
    analyzeTagCompliance(requiredTags: string[] = ['environment', 'cost-center', 'owner']): Map<string, TagCompliance> {
        const results = new Map<string, TagCompliance>();

        for (const resource of this.resources) {
            const compliance = this.checkTagCompliance(resource, requiredTags);
            results.set(`${resource.type}_${resource.name}`, compliance);
        }

        return results;
    }

    /**
     * Check tag compliance for a single resource
     */
    private checkTagCompliance(resource: TerraformResource, requiredTags: string[]): TagCompliance {
        const tags = resource.tags || {};
        const missingTags: string[] = [];

        for (const tag of requiredTags) {
            if (!tags[tag]) {
                missingTags.push(tag);
            }
        }

        const score = requiredTags.length > 0
            ? Math.round(((requiredTags.length - missingTags.length) / requiredTags.length) * 100)
            : 100;

        const recommendations: string[] = [];
        if (missingTags.length > 0) {
            recommendations.push(`Add missing tags: ${missingTags.join(', ')}`);
        }

        return {
            hasRequiredTags: missingTags.length === 0,
            missingTags,
            tags,
            score,
            recommendations
        };
    }

    /**
     * Group resources by cost center
     */
    groupByCostCenter(): CostCenter[] {
        const estimates = this.estimateAll();
        const costCenters = new Map<string, CostCenter>();

        for (const resource of this.resources) {
            const costCenter = resource.tags?.['cost-center'] || 'untagged';
            const resourceId = `${resource.type}_${resource.name}`;
            const estimate = estimates.get(resourceId);

            if (!costCenters.has(costCenter)) {
                costCenters.set(costCenter, {
                    name: costCenter,
                    tag: 'cost-center',
                    resources: [],
                    totalMonthlyCost: 0,
                    currency: this.currency
                });
            }

            const center = costCenters.get(costCenter)!;
            center.resources.push(resourceId);
            center.totalMonthlyCost += estimate?.monthlyCost || 0;
        }

        return Array.from(costCenters.values()).sort((a, b) => b.totalMonthlyCost - a.totalMonthlyCost);
    }

    /**
     * Get total monthly cost
     */
    getTotalMonthlyCost(): number {
        const estimates = this.estimateAll();
        let total = 0;

        for (const estimate of estimates.values()) {
            total += estimate.monthlyCost;
        }

        return Math.round(total * 100) / 100;
    }

    /**
     * Get cost optimization recommendations
     */
    getOptimizations(): CostOptimization[] {
        const optimizations: CostOptimization[] = [];
        const estimates = this.estimateAll();

        for (const resource of this.resources) {
            const resourceId = `${resource.type}_${resource.name}`;
            const estimate = estimates.get(resourceId);

            if (!estimate) continue;

            // Check for optimization opportunities
            const opts = this.findOptimizations(resource, estimate);
            optimizations.push(...opts);
        }

        return optimizations.sort((a, b) => (b.monthlySavings || 0) - (a.monthlySavings || 0));
    }

    /**
     * Find optimization opportunities for a resource
     */
    private findOptimizations(resource: TerraformResource, estimate: CostEstimate): CostOptimization[] {
        const opts: CostOptimization[] = [];
        const attrs = resource.attributes || {};
        const resourceId = `${resource.type}_${resource.name}`;

        switch (resource.type) {
            case 'azurerm_virtual_machine':
            case 'azurerm_linux_virtual_machine':
            case 'azurerm_windows_virtual_machine':
                // Check for oversized VMs
                const vmSize = attrs.size || attrs.vm_size || '';
                if (vmSize.includes('_D32') || vmSize.includes('_D16')) {
                    opts.push({
                        resourceId,
                        resourceType: resource.type,
                        currentSku: vmSize,
                        recommendation: 'Consider using reserved instances for 1-year commitment to save up to 40%',
                        currentMonthlyCost: estimate.monthlyCost,
                        estimatedMonthlyCost: estimate.monthlyCost * 0.6,
                        monthlySavings: estimate.monthlyCost * 0.4,
                        impact: 'high',
                        category: 'reserved'
                    });
                }
                break;

            case 'azurerm_storage_account':
                // Check replication type
                if (attrs.account_replication_type?.includes('GRS')) {
                    opts.push({
                        resourceId,
                        resourceType: resource.type,
                        currentSku: `${attrs.account_tier}_${attrs.account_replication_type}`,
                        recommendedSku: `${attrs.account_tier}_LRS`,
                        recommendation: 'Consider LRS if geo-redundancy is not required',
                        currentMonthlyCost: estimate.monthlyCost,
                        estimatedMonthlyCost: estimate.monthlyCost * 0.5,
                        monthlySavings: estimate.monthlyCost * 0.5,
                        impact: 'medium',
                        category: 'rightsize'
                    });
                }
                break;

            case 'azurerm_app_service':
            case 'azurerm_linux_web_app':
            case 'azurerm_service_plan':
                // Check for premium tier that might be downgraded
                const appSku = this.extractSKU(resource);
                if (appSku.includes('P1') || appSku.includes('P2') || appSku.includes('P3')) {
                    opts.push({
                        resourceId,
                        resourceType: resource.type,
                        currentSku: appSku,
                        recommendedSku: 'S1',
                        recommendation: 'Consider Standard tier if premium features are not required',
                        currentMonthlyCost: estimate.monthlyCost,
                        impact: 'medium',
                        category: 'rightsize'
                    });
                }
                break;

            case 'azurerm_kubernetes_cluster':
                // Check for spot instance opportunities
                if (!attrs.default_node_pool?.spot_max_price) {
                    opts.push({
                        resourceId,
                        resourceType: resource.type,
                        currentSku: estimate.sku,
                        recommendation: 'Consider using spot instances for non-critical workloads to save up to 80%',
                        currentMonthlyCost: estimate.monthlyCost,
                        impact: 'high',
                        category: 'spot'
                    });
                }
                break;
        }

        return opts;
    }

    /**
     * Get cost summary
     */
    getCostSummary(): {
        totalMonthlyCost: number;
        totalYearlyCost: number;
        currency: string;
        resourceCount: number;
        estimatedResourceCount: number;
        topCostResources: { resourceId: string; cost: number }[];
        costByType: { type: string; cost: number; count: number }[];
    } {
        const estimates = this.estimateAll();
        const totalMonthlyCost = this.getTotalMonthlyCost();

        // Get top cost resources
        const topCost = Array.from(estimates.entries())
            .filter(([, e]) => e.monthlyCost > 0)
            .sort(([, a], [, b]) => b.monthlyCost - a.monthlyCost)
            .slice(0, 10)
            .map(([id, e]) => ({ resourceId: id, cost: e.monthlyCost }));

        // Group by type
        const byType = new Map<string, { cost: number; count: number }>();
        for (const [id, estimate] of estimates.entries()) {
            const type = id.split('_').slice(0, -1).join('_'); // Remove resource name
            const current = byType.get(type) || { cost: 0, count: 0 };
            current.cost += estimate.monthlyCost;
            current.count++;
            byType.set(type, current);
        }

        return {
            totalMonthlyCost,
            totalYearlyCost: totalMonthlyCost * 12,
            currency: this.currency,
            resourceCount: this.resources.length,
            estimatedResourceCount: estimates.size,
            topCostResources: topCost,
            costByType: Array.from(byType.entries())
                .map(([type, data]) => ({ type, ...data }))
                .sort((a, b) => b.cost - a.cost)
        };
    }
}
