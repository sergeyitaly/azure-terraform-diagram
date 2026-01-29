// src/types/security.ts

/**
 * Security severity levels
 */
export type SecuritySeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * Security posture for a resource
 */
export interface SecurityPosture {
    isEncrypted: boolean;
    hasPublicEndpoint: boolean;
    hasNSG: boolean;
    missingEncryption?: string[];
    publicEndpoints?: string[];
    nsgRules?: NSGRule[];
    complianceStatus: 'compliant' | 'warning' | 'non-compliant';
    overallScore: SecuritySeverity;
    indicators: SecurityIndicator[];
    recommendations: SecurityRecommendation[];
    rbacInfo?: RBACInfo;
    privateEndpointInfo?: PrivateEndpointInfo;
}

/**
 * Security indicator (finding)
 */
export interface SecurityIndicator {
    id: string;
    severity: SecuritySeverity;
    category: SecurityCategory;
    title: string;
    description: string;
    resourceType: string;
    attribute?: string;
    currentValue?: any;
    expectedValue?: any;
    remediation?: string;
    complianceFrameworks?: string[]; // e.g., ['CIS', 'NIST', 'PCI-DSS']
}

export type SecurityCategory =
    | 'encryption'
    | 'network'
    | 'identity'
    | 'logging'
    | 'access-control'
    | 'data-protection'
    | 'configuration';

/**
 * Security recommendation
 */
export interface SecurityRecommendation {
    id: string;
    severity: SecuritySeverity;
    title: string;
    description: string;
    impact: string;
    remediation: string;
    terraformFix?: string; // Terraform code snippet to fix the issue
}

/**
 * NSG rule information
 */
export interface NSGRule {
    name: string;
    priority: number;
    direction: 'Inbound' | 'Outbound';
    access: 'Allow' | 'Deny';
    protocol: string;
    sourceAddressPrefixes: string[];
    destinationAddressPrefixes: string[];
    sourcePortRanges: string[];
    destinationPortRanges: string[];
    description?: string;
}

/**
 * RBAC information
 */
export interface RBACInfo {
    hasManagedIdentity: boolean;
    identityType?: 'SystemAssigned' | 'UserAssigned' | 'SystemAssigned, UserAssigned';
    roleAssignments?: RoleAssignment[];
    hasServicePrincipal?: boolean;
    principalId?: string;
}

export interface RoleAssignment {
    principalId: string;
    principalType: 'User' | 'Group' | 'ServicePrincipal' | 'ManagedIdentity';
    roleDefinitionName: string;
    roleDefinitionId: string;
    scope: string;
}

/**
 * Private endpoint information
 */
export interface PrivateEndpointInfo {
    hasPrivateEndpoint: boolean;
    privateEndpointId?: string;
    privateEndpointName?: string;
    publicEndpoint?: string;
    privateLinkService?: string;
    connectionState?: 'Approved' | 'Pending' | 'Rejected' | 'Disconnected';
    privateDnsZone?: string;
    subnetId?: string;
}

/**
 * Key Vault reference for secrets
 */
export interface KeyVaultReference {
    keyVaultId: string;
    keyVaultName?: string;
    secretName: string;
    version?: string;
    resourceId: string;
    resourceType: string;
}

/**
 * TLS/SSL configuration
 */
export interface TLSConfig {
    minTlsVersion: string;
    tlsVersionCompliant: boolean;
    certificateSource?: 'managed' | 'keyvault' | 'custom';
    certificateExpiry?: Date;
}

/**
 * Firewall/Network rules configuration
 */
export interface NetworkRulesConfig {
    defaultAction: 'Allow' | 'Deny';
    ipRules: string[];
    virtualNetworkRules: string[];
    bypassServices?: string[];
    publicNetworkAccess: boolean;
}

/**
 * Security detection rule definition
 */
export interface SecurityRule {
    id: string;
    resourceType: string;
    attribute: string;
    operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'less_than' | 'greater_than' | 'exists' | 'not_exists';
    value: any;
    severity: SecuritySeverity;
    title: string;
    description: string;
    remediation: string;
    complianceFrameworks?: string[];
}
