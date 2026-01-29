// src/analyzers/networkAnalyzer.ts
import { TerraformResource } from '../terraformParser';
import {
    NetworkTopology,
    VNetInfo,
    SubnetInfo,
    VNetPeering,
    PrivateEndpointNode,
    GatewayConnection,
    NetworkInfo
} from '../types';
import { DataFlow } from '../types/devops';
import {
    NSGInfo,
    NSGRuleInfo,
    TrafficFlowInfo,
    DNSZoneInfo,
    DNSRecordInfo,
    LoadBalancerInfo,
    BackendPoolInfo,
    HealthProbeInfo,
    LoadBalancingRuleInfo,
    FrontendIPConfig,
    InboundNatRuleInfo,
    OutboundRuleInfo,
    FirewallInfo,
    ApplicationRuleCollection,
    NetworkRuleCollection,
    NatRuleCollection,
    FirewallPolicyInfo,
    ExpressRouteInfo,
    VPNGatewayInfo,
    VPNConnectionInfo,
    LocalNetworkGatewayInfo,
    AppGatewayInfo,
    NetworkingSummary
} from '../types/networking';

/**
 * Analyzes network topology from Terraform resources
 */
export class NetworkAnalyzer {
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
     * Analyze complete network topology
     */
    analyzeTopology(): NetworkTopology {
        return {
            vnets: this.analyzeVNets(),
            peerings: this.analyzePeerings(),
            privateEndpoints: this.analyzePrivateEndpoints(),
            gatewayConnections: this.analyzeGatewayConnections()
        };
    }

    /**
     * Analyze virtual networks
     */
    private analyzeVNets(): VNetInfo[] {
        const vnets: VNetInfo[] = [];

        for (const resource of this.resources) {
            if (resource.type === 'azurerm_virtual_network') {
                const attrs = resource.attributes || {};
                const vnetId = `${resource.type}_${resource.name}`;

                // Find subnets for this VNet
                const subnets = this.findSubnetsForVNet(resource.name);

                vnets.push({
                    id: vnetId,
                    name: resource.name,
                    addressSpace: this.parseAddressSpace(attrs.address_space),
                    location: attrs.location || 'unknown',
                    subnets,
                    resourceGroupId: this.extractResourceGroupId(attrs.resource_group_name)
                });
            }
        }

        return vnets;
    }

    /**
     * Find subnets for a VNet
     */
    private findSubnetsForVNet(vnetName: string): SubnetInfo[] {
        const subnets: SubnetInfo[] = [];

        for (const resource of this.resources) {
            if (resource.type === 'azurerm_subnet') {
                const attrs = resource.attributes || {};

                // Check if subnet belongs to this VNet
                const vnetRef = attrs.virtual_network_name;
                if (vnetRef && (vnetRef === vnetName || vnetRef.includes(vnetName))) {
                    const subnetId = `${resource.type}_${resource.name}`;

                    // Find resources in this subnet
                    const resourcesInSubnet = this.findResourcesInSubnet(resource.name);

                    // Find NSG association
                    const nsgId = this.findNSGForSubnet(resource.name);

                    // Find route table association
                    const routeTableId = this.findRouteTableForSubnet(resource.name);

                    subnets.push({
                        id: subnetId,
                        name: resource.name,
                        addressPrefix: this.parseAddressPrefix(attrs.address_prefixes || attrs.address_prefix),
                        nsgId,
                        routeTableId,
                        serviceEndpoints: attrs.service_endpoints,
                        delegations: this.parseDelegations(attrs.delegation),
                        privateEndpointNetworkPolicies: attrs.private_endpoint_network_policies_enabled === false ? 'Disabled' : 'Enabled',
                        resources: resourcesInSubnet
                    });
                }
            }
        }

        return subnets;
    }

    /**
     * Find resources in a subnet
     */
    private findResourcesInSubnet(subnetName: string): string[] {
        const resources: string[] = [];

        for (const resource of this.resources) {
            const attrs = resource.attributes || {};

            // Check for subnet references
            if (this.hasSubnetReference(attrs, subnetName)) {
                resources.push(`${resource.type}_${resource.name}`);
            }
        }

        return resources;
    }

    /**
     * Check if resource has a reference to a subnet
     */
    private hasSubnetReference(attrs: Record<string, any>, subnetName: string): boolean {
        // Check various subnet reference attributes
        const attrsToCheck = [
            attrs.subnet_id,
            attrs.ip_configuration,
            attrs.virtual_network_subnet_id
        ];

        for (const attr of attrsToCheck) {
            if (typeof attr === 'string' && attr.includes(subnetName)) {
                return true;
            }
            if (Array.isArray(attr)) {
                for (const item of attr) {
                    if (typeof item === 'object' && item.subnet_id?.includes(subnetName)) {
                        return true;
                    }
                }
            }
            if (typeof attr === 'object' && attr?.subnet_id?.includes(subnetName)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Find NSG for a subnet
     */
    private findNSGForSubnet(subnetName: string): string | undefined {
        // Look for NSG association
        for (const resource of this.resources) {
            if (resource.type === 'azurerm_subnet_network_security_group_association') {
                const attrs = resource.attributes || {};
                if (attrs.subnet_id?.includes(subnetName)) {
                    const nsgMatch = attrs.network_security_group_id?.match(/azurerm_network_security_group\.([^.]+)/);
                    if (nsgMatch) {
                        return `azurerm_network_security_group_${nsgMatch[1]}`;
                    }
                }
            }
        }

        // Also check subnet directly
        for (const resource of this.resources) {
            if (resource.type === 'azurerm_subnet' && resource.name === subnetName) {
                if (resource.attributes?.network_security_group_id) {
                    return resource.attributes.network_security_group_id;
                }
            }
        }

        return undefined;
    }

    /**
     * Find route table for a subnet
     */
    private findRouteTableForSubnet(subnetName: string): string | undefined {
        for (const resource of this.resources) {
            if (resource.type === 'azurerm_subnet_route_table_association') {
                const attrs = resource.attributes || {};
                if (attrs.subnet_id?.includes(subnetName)) {
                    const rtMatch = attrs.route_table_id?.match(/azurerm_route_table\.([^.]+)/);
                    if (rtMatch) {
                        return `azurerm_route_table_${rtMatch[1]}`;
                    }
                }
            }
        }

        return undefined;
    }

    /**
     * Analyze VNet peerings
     */
    private analyzePeerings(): VNetPeering[] {
        const peerings: VNetPeering[] = [];

        for (const resource of this.resources) {
            if (resource.type === 'azurerm_virtual_network_peering') {
                const attrs = resource.attributes || {};

                // Extract remote VNet information
                const remoteVnetId = attrs.remote_virtual_network_id;
                let remoteVnetName: string | undefined;
                let remoteAddressSpace: string[] | undefined;

                // Try to find remote VNet in our resources
                const remoteMatch = remoteVnetId?.match(/azurerm_virtual_network\.([^.]+)/);
                if (remoteMatch) {
                    const remoteVnet = this.resourceMap.get(`azurerm_virtual_network_${remoteMatch[1]}`);
                    if (remoteVnet) {
                        remoteVnetName = remoteVnet.name;
                        remoteAddressSpace = this.parseAddressSpace(remoteVnet.attributes?.address_space);
                    }
                }

                peerings.push({
                    name: resource.name,
                    remoteVnetId: remoteVnetId || '',
                    remoteVnetName,
                    remoteAddressSpace,
                    allowVirtualNetworkAccess: attrs.allow_virtual_network_access !== false,
                    allowForwardedTraffic: attrs.allow_forwarded_traffic === true,
                    allowGatewayTransit: attrs.allow_gateway_transit === true,
                    useRemoteGateways: attrs.use_remote_gateways === true,
                    peeringState: 'Connected'
                });
            }
        }

        return peerings;
    }

    /**
     * Analyze private endpoints
     */
    private analyzePrivateEndpoints(): PrivateEndpointNode[] {
        const endpoints: PrivateEndpointNode[] = [];

        for (const resource of this.resources) {
            if (resource.type === 'azurerm_private_endpoint') {
                const attrs = resource.attributes || {};
                const psc = attrs.private_service_connection;

                let targetResourceId = '';
                let targetResourceType = '';
                let groupIds: string[] = [];

                if (psc) {
                    targetResourceId = psc.private_connection_resource_id || psc.private_connection_resource_alias || '';
                    groupIds = psc.subresource_names || [];

                    // Extract target resource type from ID
                    const typeMatch = targetResourceId.match(/azurerm_([^.]+)\./);
                    if (typeMatch) {
                        targetResourceType = `azurerm_${typeMatch[1]}`;
                    }
                }

                // Get subnet ID
                let subnetId = attrs.subnet_id || '';
                const subnetMatch = subnetId.match(/azurerm_subnet\.([^.]+)/);
                if (subnetMatch) {
                    subnetId = `azurerm_subnet_${subnetMatch[1]}`;
                }

                // Get private DNS zones
                const privateDnsZones: string[] = [];
                if (attrs.private_dns_zone_group) {
                    const zoneGroup = attrs.private_dns_zone_group;
                    const zoneIds = zoneGroup.private_dns_zone_ids || [];
                    for (const zoneId of zoneIds) {
                        const zoneMatch = zoneId.match(/azurerm_private_dns_zone\.([^.]+)/);
                        if (zoneMatch) {
                            privateDnsZones.push(`azurerm_private_dns_zone_${zoneMatch[1]}`);
                        }
                    }
                }

                endpoints.push({
                    id: `${resource.type}_${resource.name}`,
                    name: resource.name,
                    subnetId,
                    targetResourceId,
                    targetResourceType,
                    groupIds,
                    privateDnsZones
                });
            }
        }

        return endpoints;
    }

    /**
     * Analyze gateway connections
     */
    private analyzeGatewayConnections(): GatewayConnection[] {
        const connections: GatewayConnection[] = [];

        for (const resource of this.resources) {
            if (resource.type === 'azurerm_virtual_network_gateway_connection') {
                const attrs = resource.attributes || {};

                let connectionType: GatewayConnection['type'] = 'VPN';
                if (attrs.type === 'ExpressRoute') {
                    connectionType = 'ExpressRoute';
                } else if (attrs.type === 'Vnet2Vnet') {
                    connectionType = 'VNetPeering';
                }

                // Extract source and target
                let sourceId = attrs.virtual_network_gateway_id || '';
                let targetId = attrs.peer_virtual_network_gateway_id ||
                               attrs.express_route_circuit_id ||
                               attrs.local_network_gateway_id || '';

                connections.push({
                    id: `${resource.type}_${resource.name}`,
                    name: resource.name,
                    type: connectionType,
                    sourceId,
                    targetId,
                    status: 'Connected'
                });
            }

            // Also check for ExpressRoute circuits
            if (resource.type === 'azurerm_express_route_circuit') {
                const attrs = resource.attributes || {};

                connections.push({
                    id: `${resource.type}_${resource.name}`,
                    name: resource.name,
                    type: 'ExpressRoute',
                    sourceId: `${resource.type}_${resource.name}`,
                    targetId: attrs.service_provider_name || 'Provider',
                    status: 'Connected'
                });
            }
        }

        return connections;
    }

    /**
     * Analyze data flows between resources
     */
    analyzeDataFlows(): DataFlow[] {
        const flows: DataFlow[] = [];

        // Analyze common data flow patterns
        for (const resource of this.resources) {
            const resourceId = `${resource.type}_${resource.name}`;
            const deps = resource.dependencies || [];

            for (const depId of deps) {
                const depResource = this.resourceMap.get(depId);
                if (!depResource) continue;

                // Determine flow type based on resource types
                const flowType = this.determineFlowType(resource.type, depResource.type);
                if (flowType) {
                    flows.push({
                        sourceId: resourceId,
                        targetId: depId,
                        flowType: flowType.type,
                        direction: flowType.direction,
                        dataType: flowType.dataType,
                        label: flowType.label
                    });
                }
            }
        }

        // Add specific pattern-based flows
        this.addPatternBasedFlows(flows);

        return flows;
    }

    /**
     * Determine flow type based on resource types
     */
    private determineFlowType(sourceType: string, targetType: string): {
        type: DataFlow['flowType'];
        direction: DataFlow['direction'];
        dataType?: string;
        label?: string;
    } | null {
        // App -> Database patterns
        if (this.isComputeResource(sourceType) && this.isDatabaseResource(targetType)) {
            return {
                type: 'data',
                direction: 'bidirectional',
                dataType: 'sql',
                label: 'SQL'
            };
        }

        // App -> Storage patterns
        if (this.isComputeResource(sourceType) && targetType === 'azurerm_storage_account') {
            return {
                type: 'data',
                direction: 'bidirectional',
                dataType: 'blob',
                label: 'Storage'
            };
        }

        // App -> Redis patterns
        if (this.isComputeResource(sourceType) && targetType === 'azurerm_redis_cache') {
            return {
                type: 'data',
                direction: 'bidirectional',
                dataType: 'cache',
                label: 'Cache'
            };
        }

        // App -> Key Vault patterns
        if (this.isComputeResource(sourceType) && targetType === 'azurerm_key_vault') {
            return {
                type: 'control',
                direction: 'unidirectional',
                dataType: 'secrets',
                label: 'Secrets'
            };
        }

        // App -> Event Hub / Service Bus patterns
        if (this.isComputeResource(sourceType) &&
            (targetType === 'azurerm_eventhub_namespace' || targetType === 'azurerm_servicebus_namespace')) {
            return {
                type: 'event',
                direction: 'bidirectional',
                dataType: 'messages',
                label: 'Events'
            };
        }

        // App -> Log Analytics patterns
        if (this.isComputeResource(sourceType) && targetType === 'azurerm_log_analytics_workspace') {
            return {
                type: 'data',
                direction: 'unidirectional',
                dataType: 'logs',
                label: 'Logs'
            };
        }

        // ACR -> AKS patterns
        if (targetType === 'azurerm_container_registry' && sourceType === 'azurerm_kubernetes_cluster') {
            return {
                type: 'data',
                direction: 'unidirectional',
                dataType: 'images',
                label: 'Pull'
            };
        }

        return null;
    }

    /**
     * Check if resource type is a compute resource
     */
    private isComputeResource(type: string): boolean {
        return [
            'azurerm_virtual_machine',
            'azurerm_linux_virtual_machine',
            'azurerm_windows_virtual_machine',
            'azurerm_app_service',
            'azurerm_linux_web_app',
            'azurerm_windows_web_app',
            'azurerm_function_app',
            'azurerm_linux_function_app',
            'azurerm_windows_function_app',
            'azurerm_kubernetes_cluster',
            'azurerm_container_group'
        ].includes(type);
    }

    /**
     * Check if resource type is a database resource
     */
    private isDatabaseResource(type: string): boolean {
        return [
            'azurerm_sql_server',
            'azurerm_sql_database',
            'azurerm_mssql_server',
            'azurerm_mssql_database',
            'azurerm_postgresql_server',
            'azurerm_postgresql_flexible_server',
            'azurerm_mysql_server',
            'azurerm_mysql_flexible_server',
            'azurerm_cosmosdb_account'
        ].includes(type);
    }

    /**
     * Add pattern-based flows (e.g., implicit connections)
     */
    private addPatternBasedFlows(flows: DataFlow[]): void {
        // Find ACR -> AKS connections
        const acrs = this.resources.filter(r => r.type === 'azurerm_container_registry');
        const aksClusters = this.resources.filter(r => r.type === 'azurerm_kubernetes_cluster');

        for (const aks of aksClusters) {
            const attrs = aks.attributes || {};

            // Check for ACR attachment
            if (attrs.oidc_issuer_enabled || attrs.workload_identity_enabled) {
                // AKS with workload identity might pull from ACR
                for (const acr of acrs) {
                    flows.push({
                        sourceId: `${aks.type}_${aks.name}`,
                        targetId: `${acr.type}_${acr.name}`,
                        flowType: 'data',
                        direction: 'unidirectional',
                        dataType: 'images',
                        label: 'Pull Images'
                    });
                }
            }
        }

        // Find App -> Application Insights connections
        const appInsights = this.resources.filter(r => r.type === 'azurerm_application_insights');
        const apps = this.resources.filter(r =>
            r.type.includes('web_app') ||
            r.type.includes('function_app') ||
            r.type === 'azurerm_app_service'
        );

        for (const app of apps) {
            const attrs = app.attributes || {};
            const siteConfig = attrs.site_config || {};

            // Check for app insights reference in app settings
            if (attrs.app_settings?.APPINSIGHTS_INSTRUMENTATIONKEY ||
                attrs.app_settings?.APPLICATIONINSIGHTS_CONNECTION_STRING) {
                for (const ai of appInsights) {
                    flows.push({
                        sourceId: `${app.type}_${app.name}`,
                        targetId: `${ai.type}_${ai.name}`,
                        flowType: 'data',
                        direction: 'unidirectional',
                        dataType: 'metrics',
                        label: 'Telemetry'
                    });
                }
            }
        }
    }

    /**
     * Get network information for a specific resource
     */
    getNetworkInfo(resource: TerraformResource): NetworkInfo {
        const attrs = resource.attributes || {};
        const info: NetworkInfo = {};

        switch (resource.type) {
            case 'azurerm_virtual_network':
                info.addressSpace = this.parseAddressSpace(attrs.address_space);
                break;

            case 'azurerm_subnet':
                info.addressPrefix = this.parseAddressPrefix(attrs.address_prefixes || attrs.address_prefix);
                info.vnetId = this.extractVNetId(attrs.virtual_network_name);
                break;

            case 'azurerm_network_interface':
                const ipConfig = attrs.ip_configuration;
                if (ipConfig) {
                    const configs = Array.isArray(ipConfig) ? ipConfig : [ipConfig];
                    const primary = configs[0];
                    if (primary) {
                        info.privateIpAddress = primary.private_ip_address;
                        info.subnetId = primary.subnet_id;
                    }
                }
                break;

            case 'azurerm_public_ip':
                info.publicIpAddress = attrs.ip_address;
                break;

            case 'azurerm_private_endpoint':
                const psc = attrs.private_service_connection;
                if (psc) {
                    info.privateIpAddress = psc.private_ip_address;
                }
                info.subnetId = attrs.subnet_id;
                break;
        }

        return info;
    }

    /**
     * Parse address space
     */
    private parseAddressSpace(addressSpace: any): string[] {
        if (!addressSpace) return [];
        if (Array.isArray(addressSpace)) return addressSpace;
        if (typeof addressSpace === 'string') return [addressSpace];
        return [];
    }

    /**
     * Parse address prefix
     */
    private parseAddressPrefix(prefix: any): string {
        if (!prefix) return '';
        if (Array.isArray(prefix)) return prefix[0] || '';
        return prefix;
    }

    /**
     * Parse delegations
     */
    private parseDelegations(delegation: any): string[] {
        if (!delegation) return [];
        const delegations = Array.isArray(delegation) ? delegation : [delegation];
        return delegations.map(d => d.name).filter(Boolean);
    }

    /**
     * Extract resource group ID from name reference
     */
    private extractResourceGroupId(rgName: any): string | undefined {
        if (!rgName) return undefined;
        if (typeof rgName === 'string' && rgName.includes('azurerm_resource_group.')) {
            const match = rgName.match(/azurerm_resource_group\.([^.]+)/);
            if (match) {
                return `azurerm_resource_group_${match[1]}`;
            }
        }
        return undefined;
    }

    /**
     * Extract VNet ID from name reference
     */
    private extractVNetId(vnetName: any): string | undefined {
        if (!vnetName) return undefined;
        if (typeof vnetName === 'string') {
            if (vnetName.includes('azurerm_virtual_network.')) {
                const match = vnetName.match(/azurerm_virtual_network\.([^.]+)/);
                if (match) {
                    return `azurerm_virtual_network_${match[1]}`;
                }
            }
            // Direct name reference
            return `azurerm_virtual_network_${vnetName}`;
        }
        return undefined;
    }

    /**
     * Get network topology summary
     */
    getTopologySummary(): {
        vnetCount: number;
        subnetCount: number;
        peeringCount: number;
        privateEndpointCount: number;
        gatewayCount: number;
        totalAddressSpaces: string[];
    } {
        const topology = this.analyzeTopology();

        const allAddressSpaces: string[] = [];
        for (const vnet of topology.vnets) {
            allAddressSpaces.push(...vnet.addressSpace);
        }

        let subnetCount = 0;
        for (const vnet of topology.vnets) {
            subnetCount += vnet.subnets.length;
        }

        return {
            vnetCount: topology.vnets.length,
            subnetCount,
            peeringCount: topology.peerings.length,
            privateEndpointCount: topology.privateEndpoints.length,
            gatewayCount: topology.gatewayConnections.length,
            totalAddressSpaces: allAddressSpaces
        };
    }

    // ============================================
    // NETWORKING DEEP DIVE FEATURES
    // ============================================

    /**
     * Get complete networking summary for deep dive
     */
    getNetworkingSummary(): NetworkingSummary {
        const nsgs = this.analyzeNSGs();
        const trafficFlows = this.analyzeTrafficFlows();
        const dnsZones = this.analyzeDNSZones();
        const loadBalancers = this.analyzeLoadBalancers();
        const appGateways = this.analyzeAppGateways();
        const firewalls = this.analyzeFirewalls();
        const firewallPolicies = this.analyzeFirewallPolicies();
        const expressRoutes = this.analyzeExpressRoutes();
        const vpnGateways = this.analyzeVPNGateways();

        // Calculate totals
        let totalNSGRules = 0;
        nsgs.forEach(nsg => totalNSGRules += nsg.rules.length);

        let totalDNSRecords = 0;
        dnsZones.forEach(zone => totalDNSRecords += zone.records.length);

        let totalLBRules = 0;
        loadBalancers.forEach(lb => totalLBRules += lb.loadBalancingRules.length);

        let totalFirewallRules = 0;
        firewalls.forEach(fw => {
            fw.applicationRuleCollections.forEach(c => totalFirewallRules += c.rules.length);
            fw.networkRuleCollections.forEach(c => totalFirewallRules += c.rules.length);
            fw.natRuleCollections.forEach(c => totalFirewallRules += c.rules.length);
        });

        const hybridConnections = expressRoutes.length + vpnGateways.length;

        return {
            nsgs,
            trafficFlows,
            dnsZones,
            loadBalancers,
            appGateways,
            firewalls,
            firewallPolicies,
            expressRoutes,
            vpnGateways,
            totalNSGRules,
            totalDNSRecords,
            totalLBRules,
            totalFirewallRules,
            hybridConnections
        };
    }

    // ============================================
    // NSG RULES VISUALIZATION
    // ============================================

    /**
     * Analyze all NSGs and their rules
     */
    analyzeNSGs(): NSGInfo[] {
        const nsgs: NSGInfo[] = [];

        for (const resource of this.resources) {
            if (resource.type === 'azurerm_network_security_group') {
                const attrs = resource.attributes || {};
                const nsgId = `${resource.type}_${resource.name}`;

                // Get inline rules
                const inlineRules = this.parseInlineSecurityRules(attrs.security_rule);

                // Get separate rule resources
                const separateRules = this.findSeparateNSGRules(resource.name);

                const allRules = [...inlineRules, ...separateRules];

                // Separate inbound and outbound
                const inboundRules = allRules.filter(r => r.direction === 'Inbound')
                    .sort((a, b) => a.priority - b.priority);
                const outboundRules = allRules.filter(r => r.direction === 'Outbound')
                    .sort((a, b) => a.priority - b.priority);

                // Find associated subnets and NICs
                const associatedSubnets = this.findSubnetsAssociatedWithNSG(resource.name);
                const associatedNICs = this.findNICsAssociatedWithNSG(resource.name);

                nsgs.push({
                    id: nsgId,
                    name: resource.name,
                    resourceGroup: this.extractResourceGroupName(attrs.resource_group_name),
                    rules: allRules,
                    inboundRules,
                    outboundRules,
                    associatedSubnets,
                    associatedNICs,
                    defaultRules: this.getDefaultNSGRules()
                });
            }
        }

        return nsgs;
    }

    /**
     * Parse inline security rules from NSG resource
     */
    private parseInlineSecurityRules(securityRules: any): NSGRuleInfo[] {
        if (!securityRules) return [];

        const rules = Array.isArray(securityRules) ? securityRules : [securityRules];
        return rules.map(rule => this.parseSecurityRule(rule)).filter(Boolean) as NSGRuleInfo[];
    }

    /**
     * Parse a single security rule
     */
    private parseSecurityRule(rule: any): NSGRuleInfo | null {
        if (!rule) return null;

        return {
            name: rule.name || 'unnamed',
            priority: parseInt(rule.priority) || 100,
            direction: rule.direction === 'Outbound' ? 'Outbound' : 'Inbound',
            access: rule.access === 'Deny' ? 'Deny' : 'Allow',
            protocol: rule.protocol || '*',
            sourcePortRange: rule.source_port_range || '*',
            destinationPortRange: rule.destination_port_range || '*',
            sourceAddressPrefix: rule.source_address_prefix || '*',
            destinationAddressPrefix: rule.destination_address_prefix || '*',
            sourceAddressPrefixes: rule.source_address_prefixes,
            destinationAddressPrefixes: rule.destination_address_prefixes,
            sourceApplicationSecurityGroups: rule.source_application_security_group_ids,
            destinationApplicationSecurityGroups: rule.destination_application_security_group_ids,
            description: rule.description
        };
    }

    /**
     * Find separate NSG rule resources
     */
    private findSeparateNSGRules(nsgName: string): NSGRuleInfo[] {
        const rules: NSGRuleInfo[] = [];

        for (const resource of this.resources) {
            if (resource.type === 'azurerm_network_security_rule') {
                const attrs = resource.attributes || {};

                // Check if this rule belongs to our NSG
                const nsgRef = attrs.network_security_group_name;
                if (nsgRef && (nsgRef === nsgName || nsgRef.includes(nsgName))) {
                    const rule = this.parseSecurityRule({
                        name: attrs.name || resource.name,
                        priority: attrs.priority,
                        direction: attrs.direction,
                        access: attrs.access,
                        protocol: attrs.protocol,
                        source_port_range: attrs.source_port_range,
                        source_port_ranges: attrs.source_port_ranges,
                        destination_port_range: attrs.destination_port_range,
                        destination_port_ranges: attrs.destination_port_ranges,
                        source_address_prefix: attrs.source_address_prefix,
                        source_address_prefixes: attrs.source_address_prefixes,
                        destination_address_prefix: attrs.destination_address_prefix,
                        destination_address_prefixes: attrs.destination_address_prefixes,
                        description: attrs.description
                    });
                    if (rule) rules.push(rule);
                }
            }
        }

        return rules;
    }

    /**
     * Find subnets associated with an NSG
     */
    private findSubnetsAssociatedWithNSG(nsgName: string): string[] {
        const subnets: string[] = [];

        for (const resource of this.resources) {
            if (resource.type === 'azurerm_subnet_network_security_group_association') {
                const attrs = resource.attributes || {};
                if (attrs.network_security_group_id?.includes(nsgName)) {
                    const subnetMatch = attrs.subnet_id?.match(/azurerm_subnet\.([^.]+)/);
                    if (subnetMatch) {
                        subnets.push(subnetMatch[1]);
                    }
                }
            }
        }

        return subnets;
    }

    /**
     * Find NICs associated with an NSG
     */
    private findNICsAssociatedWithNSG(nsgName: string): string[] {
        const nics: string[] = [];

        for (const resource of this.resources) {
            if (resource.type === 'azurerm_network_interface') {
                const attrs = resource.attributes || {};
                if (attrs.network_security_group_id?.includes(nsgName)) {
                    nics.push(resource.name);
                }
            }

            if (resource.type === 'azurerm_network_interface_security_group_association') {
                const attrs = resource.attributes || {};
                if (attrs.network_security_group_id?.includes(nsgName)) {
                    const nicMatch = attrs.network_interface_id?.match(/azurerm_network_interface\.([^.]+)/);
                    if (nicMatch) {
                        nics.push(nicMatch[1]);
                    }
                }
            }
        }

        return nics;
    }

    /**
     * Get default Azure NSG rules (for reference)
     */
    private getDefaultNSGRules(): NSGRuleInfo[] {
        return [
            {
                name: 'AllowVnetInBound',
                priority: 65000,
                direction: 'Inbound',
                access: 'Allow',
                protocol: '*',
                sourcePortRange: '*',
                destinationPortRange: '*',
                sourceAddressPrefix: 'VirtualNetwork',
                destinationAddressPrefix: 'VirtualNetwork'
            },
            {
                name: 'AllowAzureLoadBalancerInBound',
                priority: 65001,
                direction: 'Inbound',
                access: 'Allow',
                protocol: '*',
                sourcePortRange: '*',
                destinationPortRange: '*',
                sourceAddressPrefix: 'AzureLoadBalancer',
                destinationAddressPrefix: '*'
            },
            {
                name: 'DenyAllInBound',
                priority: 65500,
                direction: 'Inbound',
                access: 'Deny',
                protocol: '*',
                sourcePortRange: '*',
                destinationPortRange: '*',
                sourceAddressPrefix: '*',
                destinationAddressPrefix: '*'
            },
            {
                name: 'AllowVnetOutBound',
                priority: 65000,
                direction: 'Outbound',
                access: 'Allow',
                protocol: '*',
                sourcePortRange: '*',
                destinationPortRange: '*',
                sourceAddressPrefix: 'VirtualNetwork',
                destinationAddressPrefix: 'VirtualNetwork'
            },
            {
                name: 'AllowInternetOutBound',
                priority: 65001,
                direction: 'Outbound',
                access: 'Allow',
                protocol: '*',
                sourcePortRange: '*',
                destinationPortRange: '*',
                sourceAddressPrefix: '*',
                destinationAddressPrefix: 'Internet'
            },
            {
                name: 'DenyAllOutBound',
                priority: 65500,
                direction: 'Outbound',
                access: 'Deny',
                protocol: '*',
                sourcePortRange: '*',
                destinationPortRange: '*',
                sourceAddressPrefix: '*',
                destinationAddressPrefix: '*'
            }
        ];
    }

    // ============================================
    // TRAFFIC FLOW DIAGRAM
    // ============================================

    /**
     * Analyze traffic flows between resources based on NSG rules
     */
    analyzeTrafficFlows(): TrafficFlowInfo[] {
        const flows: TrafficFlowInfo[] = [];
        const nsgs = this.analyzeNSGs();

        // Analyze flows based on resource connections and NSG rules
        for (const resource of this.resources) {
            const resourceId = `${resource.type}_${resource.name}`;
            const deps = resource.dependencies || [];

            // Get NSG for this resource
            const resourceNSG = this.findNSGForResource(resource);

            for (const depId of deps) {
                const depResource = this.resourceMap.get(depId);
                if (!depResource) continue;

                // Determine if traffic is allowed
                const flowInfo = this.determineTrafficFlow(resource, depResource, nsgs, resourceNSG);
                if (flowInfo) {
                    flows.push(flowInfo);
                }
            }
        }

        // Add implicit flows (web traffic, management, etc.)
        this.addImplicitTrafficFlows(flows, nsgs);

        return flows;
    }

    /**
     * Determine traffic flow between two resources
     */
    private determineTrafficFlow(
        source: TerraformResource,
        target: TerraformResource,
        nsgs: NSGInfo[],
        sourceNSG?: NSGInfo
    ): TrafficFlowInfo | null {
        const sourceId = `${source.type}_${source.name}`;
        const targetId = `${target.type}_${target.name}`;

        // Determine ports and protocol based on resource types
        const { ports, protocol, flowType } = this.inferTrafficDetails(source.type, target.type);

        if (ports.length === 0) return null;

        // Check if traffic is allowed by NSG
        let allowed = true;
        let nsgRule: string | undefined;

        if (sourceNSG) {
            const ruleCheck = this.checkNSGAllowsTraffic(sourceNSG, ports, protocol, 'Outbound');
            allowed = ruleCheck.allowed;
            nsgRule = ruleCheck.ruleName;
        }

        return {
            sourceId,
            sourceName: source.name,
            sourceType: source.type,
            targetId,
            targetName: target.name,
            targetType: target.type,
            ports,
            protocol,
            direction: 'outbound',
            allowed,
            nsgRule,
            flowType
        };
    }

    /**
     * Infer traffic details based on resource types
     */
    private inferTrafficDetails(sourceType: string, targetType: string): {
        ports: string[];
        protocol: string;
        flowType: TrafficFlowInfo['flowType'];
    } {
        // Database connections
        if (this.isDatabaseResource(targetType)) {
            if (targetType.includes('sql') || targetType.includes('mssql')) {
                return { ports: ['1433'], protocol: 'Tcp', flowType: 'data' };
            }
            if (targetType.includes('postgresql')) {
                return { ports: ['5432'], protocol: 'Tcp', flowType: 'data' };
            }
            if (targetType.includes('mysql')) {
                return { ports: ['3306'], protocol: 'Tcp', flowType: 'data' };
            }
            if (targetType.includes('cosmosdb')) {
                return { ports: ['443', '10255'], protocol: 'Tcp', flowType: 'data' };
            }
        }

        // Cache connections
        if (targetType === 'azurerm_redis_cache') {
            return { ports: ['6379', '6380'], protocol: 'Tcp', flowType: 'data' };
        }

        // Storage connections
        if (targetType === 'azurerm_storage_account') {
            return { ports: ['443'], protocol: 'Tcp', flowType: 'data' };
        }

        // Key Vault
        if (targetType === 'azurerm_key_vault') {
            return { ports: ['443'], protocol: 'Tcp', flowType: 'management' };
        }

        // Event Hub / Service Bus
        if (targetType.includes('eventhub') || targetType.includes('servicebus')) {
            return { ports: ['443', '5671', '5672'], protocol: 'Tcp', flowType: 'data' };
        }

        // Web traffic
        if (targetType.includes('web_app') || targetType.includes('app_service') ||
            targetType.includes('function_app')) {
            return { ports: ['443', '80'], protocol: 'Tcp', flowType: 'application' };
        }

        return { ports: [], protocol: '*', flowType: 'application' };
    }

    /**
     * Find NSG for a resource
     */
    private findNSGForResource(resource: TerraformResource): NSGInfo | undefined {
        const nsgs = this.analyzeNSGs();

        // Check for NIC-level NSG
        if (resource.attributes?.network_security_group_id) {
            const nsgName = this.extractNameFromRef(resource.attributes.network_security_group_id);
            return nsgs.find(n => n.name === nsgName);
        }

        // Check for subnet-level NSG
        const subnetName = this.findSubnetForResource(resource);
        if (subnetName) {
            for (const nsg of nsgs) {
                if (nsg.associatedSubnets.includes(subnetName)) {
                    return nsg;
                }
            }
        }

        return undefined;
    }

    /**
     * Find subnet for a resource
     */
    private findSubnetForResource(resource: TerraformResource): string | undefined {
        const attrs = resource.attributes || {};

        // Check various subnet reference attributes
        if (attrs.subnet_id) {
            return this.extractNameFromRef(attrs.subnet_id);
        }

        if (attrs.ip_configuration) {
            const ipConfigs = Array.isArray(attrs.ip_configuration)
                ? attrs.ip_configuration : [attrs.ip_configuration];
            for (const config of ipConfigs) {
                if (config?.subnet_id) {
                    return this.extractNameFromRef(config.subnet_id);
                }
            }
        }

        return undefined;
    }

    /**
     * Check if NSG allows traffic on specified ports
     */
    private checkNSGAllowsTraffic(
        nsg: NSGInfo,
        ports: string[],
        protocol: string,
        direction: 'Inbound' | 'Outbound'
    ): { allowed: boolean; ruleName?: string } {
        const rules = direction === 'Inbound' ? nsg.inboundRules : nsg.outboundRules;

        // Check rules in priority order
        for (const rule of rules) {
            if (this.ruleMatchesTraffic(rule, ports, protocol)) {
                return {
                    allowed: rule.access === 'Allow',
                    ruleName: rule.name
                };
            }
        }

        // Default deny
        return { allowed: false, ruleName: direction === 'Inbound' ? 'DenyAllInBound' : 'DenyAllOutBound' };
    }

    /**
     * Check if a rule matches the traffic
     */
    private ruleMatchesTraffic(rule: NSGRuleInfo, ports: string[], protocol: string): boolean {
        // Check protocol
        if (rule.protocol !== '*' && rule.protocol.toLowerCase() !== protocol.toLowerCase()) {
            return false;
        }

        // Check destination port
        const destPort = rule.destinationPortRange;
        if (destPort === '*') return true;

        for (const port of ports) {
            if (destPort === port) return true;
            if (destPort.includes('-')) {
                const [start, end] = destPort.split('-').map(p => parseInt(p));
                const portNum = parseInt(port);
                if (portNum >= start && portNum <= end) return true;
            }
        }

        return false;
    }

    /**
     * Add implicit traffic flows
     */
    private addImplicitTrafficFlows(flows: TrafficFlowInfo[], nsgs: NSGInfo[]): void {
        // Add internet-facing flows for public resources
        for (const resource of this.resources) {
            if (resource.type === 'azurerm_public_ip') {
                const attrs = resource.attributes || {};
                flows.push({
                    sourceId: 'Internet',
                    sourceName: 'Internet',
                    sourceType: 'external',
                    targetId: `${resource.type}_${resource.name}`,
                    targetName: resource.name,
                    targetType: resource.type,
                    ports: ['*'],
                    protocol: '*',
                    direction: 'inbound',
                    allowed: true,
                    flowType: 'application',
                    description: 'Public IP - Internet accessible'
                });
            }
        }
    }

    /**
     * Extract name from Terraform reference
     */
    private extractNameFromRef(ref: string): string | undefined {
        if (!ref) return undefined;
        const match = ref.match(/azurerm_[^.]+\.([^.]+)/);
        return match ? match[1] : ref;
    }

    // ============================================
    // DNS RESOLUTION
    // ============================================

    /**
     * Analyze DNS zones and records
     */
    analyzeDNSZones(): DNSZoneInfo[] {
        const zones: DNSZoneInfo[] = [];

        // Public DNS zones
        for (const resource of this.resources) {
            if (resource.type === 'azurerm_dns_zone') {
                const attrs = resource.attributes || {};
                const records = this.findDNSRecordsForZone(resource.name, 'public');

                zones.push({
                    id: `${resource.type}_${resource.name}`,
                    name: attrs.name || resource.name,
                    zoneType: 'Public',
                    resourceGroup: this.extractResourceGroupName(attrs.resource_group_name),
                    records,
                    soaRecord: attrs.soa_record ? {
                        email: attrs.soa_record.email,
                        hostName: attrs.soa_record.host_name,
                        refreshTime: attrs.soa_record.refresh_time,
                        retryTime: attrs.soa_record.retry_time,
                        expireTime: attrs.soa_record.expire_time,
                        minimumTtl: attrs.soa_record.minimum_ttl
                    } : undefined
                });
            }

            // Private DNS zones
            if (resource.type === 'azurerm_private_dns_zone') {
                const attrs = resource.attributes || {};
                const records = this.findDNSRecordsForZone(resource.name, 'private');
                const linkedVNets = this.findVNetLinksForPrivateDNS(resource.name);

                zones.push({
                    id: `${resource.type}_${resource.name}`,
                    name: attrs.name || resource.name,
                    zoneType: 'Private',
                    resourceGroup: this.extractResourceGroupName(attrs.resource_group_name),
                    records,
                    linkedVNets
                });
            }
        }

        return zones;
    }

    /**
     * Find DNS records for a zone
     */
    private findDNSRecordsForZone(zoneName: string, zoneType: 'public' | 'private'): DNSRecordInfo[] {
        const records: DNSRecordInfo[] = [];
        const prefix = zoneType === 'public' ? 'azurerm_dns' : 'azurerm_private_dns';

        const recordTypes = ['a_record', 'aaaa_record', 'cname_record', 'mx_record',
            'ns_record', 'ptr_record', 'srv_record', 'txt_record'];

        for (const resource of this.resources) {
            for (const recordType of recordTypes) {
                if (resource.type === `${prefix}_${recordType}`) {
                    const attrs = resource.attributes || {};
                    const zoneRef = attrs.zone_name || attrs.private_dns_zone_name;

                    if (zoneRef && (zoneRef === zoneName || zoneRef.includes(zoneName))) {
                        const record = this.parseDNSRecord(resource, recordType);
                        if (record) records.push(record);
                    }
                }
            }
        }

        return records;
    }

    /**
     * Parse DNS record
     */
    private parseDNSRecord(resource: TerraformResource, recordType: string): DNSRecordInfo | null {
        const attrs = resource.attributes || {};
        const typeMap: Record<string, DNSRecordInfo['type']> = {
            'a_record': 'A',
            'aaaa_record': 'AAAA',
            'cname_record': 'CNAME',
            'mx_record': 'MX',
            'ns_record': 'NS',
            'ptr_record': 'PTR',
            'srv_record': 'SRV',
            'txt_record': 'TXT'
        };

        const type = typeMap[recordType];
        if (!type) return null;

        let values: string[] = [];

        switch (type) {
            case 'A':
                values = attrs.records || [];
                break;
            case 'AAAA':
                values = attrs.records || [];
                break;
            case 'CNAME':
                values = attrs.record ? [attrs.record] : [];
                break;
            case 'MX':
                if (attrs.record) {
                    const mxRecords = Array.isArray(attrs.record) ? attrs.record : [attrs.record];
                    values = mxRecords.map((r: any) => `${r.preference} ${r.exchange}`);
                }
                break;
            case 'TXT':
                if (attrs.record) {
                    const txtRecords = Array.isArray(attrs.record) ? attrs.record : [attrs.record];
                    values = txtRecords.map((r: any) => r.value);
                }
                break;
            default:
                values = attrs.records || [];
        }

        return {
            name: attrs.name || resource.name,
            type,
            ttl: attrs.ttl || 300,
            values,
            targetResourceId: attrs.target_resource_id
        };
    }

    /**
     * Find VNet links for private DNS zone
     */
    private findVNetLinksForPrivateDNS(zoneName: string): string[] {
        const links: string[] = [];

        for (const resource of this.resources) {
            if (resource.type === 'azurerm_private_dns_zone_virtual_network_link') {
                const attrs = resource.attributes || {};
                const zoneRef = attrs.private_dns_zone_name;

                if (zoneRef && (zoneRef === zoneName || zoneRef.includes(zoneName))) {
                    const vnetRef = attrs.virtual_network_id;
                    const vnetName = this.extractNameFromRef(vnetRef);
                    if (vnetName) links.push(vnetName);
                }
            }
        }

        return links;
    }

    // ============================================
    // LOAD BALANCER RULES
    // ============================================

    /**
     * Analyze load balancers
     */
    analyzeLoadBalancers(): LoadBalancerInfo[] {
        const loadBalancers: LoadBalancerInfo[] = [];

        for (const resource of this.resources) {
            if (resource.type === 'azurerm_lb') {
                const attrs = resource.attributes || {};
                const lbName = resource.name;

                loadBalancers.push({
                    id: `${resource.type}_${resource.name}`,
                    name: lbName,
                    sku: attrs.sku || 'Basic',
                    tier: attrs.sku_tier,
                    resourceGroup: this.extractResourceGroupName(attrs.resource_group_name),
                    frontendIPs: this.parseFrontendIPConfigs(attrs.frontend_ip_configuration),
                    backendPools: this.findBackendPools(lbName),
                    healthProbes: this.findHealthProbes(lbName),
                    loadBalancingRules: this.findLoadBalancingRules(lbName),
                    inboundNatRules: this.findInboundNatRules(lbName),
                    outboundRules: this.findOutboundRules(lbName)
                });
            }
        }

        return loadBalancers;
    }

    /**
     * Parse frontend IP configurations
     */
    private parseFrontendIPConfigs(configs: any): FrontendIPConfig[] {
        if (!configs) return [];
        const configArray = Array.isArray(configs) ? configs : [configs];

        return configArray.map(config => ({
            name: config.name,
            privateIPAddress: config.private_ip_address,
            privateIPAllocationMethod: config.private_ip_address_allocation,
            publicIPAddressId: config.public_ip_address_id,
            subnetId: config.subnet_id,
            zones: config.zones
        }));
    }

    /**
     * Find backend pools for a load balancer
     */
    private findBackendPools(lbName: string): BackendPoolInfo[] {
        const pools: BackendPoolInfo[] = [];

        for (const resource of this.resources) {
            if (resource.type === 'azurerm_lb_backend_address_pool') {
                const attrs = resource.attributes || {};
                if (attrs.loadbalancer_id?.includes(lbName)) {
                    const members = this.findBackendPoolMembers(resource.name);
                    pools.push({
                        name: attrs.name || resource.name,
                        id: `${resource.type}_${resource.name}`,
                        members
                    });
                }
            }
        }

        return pools;
    }

    /**
     * Find backend pool members
     */
    private findBackendPoolMembers(poolName: string): BackendPoolInfo['members'] {
        const members: BackendPoolInfo['members'] = [];

        for (const resource of this.resources) {
            if (resource.type === 'azurerm_lb_backend_address_pool_address') {
                const attrs = resource.attributes || {};
                if (attrs.backend_address_pool_id?.includes(poolName)) {
                    members.push({
                        type: 'ip',
                        ipAddress: attrs.ip_address,
                        name: resource.name
                    });
                }
            }

            if (resource.type === 'azurerm_network_interface_backend_address_pool_association') {
                const attrs = resource.attributes || {};
                if (attrs.backend_address_pool_id?.includes(poolName)) {
                    const nicName = this.extractNameFromRef(attrs.network_interface_id);
                    members.push({
                        type: 'nic',
                        id: attrs.network_interface_id,
                        name: nicName
                    });
                }
            }
        }

        return members;
    }

    /**
     * Find health probes for a load balancer
     */
    private findHealthProbes(lbName: string): HealthProbeInfo[] {
        const probes: HealthProbeInfo[] = [];

        for (const resource of this.resources) {
            if (resource.type === 'azurerm_lb_probe') {
                const attrs = resource.attributes || {};
                if (attrs.loadbalancer_id?.includes(lbName)) {
                    probes.push({
                        name: attrs.name || resource.name,
                        protocol: attrs.protocol || 'Tcp',
                        port: attrs.port,
                        requestPath: attrs.request_path,
                        intervalInSeconds: attrs.interval_in_seconds || 15,
                        numberOfProbes: attrs.number_of_probes || 2
                    });
                }
            }
        }

        return probes;
    }

    /**
     * Find load balancing rules
     */
    private findLoadBalancingRules(lbName: string): LoadBalancingRuleInfo[] {
        const rules: LoadBalancingRuleInfo[] = [];

        for (const resource of this.resources) {
            if (resource.type === 'azurerm_lb_rule') {
                const attrs = resource.attributes || {};
                if (attrs.loadbalancer_id?.includes(lbName)) {
                    rules.push({
                        name: attrs.name || resource.name,
                        frontendIPConfig: this.extractNameFromRef(attrs.frontend_ip_configuration_name) || '',
                        backendPool: this.extractNameFromRef(attrs.backend_address_pool_ids?.[0]) || '',
                        probe: this.extractNameFromRef(attrs.probe_id) || '',
                        protocol: attrs.protocol || 'Tcp',
                        frontendPort: attrs.frontend_port,
                        backendPort: attrs.backend_port,
                        enableFloatingIP: attrs.enable_floating_ip || false,
                        enableTcpReset: attrs.enable_tcp_reset || false,
                        idleTimeoutInMinutes: attrs.idle_timeout_in_minutes || 4,
                        loadDistribution: attrs.load_distribution || 'Default'
                    });
                }
            }
        }

        return rules;
    }

    /**
     * Find inbound NAT rules
     */
    private findInboundNatRules(lbName: string): InboundNatRuleInfo[] {
        const rules: InboundNatRuleInfo[] = [];

        for (const resource of this.resources) {
            if (resource.type === 'azurerm_lb_nat_rule') {
                const attrs = resource.attributes || {};
                if (attrs.loadbalancer_id?.includes(lbName)) {
                    rules.push({
                        name: attrs.name || resource.name,
                        frontendIPConfig: attrs.frontend_ip_configuration_name || '',
                        protocol: attrs.protocol || 'Tcp',
                        frontendPort: attrs.frontend_port,
                        backendPort: attrs.backend_port,
                        enableFloatingIP: attrs.enable_floating_ip || false,
                        enableTcpReset: attrs.enable_tcp_reset || false
                    });
                }
            }
        }

        return rules;
    }

    /**
     * Find outbound rules
     */
    private findOutboundRules(lbName: string): OutboundRuleInfo[] {
        const rules: OutboundRuleInfo[] = [];

        for (const resource of this.resources) {
            if (resource.type === 'azurerm_lb_outbound_rule') {
                const attrs = resource.attributes || {};
                if (attrs.loadbalancer_id?.includes(lbName)) {
                    rules.push({
                        name: attrs.name || resource.name,
                        frontendIPConfigs: attrs.frontend_ip_configuration || [],
                        backendPool: this.extractNameFromRef(attrs.backend_address_pool_id) || '',
                        protocol: attrs.protocol || 'All',
                        allocatedOutboundPorts: attrs.allocated_outbound_ports,
                        idleTimeoutInMinutes: attrs.idle_timeout_in_minutes || 4
                    });
                }
            }
        }

        return rules;
    }

    // ============================================
    // APPLICATION GATEWAY
    // ============================================

    /**
     * Analyze Application Gateways
     */
    analyzeAppGateways(): AppGatewayInfo[] {
        const gateways: AppGatewayInfo[] = [];

        for (const resource of this.resources) {
            if (resource.type === 'azurerm_application_gateway') {
                const attrs = resource.attributes || {};

                gateways.push({
                    id: `${resource.type}_${resource.name}`,
                    name: resource.name,
                    sku: attrs.sku?.name || 'Standard_v2',
                    tier: attrs.sku?.tier || 'Standard_v2',
                    capacity: attrs.sku?.capacity,
                    autoscaleMinCapacity: attrs.autoscale_configuration?.min_capacity,
                    autoscaleMaxCapacity: attrs.autoscale_configuration?.max_capacity,
                    resourceGroup: this.extractResourceGroupName(attrs.resource_group_name),
                    zones: attrs.zones,
                    enableHttp2: attrs.enable_http2 || false,
                    firewallPolicyId: attrs.firewall_policy_id,
                    wafEnabled: !!attrs.waf_configuration?.enabled,
                    wafMode: attrs.waf_configuration?.firewall_mode,
                    frontendPorts: this.parseAppGwFrontendPorts(attrs.frontend_port),
                    frontendIPs: this.parseAppGwFrontendIPs(attrs.frontend_ip_configuration),
                    backendPools: this.parseAppGwBackendPools(attrs.backend_address_pool),
                    httpListeners: this.parseAppGwListeners(attrs.http_listener),
                    requestRoutingRules: this.parseAppGwRoutingRules(attrs.request_routing_rule),
                    healthProbes: this.parseAppGwProbes(attrs.probe),
                    sslCertificates: this.parseAppGwSSLCerts(attrs.ssl_certificate)
                });
            }
        }

        return gateways;
    }

    private parseAppGwFrontendPorts(ports: any): { name: string; port: number }[] {
        if (!ports) return [];
        const portArray = Array.isArray(ports) ? ports : [ports];
        return portArray.map(p => ({ name: p.name, port: p.port }));
    }

    private parseAppGwFrontendIPs(ips: any): AppGatewayInfo['frontendIPs'] {
        if (!ips) return [];
        const ipArray = Array.isArray(ips) ? ips : [ips];
        return ipArray.map(ip => ({
            name: ip.name,
            publicIPId: ip.public_ip_address_id,
            privateIPAddress: ip.private_ip_address,
            subnetId: ip.subnet_id
        }));
    }

    private parseAppGwBackendPools(pools: any): AppGatewayInfo['backendPools'] {
        if (!pools) return [];
        const poolArray = Array.isArray(pools) ? pools : [pools];
        return poolArray.map(pool => ({
            name: pool.name,
            fqdns: pool.fqdns,
            ipAddresses: pool.ip_addresses
        }));
    }

    private parseAppGwListeners(listeners: any): AppGatewayInfo['httpListeners'] {
        if (!listeners) return [];
        const listenerArray = Array.isArray(listeners) ? listeners : [listeners];
        return listenerArray.map(l => ({
            name: l.name,
            frontendIP: l.frontend_ip_configuration_name,
            frontendPort: l.frontend_port_name,
            protocol: l.protocol || 'Http',
            hostName: l.host_name,
            hostNames: l.host_names,
            sslCertificate: l.ssl_certificate_name
        }));
    }

    private parseAppGwRoutingRules(rules: any): AppGatewayInfo['requestRoutingRules'] {
        if (!rules) return [];
        const ruleArray = Array.isArray(rules) ? rules : [rules];
        return ruleArray.map(r => ({
            name: r.name,
            ruleType: r.rule_type || 'Basic',
            httpListener: r.http_listener_name,
            backendPool: r.backend_address_pool_name,
            backendHttpSettings: r.backend_http_settings_name,
            urlPathMap: r.url_path_map_name,
            redirectConfiguration: r.redirect_configuration_name,
            priority: r.priority
        }));
    }

    private parseAppGwProbes(probes: any): AppGatewayInfo['healthProbes'] {
        if (!probes) return [];
        const probeArray = Array.isArray(probes) ? probes : [probes];
        return probeArray.map(p => ({
            name: p.name,
            protocol: p.protocol || 'Http',
            host: p.host,
            path: p.path || '/',
            interval: p.interval || 30,
            timeout: p.timeout || 30,
            unhealthyThreshold: p.unhealthy_threshold || 3
        }));
    }

    private parseAppGwSSLCerts(certs: any): AppGatewayInfo['sslCertificates'] {
        if (!certs) return [];
        const certArray = Array.isArray(certs) ? certs : [certs];
        return certArray.map(c => ({
            name: c.name,
            keyVaultSecretId: c.key_vault_secret_id
        }));
    }

    // ============================================
    // FIREWALL RULES
    // ============================================

    /**
     * Analyze Azure Firewalls
     */
    analyzeFirewalls(): FirewallInfo[] {
        const firewalls: FirewallInfo[] = [];

        for (const resource of this.resources) {
            if (resource.type === 'azurerm_firewall') {
                const attrs = resource.attributes || {};
                const fwName = resource.name;

                firewalls.push({
                    id: `${resource.type}_${resource.name}`,
                    name: fwName,
                    sku: attrs.sku_name || 'AZFW_VNet',
                    tier: attrs.sku_tier || 'Standard',
                    resourceGroup: this.extractResourceGroupName(attrs.resource_group_name),
                    threatIntelMode: attrs.threat_intel_mode || 'Alert',
                    privateIPAddress: attrs.ip_configuration?.[0]?.private_ip_address,
                    publicIPAddresses: this.extractPublicIPs(attrs.ip_configuration),
                    zones: attrs.zones,
                    policyId: attrs.firewall_policy_id,
                    applicationRuleCollections: this.findApplicationRuleCollections(fwName),
                    networkRuleCollections: this.findNetworkRuleCollections(fwName),
                    natRuleCollections: this.findNatRuleCollections(fwName),
                    dnsSettings: attrs.dns_servers ? {
                        enableProxy: attrs.dns_proxy_enabled || false,
                        servers: attrs.dns_servers
                    } : undefined
                });
            }
        }

        return firewalls;
    }

    /**
     * Extract public IPs from firewall config
     */
    private extractPublicIPs(ipConfig: any): string[] {
        if (!ipConfig) return [];
        const configs = Array.isArray(ipConfig) ? ipConfig : [ipConfig];
        return configs
            .map(c => this.extractNameFromRef(c.public_ip_address_id))
            .filter(Boolean) as string[];
    }

    /**
     * Find application rule collections for a firewall
     */
    private findApplicationRuleCollections(fwName: string): ApplicationRuleCollection[] {
        const collections: ApplicationRuleCollection[] = [];

        for (const resource of this.resources) {
            if (resource.type === 'azurerm_firewall_application_rule_collection') {
                const attrs = resource.attributes || {};
                if (attrs.azure_firewall_name?.includes(fwName)) {
                    collections.push({
                        name: attrs.name || resource.name,
                        priority: attrs.priority,
                        action: attrs.action?.type || 'Allow',
                        rules: this.parseApplicationRules(attrs.rule)
                    });
                }
            }
        }

        return collections;
    }

    /**
     * Parse application rules
     */
    private parseApplicationRules(rules: any): ApplicationRuleCollection['rules'] {
        if (!rules) return [];
        const ruleArray = Array.isArray(rules) ? rules : [rules];

        return ruleArray.map(rule => ({
            name: rule.name,
            sourceAddresses: rule.source_addresses,
            sourceIpGroups: rule.source_ip_groups,
            targetFqdns: rule.target_fqdns,
            fqdnTags: rule.fqdn_tags,
            protocols: (rule.protocol || []).map((p: any) => ({
                type: p.type,
                port: p.port
            })),
            description: rule.description
        }));
    }

    /**
     * Find network rule collections for a firewall
     */
    private findNetworkRuleCollections(fwName: string): NetworkRuleCollection[] {
        const collections: NetworkRuleCollection[] = [];

        for (const resource of this.resources) {
            if (resource.type === 'azurerm_firewall_network_rule_collection') {
                const attrs = resource.attributes || {};
                if (attrs.azure_firewall_name?.includes(fwName)) {
                    collections.push({
                        name: attrs.name || resource.name,
                        priority: attrs.priority,
                        action: attrs.action?.type || 'Allow',
                        rules: this.parseNetworkRules(attrs.rule)
                    });
                }
            }
        }

        return collections;
    }

    /**
     * Parse network rules
     */
    private parseNetworkRules(rules: any): NetworkRuleCollection['rules'] {
        if (!rules) return [];
        const ruleArray = Array.isArray(rules) ? rules : [rules];

        return ruleArray.map(rule => ({
            name: rule.name,
            sourceAddresses: rule.source_addresses,
            sourceIpGroups: rule.source_ip_groups,
            destinationAddresses: rule.destination_addresses,
            destinationIpGroups: rule.destination_ip_groups,
            destinationFqdns: rule.destination_fqdns,
            destinationPorts: rule.destination_ports || [],
            protocols: rule.protocols || [],
            description: rule.description
        }));
    }

    /**
     * Find NAT rule collections for a firewall
     */
    private findNatRuleCollections(fwName: string): NatRuleCollection[] {
        const collections: NatRuleCollection[] = [];

        for (const resource of this.resources) {
            if (resource.type === 'azurerm_firewall_nat_rule_collection') {
                const attrs = resource.attributes || {};
                if (attrs.azure_firewall_name?.includes(fwName)) {
                    collections.push({
                        name: attrs.name || resource.name,
                        priority: attrs.priority,
                        action: attrs.action?.type || 'Dnat',
                        rules: this.parseNatRules(attrs.rule)
                    });
                }
            }
        }

        return collections;
    }

    /**
     * Parse NAT rules
     */
    private parseNatRules(rules: any): NatRuleCollection['rules'] {
        if (!rules) return [];
        const ruleArray = Array.isArray(rules) ? rules : [rules];

        return ruleArray.map(rule => ({
            name: rule.name,
            sourceAddresses: rule.source_addresses,
            sourceIpGroups: rule.source_ip_groups,
            destinationAddresses: rule.destination_addresses || [],
            destinationPorts: rule.destination_ports || [],
            protocols: rule.protocols || [],
            translatedAddress: rule.translated_address,
            translatedPort: rule.translated_port,
            description: rule.description
        }));
    }

    /**
     * Analyze firewall policies
     */
    analyzeFirewallPolicies(): FirewallPolicyInfo[] {
        const policies: FirewallPolicyInfo[] = [];

        for (const resource of this.resources) {
            if (resource.type === 'azurerm_firewall_policy') {
                const attrs = resource.attributes || {};

                policies.push({
                    id: `${resource.type}_${resource.name}`,
                    name: resource.name,
                    tier: attrs.sku || 'Standard',
                    basePolicyId: attrs.base_policy_id,
                    threatIntelMode: attrs.threat_intelligence_mode || 'Alert',
                    dnsSettings: attrs.dns ? {
                        enableProxy: attrs.dns.proxy_enabled || false,
                        servers: attrs.dns.servers
                    } : undefined,
                    intrusionDetection: attrs.intrusion_detection ? {
                        mode: attrs.intrusion_detection.mode || 'Off'
                    } : undefined,
                    ruleCollectionGroups: this.findRuleCollectionGroups(resource.name)
                });
            }
        }

        return policies;
    }

    /**
     * Find rule collection groups for a policy
     */
    private findRuleCollectionGroups(policyName: string): string[] {
        const groups: string[] = [];

        for (const resource of this.resources) {
            if (resource.type === 'azurerm_firewall_policy_rule_collection_group') {
                const attrs = resource.attributes || {};
                if (attrs.firewall_policy_id?.includes(policyName)) {
                    groups.push(resource.name);
                }
            }
        }

        return groups;
    }

    // ============================================
    // EXPRESSROUTE / VPN STATUS
    // ============================================

    /**
     * Analyze ExpressRoute circuits and connections
     */
    analyzeExpressRoutes(): ExpressRouteInfo[] {
        const circuits: ExpressRouteInfo[] = [];

        for (const resource of this.resources) {
            if (resource.type === 'azurerm_express_route_circuit') {
                const attrs = resource.attributes || {};

                circuits.push({
                    id: `${resource.type}_${resource.name}`,
                    name: resource.name,
                    resourceGroup: this.extractResourceGroupName(attrs.resource_group_name),
                    peeringType: 'AzurePrivatePeering',
                    serviceProviderName: attrs.service_provider_name,
                    peeringLocation: attrs.peering_location,
                    bandwidthInMbps: attrs.bandwidth_in_mbps,
                    skuTier: attrs.sku?.tier,
                    skuFamily: attrs.sku?.family,
                    allowClassicOperations: attrs.allow_classic_operations,
                    connections: this.findExpressRouteConnections(resource.name)
                });
            }
        }

        return circuits;
    }

    /**
     * Find ExpressRoute connections
     */
    private findExpressRouteConnections(circuitName: string): ExpressRouteInfo['connections'] {
        const connections: ExpressRouteInfo['connections'] = [];

        for (const resource of this.resources) {
            if (resource.type === 'azurerm_express_route_circuit_connection' ||
                resource.type === 'azurerm_virtual_network_gateway_connection') {
                const attrs = resource.attributes || {};

                if (attrs.express_route_circuit_id?.includes(circuitName) ||
                    attrs.express_route_circuit_peering_id?.includes(circuitName)) {
                    connections.push({
                        name: resource.name,
                        circuitId: attrs.express_route_circuit_id || attrs.express_route_circuit_peering_id,
                        authorizationKey: attrs.authorization_key ? true : undefined as any,
                        routingWeight: attrs.routing_weight,
                        enableInternetSecurity: attrs.enable_internet_security
                    });
                }
            }
        }

        return connections;
    }

    /**
     * Analyze VPN Gateways
     */
    analyzeVPNGateways(): VPNGatewayInfo[] {
        const gateways: VPNGatewayInfo[] = [];

        for (const resource of this.resources) {
            if (resource.type === 'azurerm_virtual_network_gateway') {
                const attrs = resource.attributes || {};

                gateways.push({
                    id: `${resource.type}_${resource.name}`,
                    name: resource.name,
                    resourceGroup: this.extractResourceGroupName(attrs.resource_group_name),
                    type: attrs.type || 'Vpn',
                    vpnType: attrs.vpn_type || 'RouteBased',
                    sku: attrs.sku || 'Basic',
                    generation: attrs.generation,
                    activeActive: attrs.active_active || false,
                    enableBgp: attrs.enable_bgp || false,
                    bgpSettings: attrs.bgp_settings ? {
                        asn: attrs.bgp_settings.asn,
                        peeringAddress: attrs.bgp_settings.peering_addresses?.[0]?.default_addresses?.[0]
                    } : undefined,
                    publicIPAddresses: this.extractVPNGatewayPublicIPs(attrs.ip_configuration),
                    privateIPAddress: attrs.ip_configuration?.[0]?.private_ip_address_allocation,
                    subnetId: attrs.ip_configuration?.[0]?.subnet_id,
                    connections: this.findVPNConnections(resource.name),
                    localNetworkGateways: this.findLocalNetworkGateways(resource.name)
                });
            }
        }

        return gateways;
    }

    /**
     * Extract public IPs from VPN Gateway config
     */
    private extractVPNGatewayPublicIPs(ipConfigs: any): string[] {
        if (!ipConfigs) return [];
        const configs = Array.isArray(ipConfigs) ? ipConfigs : [ipConfigs];
        return configs
            .map(c => this.extractNameFromRef(c.public_ip_address_id))
            .filter(Boolean) as string[];
    }

    /**
     * Find VPN connections for a gateway
     */
    private findVPNConnections(gatewayName: string): VPNConnectionInfo[] {
        const connections: VPNConnectionInfo[] = [];

        for (const resource of this.resources) {
            if (resource.type === 'azurerm_virtual_network_gateway_connection') {
                const attrs = resource.attributes || {};

                if (attrs.virtual_network_gateway_id?.includes(gatewayName)) {
                    connections.push({
                        name: resource.name,
                        connectionType: attrs.type || 'IPsec',
                        sharedKey: !!attrs.shared_key,
                        enableBgp: attrs.enable_bgp || false,
                        usePolicyBasedTrafficSelectors: attrs.use_policy_based_traffic_selectors || false,
                        ipsecPolicies: attrs.ipsec_policy?.map((p: any) => ({
                            saLifeTimeSeconds: p.sa_lifetime,
                            saDataSizeKilobytes: p.sa_datasize,
                            ipsecEncryption: p.ipsec_encryption,
                            ipsecIntegrity: p.ipsec_integrity,
                            ikeEncryption: p.ike_encryption,
                            ikeIntegrity: p.ike_integrity,
                            dhGroup: p.dh_group,
                            pfsGroup: p.pfs_group
                        })),
                        localNetworkGatewayId: attrs.local_network_gateway_id,
                        remoteVNetId: attrs.peer_virtual_network_gateway_id,
                        expressRouteCircuitId: attrs.express_route_circuit_id,
                        routingWeight: attrs.routing_weight
                    });
                }
            }
        }

        return connections;
    }

    /**
     * Find local network gateways
     */
    private findLocalNetworkGateways(vpnGatewayName: string): LocalNetworkGatewayInfo[] {
        const localGateways: LocalNetworkGatewayInfo[] = [];

        // First find all connections for this VPN gateway
        const connections = this.findVPNConnections(vpnGatewayName);
        const localGatewayRefs = connections
            .map(c => this.extractNameFromRef(c.localNetworkGatewayId))
            .filter(Boolean);

        for (const resource of this.resources) {
            if (resource.type === 'azurerm_local_network_gateway') {
                const attrs = resource.attributes || {};

                // Include if referenced by a connection or if no specific filter
                if (localGatewayRefs.length === 0 || localGatewayRefs.includes(resource.name)) {
                    localGateways.push({
                        id: `${resource.type}_${resource.name}`,
                        name: resource.name,
                        gatewayIpAddress: attrs.gateway_address || '',
                        addressPrefixes: attrs.address_space || [],
                        bgpSettings: attrs.bgp_settings ? {
                            asn: attrs.bgp_settings.asn,
                            bgpPeeringAddress: attrs.bgp_settings.bgp_peering_address
                        } : undefined,
                        fqdn: attrs.gateway_fqdn
                    });
                }
            }
        }

        return localGateways;
    }

    /**
     * Extract resource group name from reference
     */
    private extractResourceGroupName(rgRef: any): string | undefined {
        if (!rgRef) return undefined;
        if (typeof rgRef === 'string') {
            const match = rgRef.match(/azurerm_resource_group\.([^.]+)/);
            if (match) return match[1];
            return rgRef;
        }
        return undefined;
    }
}
