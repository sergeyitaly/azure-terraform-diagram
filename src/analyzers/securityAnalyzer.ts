// src/analyzers/securityAnalyzer.ts
import { TerraformResource } from '../terraformParser';
import {
    SecurityPosture,
    SecurityIndicator,
    SecurityRecommendation,
    SecuritySeverity,
    SecurityCategory,
    RBACInfo,
    PrivateEndpointInfo,
    TLSConfig,
    NetworkRulesConfig,
    NSGRule
} from '../types/security';
import { SECURITY_RULES, SEVERITY_WEIGHTS, getSecurityRulesForType } from '../data/securityRules';

/**
 * Analyzes security posture of Terraform resources
 */
export class SecurityAnalyzer {
    private resources: TerraformResource[];
    private resourceMap: Map<string, TerraformResource>;

    constructor(resources: TerraformResource[]) {
        this.resources = resources;
        this.resourceMap = new Map();
        resources.forEach(r => {
            this.resourceMap.set(`${r.type}_${r.name}`, r);
        });
    }

    /**
     * Analyze security posture for all resources
     */
    analyzeAll(): Map<string, SecurityPosture> {
        const results = new Map<string, SecurityPosture>();

        for (const resource of this.resources) {
            const posture = this.analyzeResource(resource);
            results.set(`${resource.type}_${resource.name}`, posture);
        }

        return results;
    }

    /**
     * Analyze a single resource
     */
    analyzeResource(resource: TerraformResource): SecurityPosture {
        const indicators: SecurityIndicator[] = [];
        const recommendations: SecurityRecommendation[] = [];

        // Get security rules for this resource type
        const rules = getSecurityRulesForType(resource.type);

        // Check each rule
        for (const rule of rules) {
            if (this.checkRule(resource, rule)) {
                indicators.push({
                    id: rule.id,
                    severity: rule.severity,
                    category: this.getCategoryFromRule(rule),
                    title: rule.title,
                    description: rule.description,
                    resourceType: resource.type,
                    attribute: rule.attribute,
                    currentValue: this.getAttributeValue(resource, rule.attribute),
                    expectedValue: rule.value,
                    remediation: rule.remediation,
                    complianceFrameworks: rule.complianceFrameworks
                });

                recommendations.push({
                    id: rule.id,
                    severity: rule.severity,
                    title: rule.title,
                    description: rule.description,
                    impact: this.getImpactDescription(rule.severity),
                    remediation: rule.remediation
                });
            }
        }

        // Additional type-specific checks
        this.addTypeSpecificIndicators(resource, indicators, recommendations);

        // Calculate overall score
        const overallScore = this.calculateOverallScore(indicators);

        // Build security posture
        const posture: SecurityPosture = {
            isEncrypted: this.checkEncryption(resource),
            hasPublicEndpoint: this.checkPublicEndpoint(resource),
            hasNSG: this.checkNSGAssociation(resource),
            missingEncryption: this.getMissingEncryption(resource),
            publicEndpoints: this.getPublicEndpoints(resource),
            nsgRules: this.getNSGRules(resource),
            complianceStatus: this.getComplianceStatus(overallScore),
            overallScore,
            indicators,
            recommendations,
            rbacInfo: this.getRBACInfo(resource),
            privateEndpointInfo: this.getPrivateEndpointInfo(resource)
        };

        return posture;
    }

    /**
     * Check if a security rule is violated
     */
    private checkRule(resource: TerraformResource, rule: typeof SECURITY_RULES[0]): boolean {
        const value = this.getAttributeValue(resource, rule.attribute);

        switch (rule.operator) {
            case 'equals':
                return value === rule.value;
            case 'not_equals':
                return value !== rule.value;
            case 'contains':
                return typeof value === 'string' && value.includes(rule.value);
            case 'not_contains':
                return typeof value !== 'string' || !value.includes(rule.value);
            case 'less_than':
                return typeof value === 'number' && value < rule.value;
            case 'greater_than':
                return typeof value === 'number' && value > rule.value;
            case 'exists':
                return value !== undefined && value !== null;
            case 'not_exists':
                return value === undefined || value === null;
            default:
                return false;
        }
    }

    /**
     * Get attribute value from resource (supports nested paths)
     */
    private getAttributeValue(resource: TerraformResource, attributePath: string): any {
        const parts = attributePath.split('.');
        let value: any = resource.attributes;

        for (const part of parts) {
            if (value === undefined || value === null) return undefined;
            value = value[part];
        }

        return value;
    }

    /**
     * Get category from rule based on attribute
     */
    private getCategoryFromRule(rule: typeof SECURITY_RULES[0]): SecurityCategory {
        const attr = rule.attribute.toLowerCase();

        if (attr.includes('encrypt') || attr.includes('tls') || attr.includes('ssl')) {
            return 'encryption';
        }
        if (attr.includes('network') || attr.includes('public') || attr.includes('ip') || attr.includes('firewall')) {
            return 'network';
        }
        if (attr.includes('identity') || attr.includes('rbac') || attr.includes('admin') || attr.includes('aad')) {
            return 'identity';
        }
        if (attr.includes('log') || attr.includes('audit') || attr.includes('diagnostic')) {
            return 'logging';
        }
        if (attr.includes('access') || attr.includes('auth')) {
            return 'access-control';
        }
        if (attr.includes('purge') || attr.includes('soft_delete') || attr.includes('retention')) {
            return 'data-protection';
        }

        return 'configuration';
    }

    /**
     * Get impact description based on severity
     */
    private getImpactDescription(severity: SecuritySeverity): string {
        switch (severity) {
            case 'critical':
                return 'Immediate risk of data breach or system compromise. Fix immediately.';
            case 'high':
                return 'Significant security risk that should be addressed promptly.';
            case 'medium':
                return 'Moderate risk that should be addressed in the near term.';
            case 'low':
                return 'Minor risk or best practice recommendation.';
            case 'info':
                return 'Informational finding for awareness.';
        }
    }

    /**
     * Calculate overall security score
     */
    private calculateOverallScore(indicators: SecurityIndicator[]): SecuritySeverity {
        if (indicators.length === 0) return 'low';

        // Find the highest severity
        const severities: SecuritySeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
        for (const severity of severities) {
            if (indicators.some(i => i.severity === severity)) {
                return severity;
            }
        }

        return 'low';
    }

    /**
     * Get compliance status from overall score
     */
    private getComplianceStatus(score: SecuritySeverity): 'compliant' | 'warning' | 'non-compliant' {
        switch (score) {
            case 'critical':
            case 'high':
                return 'non-compliant';
            case 'medium':
                return 'warning';
            default:
                return 'compliant';
        }
    }

    /**
     * Add type-specific security indicators
     */
    private addTypeSpecificIndicators(
        resource: TerraformResource,
        indicators: SecurityIndicator[],
        recommendations: SecurityRecommendation[]
    ): void {
        switch (resource.type) {
            case 'azurerm_storage_account':
                this.checkStorageAccountSecurity(resource, indicators, recommendations);
                break;
            case 'azurerm_kubernetes_cluster':
                this.checkAKSSecurity(resource, indicators, recommendations);
                break;
            case 'azurerm_mssql_server':
            case 'azurerm_sql_server':
                this.checkSQLServerSecurity(resource, indicators, recommendations);
                break;
            case 'azurerm_key_vault':
                this.checkKeyVaultSecurity(resource, indicators, recommendations);
                break;
            case 'azurerm_linux_virtual_machine':
            case 'azurerm_windows_virtual_machine':
            case 'azurerm_virtual_machine':
                this.checkVMSecurity(resource, indicators, recommendations);
                break;
        }
    }

    /**
     * Check storage account specific security
     */
    private checkStorageAccountSecurity(
        resource: TerraformResource,
        indicators: SecurityIndicator[],
        recommendations: SecurityRecommendation[]
    ): void {
        const attrs = resource.attributes || {};

        // Check for private endpoint
        if (!this.hasPrivateEndpoint(resource)) {
            indicators.push({
                id: 'storage-no-private-endpoint',
                severity: 'medium',
                category: 'network',
                title: 'No private endpoint',
                description: 'Storage account is not connected via private endpoint.',
                resourceType: resource.type,
                remediation: 'Create a private endpoint for the storage account'
            });
        }

        // Check for customer-managed keys
        if (!attrs.customer_managed_key) {
            indicators.push({
                id: 'storage-no-cmk',
                severity: 'low',
                category: 'encryption',
                title: 'No customer-managed keys',
                description: 'Storage account uses Microsoft-managed keys instead of customer-managed.',
                resourceType: resource.type,
                remediation: 'Configure customer_managed_key for enhanced key control'
            });
        }

        // Check for blob versioning
        if (!attrs.blob_properties?.versioning_enabled) {
            indicators.push({
                id: 'storage-no-versioning',
                severity: 'low',
                category: 'data-protection',
                title: 'Blob versioning disabled',
                description: 'Blob versioning is not enabled for data protection.',
                resourceType: resource.type,
                remediation: 'Enable blob_properties.versioning_enabled = true'
            });
        }
    }

    /**
     * Check AKS specific security
     */
    private checkAKSSecurity(
        resource: TerraformResource,
        indicators: SecurityIndicator[],
        recommendations: SecurityRecommendation[]
    ): void {
        const attrs = resource.attributes || {};

        // Check for AAD integration
        if (!attrs.azure_active_directory_role_based_access_control) {
            indicators.push({
                id: 'aks-no-aad',
                severity: 'medium',
                category: 'identity',
                title: 'No Azure AD integration',
                description: 'AKS cluster is not integrated with Azure AD for authentication.',
                resourceType: resource.type,
                remediation: 'Add azure_active_directory_role_based_access_control block'
            });
        }

        // Check for defender
        if (!attrs.microsoft_defender) {
            indicators.push({
                id: 'aks-no-defender',
                severity: 'medium',
                category: 'configuration',
                title: 'Microsoft Defender not enabled',
                description: 'Microsoft Defender for Containers is not enabled.',
                resourceType: resource.type,
                remediation: 'Add microsoft_defender block with log_analytics_workspace_id'
            });
        }

        // Check for secrets store CSI driver
        if (!attrs.key_vault_secrets_provider) {
            indicators.push({
                id: 'aks-no-secrets-store',
                severity: 'low',
                category: 'configuration',
                title: 'Secrets Store CSI Driver not enabled',
                description: 'Azure Key Vault Secrets Store CSI Driver is not enabled.',
                resourceType: resource.type,
                remediation: 'Add key_vault_secrets_provider block'
            });
        }
    }

    /**
     * Check SQL Server specific security
     */
    private checkSQLServerSecurity(
        resource: TerraformResource,
        indicators: SecurityIndicator[],
        recommendations: SecurityRecommendation[]
    ): void {
        const attrs = resource.attributes || {};

        // Check for transparent data encryption
        if (attrs.transparent_data_encryption_enabled === false) {
            indicators.push({
                id: 'sql-no-tde',
                severity: 'high',
                category: 'encryption',
                title: 'Transparent Data Encryption disabled',
                description: 'TDE is disabled, data at rest is not encrypted.',
                resourceType: resource.type,
                remediation: 'Set transparent_data_encryption_enabled = true'
            });
        }

        // Check for threat detection
        if (!attrs.threat_detection_policy) {
            indicators.push({
                id: 'sql-no-threat-detection',
                severity: 'medium',
                category: 'configuration',
                title: 'Threat detection not configured',
                description: 'Advanced Threat Protection is not enabled.',
                resourceType: resource.type,
                remediation: 'Add threat_detection_policy block'
            });
        }
    }

    /**
     * Check Key Vault specific security
     */
    private checkKeyVaultSecurity(
        resource: TerraformResource,
        indicators: SecurityIndicator[],
        recommendations: SecurityRecommendation[]
    ): void {
        const attrs = resource.attributes || {};

        // Check for diagnostic settings
        if (!this.hasDiagnosticSettings(resource)) {
            indicators.push({
                id: 'keyvault-no-diagnostics',
                severity: 'medium',
                category: 'logging',
                title: 'No diagnostic settings',
                description: 'Key Vault access is not being logged.',
                resourceType: resource.type,
                remediation: 'Configure diagnostic settings to log all access'
            });
        }

        // Check for access policies with overly broad permissions
        if (attrs.access_policy) {
            const policies = Array.isArray(attrs.access_policy) ? attrs.access_policy : [attrs.access_policy];
            for (const policy of policies) {
                if (policy.secret_permissions?.includes('all') ||
                    policy.key_permissions?.includes('all') ||
                    policy.certificate_permissions?.includes('all')) {
                    indicators.push({
                        id: 'keyvault-broad-permissions',
                        severity: 'medium',
                        category: 'access-control',
                        title: 'Overly broad access policy',
                        description: 'Access policy grants "all" permissions.',
                        resourceType: resource.type,
                        remediation: 'Use least-privilege access policies'
                    });
                    break;
                }
            }
        }
    }

    /**
     * Check VM specific security
     */
    private checkVMSecurity(
        resource: TerraformResource,
        indicators: SecurityIndicator[],
        recommendations: SecurityRecommendation[]
    ): void {
        const attrs = resource.attributes || {};

        // Check for boot diagnostics
        if (!attrs.boot_diagnostics) {
            indicators.push({
                id: 'vm-no-boot-diagnostics',
                severity: 'low',
                category: 'logging',
                title: 'Boot diagnostics disabled',
                description: 'VM boot diagnostics are not enabled for troubleshooting.',
                resourceType: resource.type,
                remediation: 'Add boot_diagnostics block'
            });
        }

        // Check for NSG association
        if (!this.hasNSGAssociated(resource)) {
            indicators.push({
                id: 'vm-no-nsg',
                severity: 'high',
                category: 'network',
                title: 'No NSG associated',
                description: 'VM network interface has no NSG for traffic filtering.',
                resourceType: resource.type,
                remediation: 'Associate an NSG with the network interface or subnet'
            });
        }

        // Check for password authentication (Linux)
        if (resource.type === 'azurerm_linux_virtual_machine') {
            if (attrs.disable_password_authentication === false) {
                indicators.push({
                    id: 'vm-password-auth',
                    severity: 'medium',
                    category: 'identity',
                    title: 'Password authentication enabled',
                    description: 'Linux VM allows password authentication instead of SSH keys only.',
                    resourceType: resource.type,
                    remediation: 'Set disable_password_authentication = true and use SSH keys'
                });
            }
        }
    }

    /**
     * Check if resource is encrypted
     */
    private checkEncryption(resource: TerraformResource): boolean {
        const attrs = resource.attributes || {};

        switch (resource.type) {
            case 'azurerm_storage_account':
                return attrs.enable_https_traffic_only !== false;
            case 'azurerm_mssql_database':
            case 'azurerm_sql_database':
                return attrs.transparent_data_encryption_enabled !== false;
            case 'azurerm_cosmosdb_account':
                // Cosmos DB is always encrypted at rest
                return true;
            case 'azurerm_key_vault':
                return true; // Key Vault is always encrypted
            case 'azurerm_managed_disk':
                return attrs.disk_encryption_set_id !== undefined ||
                       attrs.encryption_settings !== undefined;
            default:
                return attrs.encryption_enabled !== false;
        }
    }

    /**
     * Check if resource has public endpoint
     */
    private checkPublicEndpoint(resource: TerraformResource): boolean {
        const attrs = resource.attributes || {};

        switch (resource.type) {
            case 'azurerm_storage_account':
                return attrs.public_network_access_enabled !== false &&
                       (!attrs.network_rules || attrs.network_rules.default_action !== 'Deny');
            case 'azurerm_mssql_server':
            case 'azurerm_sql_server':
                return attrs.public_network_access_enabled !== false;
            case 'azurerm_kubernetes_cluster':
                return attrs.private_cluster_enabled !== true;
            case 'azurerm_cosmosdb_account':
                return attrs.public_network_access_enabled !== false;
            case 'azurerm_key_vault':
                return attrs.public_network_access_enabled !== false;
            case 'azurerm_container_registry':
                return attrs.public_network_access_enabled !== false;
            case 'azurerm_redis_cache':
                return attrs.public_network_access_enabled !== false;
            case 'azurerm_app_service':
            case 'azurerm_linux_web_app':
            case 'azurerm_windows_web_app':
                // App Services are public by default
                return attrs.public_network_access_enabled !== false;
            default:
                return attrs.public_network_access_enabled !== false;
        }
    }

    /**
     * Check if resource has NSG association
     */
    private checkNSGAssociation(resource: TerraformResource): boolean {
        const attrs = resource.attributes || {};

        // Resources that might have NSG
        switch (resource.type) {
            case 'azurerm_network_interface':
                return attrs.network_security_group_id !== undefined;
            case 'azurerm_subnet':
                return attrs.network_security_group_id !== undefined ||
                       this.hasNSGAssociationForSubnet(resource.name);
            case 'azurerm_linux_virtual_machine':
            case 'azurerm_windows_virtual_machine':
            case 'azurerm_virtual_machine':
                return this.hasNSGAssociated(resource);
            default:
                return true; // Not applicable
        }
    }

    /**
     * Check if VM has NSG associated through its NIC or subnet
     */
    private hasNSGAssociated(resource: TerraformResource): boolean {
        const attrs = resource.attributes || {};
        const nicIds = attrs.network_interface_ids || [];

        for (const nicId of nicIds) {
            // Extract NIC name from reference
            const match = nicId.match(/azurerm_network_interface\.([^.]+)/);
            if (match) {
                const nicName = match[1];
                const nic = this.resourceMap.get(`azurerm_network_interface_${nicName}`);
                if (nic) {
                    if (nic.attributes?.network_security_group_id) {
                        return true;
                    }
                    // Check if subnet has NSG
                    const ipConfig = nic.attributes?.ip_configuration;
                    if (ipConfig) {
                        const configs = Array.isArray(ipConfig) ? ipConfig : [ipConfig];
                        for (const cfg of configs) {
                            const subnetMatch = cfg.subnet_id?.match(/azurerm_subnet\.([^.]+)/);
                            if (subnetMatch && this.hasNSGAssociationForSubnet(subnetMatch[1])) {
                                return true;
                            }
                        }
                    }
                }
            }
        }

        return false;
    }

    /**
     * Check if subnet has NSG association
     */
    private hasNSGAssociationForSubnet(subnetName: string): boolean {
        // Look for NSG association resources
        for (const resource of this.resources) {
            if (resource.type === 'azurerm_subnet_network_security_group_association') {
                const subnetId = resource.attributes?.subnet_id;
                if (subnetId?.includes(subnetName)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Check if resource has private endpoint
     */
    private hasPrivateEndpoint(resource: TerraformResource): boolean {
        const resourceId = `${resource.type}_${resource.name}`;

        for (const r of this.resources) {
            if (r.type === 'azurerm_private_endpoint') {
                const psc = r.attributes?.private_service_connection;
                if (psc) {
                    const targetId = psc.private_connection_resource_id || psc.private_connection_resource_alias;
                    if (targetId?.includes(resource.name)) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    /**
     * Check if resource has diagnostic settings
     */
    private hasDiagnosticSettings(resource: TerraformResource): boolean {
        for (const r of this.resources) {
            if (r.type === 'azurerm_monitor_diagnostic_setting') {
                const targetId = r.attributes?.target_resource_id;
                if (targetId?.includes(resource.name)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Get missing encryption details
     */
    private getMissingEncryption(resource: TerraformResource): string[] {
        const missing: string[] = [];
        const attrs = resource.attributes || {};

        switch (resource.type) {
            case 'azurerm_storage_account':
                if (attrs.enable_https_traffic_only === false) {
                    missing.push('HTTPS traffic only');
                }
                if (!attrs.infrastructure_encryption_enabled) {
                    missing.push('Infrastructure encryption');
                }
                if (!attrs.customer_managed_key) {
                    missing.push('Customer-managed keys');
                }
                break;

            case 'azurerm_mssql_database':
            case 'azurerm_sql_database':
                if (attrs.transparent_data_encryption_enabled === false) {
                    missing.push('Transparent Data Encryption');
                }
                break;

            case 'azurerm_key_vault':
                if (!attrs.purge_protection_enabled) {
                    missing.push('Purge protection');
                }
                break;

            case 'azurerm_linux_virtual_machine':
            case 'azurerm_windows_virtual_machine':
                if (!attrs.encryption_at_host_enabled) {
                    missing.push('Encryption at host');
                }
                if (!attrs.os_disk?.disk_encryption_set_id) {
                    missing.push('OS disk encryption with CMK');
                }
                break;
        }

        return missing;
    }

    /**
     * Get public endpoints
     */
    private getPublicEndpoints(resource: TerraformResource): string[] {
        const endpoints: string[] = [];
        const attrs = resource.attributes || {};

        switch (resource.type) {
            case 'azurerm_storage_account':
                if (attrs.primary_blob_endpoint) endpoints.push(attrs.primary_blob_endpoint);
                if (attrs.primary_file_endpoint) endpoints.push(attrs.primary_file_endpoint);
                if (attrs.primary_web_endpoint) endpoints.push(attrs.primary_web_endpoint);
                break;

            case 'azurerm_app_service':
            case 'azurerm_linux_web_app':
            case 'azurerm_windows_web_app':
                const appName = attrs.name || resource.name;
                endpoints.push(`https://${appName}.azurewebsites.net`);
                break;

            case 'azurerm_function_app':
            case 'azurerm_linux_function_app':
            case 'azurerm_windows_function_app':
                const funcName = attrs.name || resource.name;
                endpoints.push(`https://${funcName}.azurewebsites.net`);
                break;

            case 'azurerm_container_registry':
                const acrName = attrs.name || resource.name;
                endpoints.push(`${acrName}.azurecr.io`);
                break;
        }

        return endpoints;
    }

    /**
     * Get NSG rules for resource
     */
    private getNSGRules(resource: TerraformResource): NSGRule[] {
        if (resource.type !== 'azurerm_network_security_group') {
            return [];
        }

        const rules: NSGRule[] = [];
        const securityRules = resource.securityRules || [];

        for (const rule of securityRules) {
            rules.push({
                name: rule.name || 'Unnamed',
                priority: rule.priority || 100,
                direction: rule.direction === 'Inbound' ? 'Inbound' : 'Outbound',
                access: rule.access === 'Allow' ? 'Allow' : 'Deny',
                protocol: rule.protocol || '*',
                sourceAddressPrefixes: rule.sourceAddressPrefix ? [rule.sourceAddressPrefix] : ['*'],
                destinationAddressPrefixes: rule.destinationAddressPrefix ? [rule.destinationAddressPrefix] : ['*'],
                sourcePortRanges: rule.sourcePortRange ? [rule.sourcePortRange] : ['*'],
                destinationPortRanges: rule.destinationPortRange ? [rule.destinationPortRange] : ['*']
            });
        }

        return rules;
    }

    /**
     * Get RBAC information
     */
    private getRBACInfo(resource: TerraformResource): RBACInfo | undefined {
        const attrs = resource.attributes || {};

        if (!attrs.identity) {
            return {
                hasManagedIdentity: false
            };
        }

        const identity = attrs.identity;
        let identityType: RBACInfo['identityType'];

        if (typeof identity === 'object') {
            if (identity.type === 'SystemAssigned') {
                identityType = 'SystemAssigned';
            } else if (identity.type === 'UserAssigned') {
                identityType = 'UserAssigned';
            } else if (identity.type?.includes('SystemAssigned') && identity.type?.includes('UserAssigned')) {
                identityType = 'SystemAssigned, UserAssigned';
            }
        }

        return {
            hasManagedIdentity: true,
            identityType
        };
    }

    /**
     * Get private endpoint information
     */
    private getPrivateEndpointInfo(resource: TerraformResource): PrivateEndpointInfo | undefined {
        for (const r of this.resources) {
            if (r.type === 'azurerm_private_endpoint') {
                const psc = r.attributes?.private_service_connection;
                if (psc) {
                    const targetId = psc.private_connection_resource_id || '';
                    if (targetId.includes(resource.name)) {
                        return {
                            hasPrivateEndpoint: true,
                            privateEndpointId: `${r.type}_${r.name}`,
                            privateEndpointName: r.name,
                            connectionState: 'Approved',
                            subnetId: r.attributes?.subnet_id
                        };
                    }
                }
            }
        }

        return {
            hasPrivateEndpoint: false
        };
    }

    /**
     * Get overall security score for all resources (0-100)
     */
    getOverallSecurityScore(postures: Map<string, SecurityPosture>): number {
        if (postures.size === 0) return 100;

        let totalWeight = 0;
        let weightedScore = 0;

        for (const posture of postures.values()) {
            const resourceScore = this.calculateResourceScore(posture);
            totalWeight += 1;
            weightedScore += resourceScore;
        }

        return Math.round(weightedScore / totalWeight);
    }

    /**
     * Calculate security score for a single resource (0-100)
     */
    private calculateResourceScore(posture: SecurityPosture): number {
        if (posture.indicators.length === 0) return 100;

        let totalDeduction = 0;

        for (const indicator of posture.indicators) {
            totalDeduction += SEVERITY_WEIGHTS[indicator.severity];
        }

        // Cap deduction at 100
        totalDeduction = Math.min(totalDeduction, 100);

        return Math.max(0, 100 - totalDeduction);
    }

    /**
     * Get security summary
     */
    getSecuritySummary(postures: Map<string, SecurityPosture>): {
        totalResources: number;
        compliantResources: number;
        warningResources: number;
        nonCompliantResources: number;
        criticalFindings: number;
        highFindings: number;
        mediumFindings: number;
        lowFindings: number;
        overallScore: number;
    } {
        let compliant = 0;
        let warning = 0;
        let nonCompliant = 0;
        let critical = 0;
        let high = 0;
        let medium = 0;
        let low = 0;

        for (const posture of postures.values()) {
            switch (posture.complianceStatus) {
                case 'compliant':
                    compliant++;
                    break;
                case 'warning':
                    warning++;
                    break;
                case 'non-compliant':
                    nonCompliant++;
                    break;
            }

            for (const indicator of posture.indicators) {
                switch (indicator.severity) {
                    case 'critical':
                        critical++;
                        break;
                    case 'high':
                        high++;
                        break;
                    case 'medium':
                        medium++;
                        break;
                    case 'low':
                        low++;
                        break;
                }
            }
        }

        return {
            totalResources: postures.size,
            compliantResources: compliant,
            warningResources: warning,
            nonCompliantResources: nonCompliant,
            criticalFindings: critical,
            highFindings: high,
            mediumFindings: medium,
            lowFindings: low,
            overallScore: this.getOverallSecurityScore(postures)
        };
    }
}
