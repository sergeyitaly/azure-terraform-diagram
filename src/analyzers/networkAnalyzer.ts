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
}
