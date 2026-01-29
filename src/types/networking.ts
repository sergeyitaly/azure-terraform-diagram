// src/types/networking.ts

/**
 * NSG Rule information
 */
export interface NSGRuleInfo {
    name: string;
    priority: number;
    direction: 'Inbound' | 'Outbound';
    access: 'Allow' | 'Deny';
    protocol: string; // 'Tcp', 'Udp', 'Icmp', '*'
    sourcePortRange: string;
    destinationPortRange: string;
    sourceAddressPrefix: string;
    destinationAddressPrefix: string;
    sourceAddressPrefixes?: string[];
    destinationAddressPrefixes?: string[];
    sourceApplicationSecurityGroups?: string[];
    destinationApplicationSecurityGroups?: string[];
    description?: string;
}

export interface NSGInfo {
    id: string;
    name: string;
    resourceGroup?: string;
    rules: NSGRuleInfo[];
    inboundRules: NSGRuleInfo[];
    outboundRules: NSGRuleInfo[];
    associatedSubnets: string[];
    associatedNICs: string[];
    defaultRules: NSGRuleInfo[];
}

/**
 * Traffic flow between resources
 */
export interface TrafficFlowInfo {
    sourceId: string;
    sourceName: string;
    sourceType: string;
    targetId: string;
    targetName: string;
    targetType: string;
    ports: string[];
    protocol: string;
    direction: 'inbound' | 'outbound' | 'bidirectional';
    allowed: boolean;
    nsgRule?: string; // Name of the NSG rule that allows/denies
    flowType: 'application' | 'management' | 'data' | 'monitoring';
    description?: string;
}

/**
 * DNS Zone information
 */
export interface DNSZoneInfo {
    id: string;
    name: string;
    zoneType: 'Public' | 'Private';
    resourceGroup?: string;
    records: DNSRecordInfo[];
    linkedVNets?: string[]; // For private DNS zones
    soaRecord?: {
        email: string;
        hostName: string;
        refreshTime: number;
        retryTime: number;
        expireTime: number;
        minimumTtl: number;
    };
}

export interface DNSRecordInfo {
    name: string;
    type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'NS' | 'PTR' | 'SOA' | 'SRV' | 'TXT' | 'CAA';
    ttl: number;
    values: string[];
    targetResourceId?: string; // For alias records
}

/**
 * Load Balancer information
 */
export interface LoadBalancerInfo {
    id: string;
    name: string;
    sku: string; // 'Basic', 'Standard', 'Gateway'
    tier?: string; // 'Regional', 'Global'
    resourceGroup?: string;
    frontendIPs: FrontendIPConfig[];
    backendPools: BackendPoolInfo[];
    healthProbes: HealthProbeInfo[];
    loadBalancingRules: LoadBalancingRuleInfo[];
    inboundNatRules: InboundNatRuleInfo[];
    outboundRules: OutboundRuleInfo[];
}

export interface FrontendIPConfig {
    name: string;
    privateIPAddress?: string;
    privateIPAllocationMethod?: string;
    publicIPAddressId?: string;
    subnetId?: string;
    zones?: string[];
}

export interface BackendPoolInfo {
    name: string;
    id: string;
    members: BackendPoolMember[];
}

export interface BackendPoolMember {
    type: 'vm' | 'vmss' | 'nic' | 'ip';
    id?: string;
    name?: string;
    ipAddress?: string;
}

export interface HealthProbeInfo {
    name: string;
    protocol: 'Http' | 'Https' | 'Tcp';
    port: number;
    requestPath?: string; // For HTTP/HTTPS
    intervalInSeconds: number;
    numberOfProbes: number; // Unhealthy threshold
}

export interface LoadBalancingRuleInfo {
    name: string;
    frontendIPConfig: string;
    backendPool: string;
    probe: string;
    protocol: 'Tcp' | 'Udp' | 'All';
    frontendPort: number;
    backendPort: number;
    enableFloatingIP: boolean;
    enableTcpReset: boolean;
    idleTimeoutInMinutes: number;
    loadDistribution: 'Default' | 'SourceIP' | 'SourceIPProtocol';
}

export interface InboundNatRuleInfo {
    name: string;
    frontendIPConfig: string;
    protocol: 'Tcp' | 'Udp' | 'All';
    frontendPort: number;
    backendPort: number;
    targetVMId?: string;
    targetNICId?: string;
    enableFloatingIP: boolean;
    enableTcpReset: boolean;
}

export interface OutboundRuleInfo {
    name: string;
    frontendIPConfigs: string[];
    backendPool: string;
    protocol: 'Tcp' | 'Udp' | 'All';
    allocatedOutboundPorts?: number;
    idleTimeoutInMinutes: number;
}

/**
 * Azure Firewall information
 */
export interface FirewallInfo {
    id: string;
    name: string;
    sku: string; // 'AZFW_VNet', 'AZFW_Hub'
    tier: string; // 'Standard', 'Premium', 'Basic'
    resourceGroup?: string;
    threatIntelMode: 'Alert' | 'Deny' | 'Off';
    privateIPAddress?: string;
    publicIPAddresses: string[];
    zones?: string[];
    policyId?: string;
    applicationRuleCollections: ApplicationRuleCollection[];
    networkRuleCollections: NetworkRuleCollection[];
    natRuleCollections: NatRuleCollection[];
    dnsSettings?: {
        enableProxy: boolean;
        servers?: string[];
    };
}

export interface ApplicationRuleCollection {
    name: string;
    priority: number;
    action: 'Allow' | 'Deny';
    rules: ApplicationRule[];
}

export interface ApplicationRule {
    name: string;
    sourceAddresses?: string[];
    sourceIpGroups?: string[];
    targetFqdns?: string[];
    fqdnTags?: string[];
    protocols: { type: 'Http' | 'Https' | 'Mssql'; port: number }[];
    description?: string;
}

export interface NetworkRuleCollection {
    name: string;
    priority: number;
    action: 'Allow' | 'Deny';
    rules: NetworkRule[];
}

export interface NetworkRule {
    name: string;
    sourceAddresses?: string[];
    sourceIpGroups?: string[];
    destinationAddresses?: string[];
    destinationIpGroups?: string[];
    destinationFqdns?: string[];
    destinationPorts: string[];
    protocols: ('TCP' | 'UDP' | 'ICMP' | 'Any')[];
    description?: string;
}

export interface NatRuleCollection {
    name: string;
    priority: number;
    action: 'Dnat' | 'Snat';
    rules: NatRule[];
}

export interface NatRule {
    name: string;
    sourceAddresses?: string[];
    sourceIpGroups?: string[];
    destinationAddresses: string[];
    destinationPorts: string[];
    protocols: ('TCP' | 'UDP')[];
    translatedAddress: string;
    translatedPort: string;
    description?: string;
}

/**
 * Firewall Policy (separate from Firewall for reusability)
 */
export interface FirewallPolicyInfo {
    id: string;
    name: string;
    tier: string;
    basePolicyId?: string;
    threatIntelMode: 'Alert' | 'Deny' | 'Off';
    dnsSettings?: {
        enableProxy: boolean;
        servers?: string[];
    };
    intrusionDetection?: {
        mode: 'Alert' | 'Deny' | 'Off';
    };
    ruleCollectionGroups: string[];
}

/**
 * Hybrid connectivity - ExpressRoute
 */
export interface ExpressRouteInfo {
    id: string;
    name: string;
    resourceGroup?: string;
    circuitId?: string;
    peeringType: 'AzurePrivatePeering' | 'AzurePublicPeering' | 'MicrosoftPeering';
    peeringState?: 'Enabled' | 'Disabled';
    provisioningState?: string;
    serviceProviderName?: string;
    peeringLocation?: string;
    bandwidthInMbps?: number;
    skuTier?: 'Standard' | 'Premium' | 'Local';
    skuFamily?: 'MeteredData' | 'UnlimitedData';
    allowClassicOperations?: boolean;
    gatewayId?: string;
    connections: ExpressRouteConnection[];
}

export interface ExpressRouteConnection {
    name: string;
    circuitId: string;
    authorizationKey?: string;
    routingWeight?: number;
    enableInternetSecurity?: boolean;
}

/**
 * Hybrid connectivity - VPN Gateway
 */
export interface VPNGatewayInfo {
    id: string;
    name: string;
    resourceGroup?: string;
    type: 'Vpn' | 'ExpressRoute';
    vpnType: 'RouteBased' | 'PolicyBased';
    sku: string; // 'Basic', 'VpnGw1', 'VpnGw2', etc.
    generation?: 'Generation1' | 'Generation2';
    activeActive: boolean;
    enableBgp: boolean;
    bgpSettings?: {
        asn: number;
        peeringAddress?: string;
    };
    publicIPAddresses: string[];
    privateIPAddress?: string;
    subnetId?: string;
    connections: VPNConnectionInfo[];
    localNetworkGateways: LocalNetworkGatewayInfo[];
}

export interface VPNConnectionInfo {
    name: string;
    connectionType: 'IPsec' | 'Vnet2Vnet' | 'ExpressRoute';
    connectionStatus?: 'Connected' | 'Connecting' | 'NotConnected' | 'Unknown';
    sharedKey?: boolean; // Just indicate if configured, don't expose
    enableBgp: boolean;
    usePolicyBasedTrafficSelectors: boolean;
    ipsecPolicies?: {
        saLifeTimeSeconds: number;
        saDataSizeKilobytes: number;
        ipsecEncryption: string;
        ipsecIntegrity: string;
        ikeEncryption: string;
        ikeIntegrity: string;
        dhGroup: string;
        pfsGroup: string;
    }[];
    localNetworkGatewayId?: string;
    remoteVNetId?: string;
    expressRouteCircuitId?: string;
    routingWeight?: number;
}

export interface LocalNetworkGatewayInfo {
    id: string;
    name: string;
    gatewayIpAddress: string;
    addressPrefixes: string[];
    bgpSettings?: {
        asn: number;
        bgpPeeringAddress: string;
    };
    fqdn?: string;
}

/**
 * Application Gateway information
 */
export interface AppGatewayInfo {
    id: string;
    name: string;
    sku: string;
    tier: string;
    capacity?: number;
    autoscaleMinCapacity?: number;
    autoscaleMaxCapacity?: number;
    resourceGroup?: string;
    zones?: string[];
    enableHttp2: boolean;
    firewallPolicyId?: string;
    wafEnabled: boolean;
    wafMode?: 'Detection' | 'Prevention';
    frontendPorts: { name: string; port: number }[];
    frontendIPs: {
        name: string;
        publicIPId?: string;
        privateIPAddress?: string;
        subnetId?: string;
    }[];
    backendPools: {
        name: string;
        fqdns?: string[];
        ipAddresses?: string[];
    }[];
    httpListeners: {
        name: string;
        frontendIP: string;
        frontendPort: string;
        protocol: 'Http' | 'Https';
        hostName?: string;
        hostNames?: string[];
        sslCertificate?: string;
    }[];
    requestRoutingRules: {
        name: string;
        ruleType: 'Basic' | 'PathBasedRouting';
        httpListener: string;
        backendPool?: string;
        backendHttpSettings?: string;
        urlPathMap?: string;
        redirectConfiguration?: string;
        priority?: number;
    }[];
    healthProbes: {
        name: string;
        protocol: 'Http' | 'Https';
        host?: string;
        path: string;
        interval: number;
        timeout: number;
        unhealthyThreshold: number;
    }[];
    sslCertificates: {
        name: string;
        keyVaultSecretId?: string;
    }[];
}

/**
 * Network summary for sidebar display
 */
export interface NetworkingSummary {
    nsgs: NSGInfo[];
    trafficFlows: TrafficFlowInfo[];
    dnsZones: DNSZoneInfo[];
    loadBalancers: LoadBalancerInfo[];
    appGateways: AppGatewayInfo[];
    firewalls: FirewallInfo[];
    firewallPolicies: FirewallPolicyInfo[];
    expressRoutes: ExpressRouteInfo[];
    vpnGateways: VPNGatewayInfo[];
    // Summary counts
    totalNSGRules: number;
    totalDNSRecords: number;
    totalLBRules: number;
    totalFirewallRules: number;
    hybridConnections: number;
}

/**
 * Network topology for visualization
 */
export interface NetworkTopologyNode {
    id: string;
    type: 'vnet' | 'subnet' | 'nsg' | 'lb' | 'appgw' | 'firewall' | 'vpngw' | 'ergw' | 'dns' | 'resource';
    name: string;
    properties: Record<string, any>;
    children?: NetworkTopologyNode[];
}

export interface NetworkTopologyEdge {
    source: string;
    target: string;
    edgeType: 'contains' | 'peers' | 'routes' | 'protects' | 'resolves' | 'connects';
    label?: string;
    properties?: Record<string, any>;
}
