// src/types/index.ts
// Re-export all types from domain-specific files

export * from './security';
export * from './cost';
export * from './devops';

/**
 * Diagram connection between two nodes
 */
export interface DiagramConnection {
    sourceId: string;
    targetId: string;
    type: 'data' | 'control' | 'security' | 'dependency' | 'reference';
    label?: string;
    style?: 'solid' | 'dashed' | 'dotted';
    color?: string;
    bidirectional?: boolean;
}

/**
 * Network information for a resource
 */
export interface NetworkInfo {
    ipAddress?: string;
    addressPrefix?: string;
    addressSpace?: string[];
    subnetAddressPrefix?: string;
    publicIpAddress?: string;
    privateIpAddress?: string;
    ports?: string[];
    endpoints?: string[];
    vnetId?: string;
    subnetId?: string;
    nsgId?: string;
    peeringConnections?: VNetPeering[];
}

/**
 * VNet peering information
 */
export interface VNetPeering {
    name: string;
    remoteVnetId: string;
    remoteVnetName?: string;
    remoteAddressSpace?: string[];
    allowVirtualNetworkAccess: boolean;
    allowForwardedTraffic: boolean;
    allowGatewayTransit: boolean;
    useRemoteGateways: boolean;
    peeringState: 'Connected' | 'Disconnected' | 'Initiated';
}

/**
 * Network topology for visualization
 */
export interface NetworkTopology {
    vnets: VNetInfo[];
    peerings: VNetPeering[];
    privateEndpoints: PrivateEndpointNode[];
    gatewayConnections: GatewayConnection[];
}

export interface VNetInfo {
    id: string;
    name: string;
    addressSpace: string[];
    location: string;
    subnets: SubnetInfo[];
    resourceGroupId?: string;
}

export interface SubnetInfo {
    id: string;
    name: string;
    addressPrefix: string;
    nsgId?: string;
    routeTableId?: string;
    serviceEndpoints?: string[];
    delegations?: string[];
    privateEndpointNetworkPolicies?: 'Enabled' | 'Disabled';
    resources: string[]; // Resource IDs in this subnet
}

export interface PrivateEndpointNode {
    id: string;
    name: string;
    subnetId: string;
    targetResourceId: string;
    targetResourceType: string;
    groupIds: string[];
    privateDnsZones?: string[];
}

export interface GatewayConnection {
    id: string;
    name: string;
    type: 'VPN' | 'ExpressRoute' | 'VNetPeering';
    sourceId: string;
    targetId: string;
    status: 'Connected' | 'Connecting' | 'NotConnected';
}

/**
 * Extended Terraform resource with DevOps info
 */
export interface EnhancedTerraformResource {
    type: string;
    name: string;
    file: string;
    line?: number;
    attributes: Record<string, any>;
    module?: string;
    modulePath?: string;
    dependencies: string[];
    securityRules?: LegacySecurityRule[];
    networkInfo?: NetworkInfo;
    tags?: Record<string, string>;
    // DevOps enhancements
    securityPosture?: import('./security').SecurityPosture;
    costEstimate?: import('./cost').CostEstimate;
    skuInfo?: import('./cost').SKUInfo;
    tagCompliance?: import('./cost').TagCompliance;
    environment?: string;
}

/**
 * Legacy security rule (for backward compatibility)
 */
export interface LegacySecurityRule {
    name: string;
    priority?: number;
    direction?: string;
    access?: string;
    protocol?: string;
    sourcePortRange?: string;
    destinationPortRange?: string;
    sourceAddressPrefix?: string;
    destinationAddressPrefix?: string;
}

/**
 * Enhanced diagram node with DevOps features
 */
export interface EnhancedDiagramNode {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    type: string;
    name: string;
    resourceType?: string;
    resourceName?: string;
    displayName?: string;
    zone?: string;
    isGroupContainer?: boolean;
    connections?: string[];
    content?: string;
    // Security badges
    securityBadges?: SecurityBadge[];
    overallSecurityScore?: import('./security').SecuritySeverity;
    // Cost information
    costBadge?: CostBadge;
    // SKU information
    skuBadge?: string;
    // Tag compliance
    tagBadge?: TagBadge;
    // Environment
    environment?: string;
}

export interface SecurityBadge {
    type: 'encryption' | 'network' | 'identity' | 'configuration';
    severity: import('./security').SecuritySeverity;
    icon: string;
    title: string;
    tooltip: string;
}

export interface CostBadge {
    monthlyCost: number;
    currency: string;
    formattedCost: string;
    tier: string;
    isHighCost: boolean;
}

export interface TagBadge {
    hasRequiredTags: boolean;
    missingCount: number;
    tooltip: string;
}

/**
 * Layout options for diagram generation
 */
export interface LayoutOptions {
    mode: 'auto' | 'flow' | 'zones' | 'network-topology' | 'cost-center' | 'environment-comparison';
    flowDirection?: 'left-right' | 'top-bottom' | 'right-left' | 'bottom-top';
    showSecurityBadges: boolean;
    showCostEstimates: boolean;
    showSKULabels: boolean;
    showTagCompliance: boolean;
    showCIDR: boolean;
    showPrivateEndpoints: boolean;
    severityThreshold: import('./security').SecuritySeverity;
    requiredTags: string[];
    currency: string;
    groupByResourceGroup: boolean;
    groupByCostCenter: boolean;
    environments?: string[];
}

/**
 * Analysis result combining all DevOps features
 */
export interface AnalysisResult {
    resources: EnhancedTerraformResource[];
    securityPostures: Map<string, import('./security').SecurityPosture>;
    costEstimates: Map<string, import('./cost').CostEstimate>;
    skuInfo: Map<string, import('./cost').SKUInfo>;
    tagCompliance: Map<string, import('./cost').TagCompliance>;
    networkTopology: NetworkTopology;
    environmentComparison?: import('./devops').EnvironmentComparison;
    totalMonthlyCost: number;
    securityScore: number; // 0-100
    complianceScore: number; // 0-100
}
