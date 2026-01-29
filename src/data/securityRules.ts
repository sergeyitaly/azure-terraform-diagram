// src/data/securityRules.ts
import { SecurityRule, SecuritySeverity } from '../types/security';

/**
 * Comprehensive security detection rules for Azure resources
 * Based on Azure Security Benchmark, CIS Benchmarks, and best practices
 */
export const SECURITY_RULES: SecurityRule[] = [
    // ==========================================
    // Storage Account Rules
    // ==========================================
    {
        id: 'storage-public-access',
        resourceType: 'azurerm_storage_account',
        attribute: 'allow_nested_items_to_be_public',
        operator: 'equals',
        value: true,
        severity: 'high',
        title: 'Public blob access enabled',
        description: 'Storage account allows public access to blobs. This can expose sensitive data.',
        remediation: 'Set allow_nested_items_to_be_public = false',
        complianceFrameworks: ['CIS', 'NIST']
    },
    {
        id: 'storage-min-tls',
        resourceType: 'azurerm_storage_account',
        attribute: 'min_tls_version',
        operator: 'not_equals',
        value: 'TLS1_2',
        severity: 'medium',
        title: 'TLS version below 1.2',
        description: 'Storage account accepts connections with TLS versions older than 1.2.',
        remediation: 'Set min_tls_version = "TLS1_2"',
        complianceFrameworks: ['CIS', 'PCI-DSS']
    },
    {
        id: 'storage-https-only',
        resourceType: 'azurerm_storage_account',
        attribute: 'enable_https_traffic_only',
        operator: 'not_equals',
        value: true,
        severity: 'high',
        title: 'HTTPS not enforced',
        description: 'Storage account allows non-HTTPS traffic.',
        remediation: 'Set enable_https_traffic_only = true',
        complianceFrameworks: ['CIS', 'NIST', 'PCI-DSS']
    },
    {
        id: 'storage-network-rules',
        resourceType: 'azurerm_storage_account',
        attribute: 'network_rules',
        operator: 'not_exists',
        value: null,
        severity: 'high',
        title: 'No network rules configured',
        description: 'Storage account has no network restrictions. Anyone can access it.',
        remediation: 'Add network_rules block with default_action = "Deny"',
        complianceFrameworks: ['CIS', 'NIST']
    },
    {
        id: 'storage-infrastructure-encryption',
        resourceType: 'azurerm_storage_account',
        attribute: 'infrastructure_encryption_enabled',
        operator: 'not_equals',
        value: true,
        severity: 'low',
        title: 'Infrastructure encryption disabled',
        description: 'Double encryption at infrastructure level is not enabled.',
        remediation: 'Set infrastructure_encryption_enabled = true',
        complianceFrameworks: ['NIST']
    },

    // ==========================================
    // SQL Server Rules
    // ==========================================
    {
        id: 'sql-public-access',
        resourceType: 'azurerm_mssql_server',
        attribute: 'public_network_access_enabled',
        operator: 'equals',
        value: true,
        severity: 'high',
        title: 'Public network access enabled',
        description: 'SQL Server is accessible from the public internet.',
        remediation: 'Set public_network_access_enabled = false and use private endpoints',
        complianceFrameworks: ['CIS', 'NIST', 'PCI-DSS']
    },
    {
        id: 'sql-min-tls',
        resourceType: 'azurerm_mssql_server',
        attribute: 'minimum_tls_version',
        operator: 'not_equals',
        value: '1.2',
        severity: 'medium',
        title: 'TLS version below 1.2',
        description: 'SQL Server accepts connections with TLS versions older than 1.2.',
        remediation: 'Set minimum_tls_version = "1.2"',
        complianceFrameworks: ['CIS', 'PCI-DSS']
    },
    {
        id: 'sql-aad-admin',
        resourceType: 'azurerm_mssql_server',
        attribute: 'azuread_administrator',
        operator: 'not_exists',
        value: null,
        severity: 'medium',
        title: 'No Azure AD administrator',
        description: 'SQL Server has no Azure AD administrator configured.',
        remediation: 'Add azuread_administrator block',
        complianceFrameworks: ['CIS']
    },

    // ==========================================
    // Key Vault Rules
    // ==========================================
    {
        id: 'keyvault-purge-protection',
        resourceType: 'azurerm_key_vault',
        attribute: 'purge_protection_enabled',
        operator: 'not_equals',
        value: true,
        severity: 'medium',
        title: 'Purge protection disabled',
        description: 'Key Vault can be permanently deleted, losing all secrets.',
        remediation: 'Set purge_protection_enabled = true',
        complianceFrameworks: ['CIS', 'NIST']
    },
    {
        id: 'keyvault-soft-delete',
        resourceType: 'azurerm_key_vault',
        attribute: 'soft_delete_retention_days',
        operator: 'less_than',
        value: 7,
        severity: 'low',
        title: 'Short soft delete retention',
        description: 'Key Vault soft delete retention is less than 7 days.',
        remediation: 'Set soft_delete_retention_days >= 7',
        complianceFrameworks: ['CIS']
    },
    {
        id: 'keyvault-rbac',
        resourceType: 'azurerm_key_vault',
        attribute: 'enable_rbac_authorization',
        operator: 'not_equals',
        value: true,
        severity: 'low',
        title: 'RBAC authorization not enabled',
        description: 'Key Vault uses access policies instead of RBAC.',
        remediation: 'Set enable_rbac_authorization = true',
        complianceFrameworks: ['NIST']
    },
    {
        id: 'keyvault-network-acls',
        resourceType: 'azurerm_key_vault',
        attribute: 'network_acls',
        operator: 'not_exists',
        value: null,
        severity: 'medium',
        title: 'No network ACLs configured',
        description: 'Key Vault has no network restrictions.',
        remediation: 'Add network_acls block with default_action = "Deny"',
        complianceFrameworks: ['CIS']
    },

    // ==========================================
    // Kubernetes (AKS) Rules
    // ==========================================
    {
        id: 'aks-private-cluster',
        resourceType: 'azurerm_kubernetes_cluster',
        attribute: 'private_cluster_enabled',
        operator: 'not_equals',
        value: true,
        severity: 'medium',
        title: 'Not a private cluster',
        description: 'AKS cluster API server is publicly accessible.',
        remediation: 'Set private_cluster_enabled = true',
        complianceFrameworks: ['CIS', 'NIST']
    },
    {
        id: 'aks-rbac',
        resourceType: 'azurerm_kubernetes_cluster',
        attribute: 'role_based_access_control_enabled',
        operator: 'not_equals',
        value: true,
        severity: 'high',
        title: 'RBAC not enabled',
        description: 'AKS cluster does not have Kubernetes RBAC enabled.',
        remediation: 'Set role_based_access_control_enabled = true',
        complianceFrameworks: ['CIS', 'NIST']
    },
    {
        id: 'aks-azure-policy',
        resourceType: 'azurerm_kubernetes_cluster',
        attribute: 'azure_policy_enabled',
        operator: 'not_equals',
        value: true,
        severity: 'low',
        title: 'Azure Policy not enabled',
        description: 'AKS cluster does not have Azure Policy add-on enabled.',
        remediation: 'Set azure_policy_enabled = true',
        complianceFrameworks: ['CIS']
    },
    {
        id: 'aks-managed-identity',
        resourceType: 'azurerm_kubernetes_cluster',
        attribute: 'identity',
        operator: 'not_exists',
        value: null,
        severity: 'medium',
        title: 'No managed identity',
        description: 'AKS cluster is using service principal instead of managed identity.',
        remediation: 'Add identity block with type = "SystemAssigned"',
        complianceFrameworks: ['NIST']
    },
    {
        id: 'aks-network-policy',
        resourceType: 'azurerm_kubernetes_cluster',
        attribute: 'network_profile.network_policy',
        operator: 'not_exists',
        value: null,
        severity: 'medium',
        title: 'No network policy',
        description: 'AKS cluster has no network policy configured.',
        remediation: 'Set network_profile.network_policy = "azure" or "calico"',
        complianceFrameworks: ['CIS']
    },

    // ==========================================
    // App Service Rules
    // ==========================================
    {
        id: 'appservice-https-only',
        resourceType: 'azurerm_linux_web_app',
        attribute: 'https_only',
        operator: 'not_equals',
        value: true,
        severity: 'high',
        title: 'HTTPS not enforced',
        description: 'App Service allows non-HTTPS traffic.',
        remediation: 'Set https_only = true',
        complianceFrameworks: ['CIS', 'PCI-DSS']
    },
    {
        id: 'appservice-min-tls',
        resourceType: 'azurerm_linux_web_app',
        attribute: 'site_config.minimum_tls_version',
        operator: 'not_equals',
        value: '1.2',
        severity: 'medium',
        title: 'TLS version below 1.2',
        description: 'App Service accepts TLS versions older than 1.2.',
        remediation: 'Set site_config.minimum_tls_version = "1.2"',
        complianceFrameworks: ['CIS', 'PCI-DSS']
    },
    {
        id: 'appservice-ftps',
        resourceType: 'azurerm_linux_web_app',
        attribute: 'site_config.ftps_state',
        operator: 'equals',
        value: 'AllAllowed',
        severity: 'medium',
        title: 'FTP allowed',
        description: 'App Service allows unencrypted FTP connections.',
        remediation: 'Set site_config.ftps_state = "FtpsOnly" or "Disabled"',
        complianceFrameworks: ['CIS']
    },
    {
        id: 'appservice-identity',
        resourceType: 'azurerm_linux_web_app',
        attribute: 'identity',
        operator: 'not_exists',
        value: null,
        severity: 'low',
        title: 'No managed identity',
        description: 'App Service has no managed identity configured.',
        remediation: 'Add identity block with type = "SystemAssigned"',
        complianceFrameworks: ['NIST']
    },

    // ==========================================
    // Virtual Machine Rules
    // ==========================================
    {
        id: 'vm-managed-identity',
        resourceType: 'azurerm_linux_virtual_machine',
        attribute: 'identity',
        operator: 'not_exists',
        value: null,
        severity: 'low',
        title: 'No managed identity',
        description: 'Virtual machine has no managed identity configured.',
        remediation: 'Add identity block with type = "SystemAssigned"',
        complianceFrameworks: ['NIST']
    },
    {
        id: 'vm-encryption-at-host',
        resourceType: 'azurerm_linux_virtual_machine',
        attribute: 'encryption_at_host_enabled',
        operator: 'not_equals',
        value: true,
        severity: 'medium',
        title: 'Host encryption disabled',
        description: 'Virtual machine does not have encryption at host enabled.',
        remediation: 'Set encryption_at_host_enabled = true',
        complianceFrameworks: ['CIS', 'NIST']
    },
    {
        id: 'vm-disk-encryption',
        resourceType: 'azurerm_linux_virtual_machine',
        attribute: 'os_disk.disk_encryption_set_id',
        operator: 'not_exists',
        value: null,
        severity: 'medium',
        title: 'No disk encryption set',
        description: 'VM OS disk is not using customer-managed encryption keys.',
        remediation: 'Set os_disk.disk_encryption_set_id to a disk encryption set',
        complianceFrameworks: ['CIS', 'PCI-DSS']
    },

    // ==========================================
    // Container Registry Rules
    // ==========================================
    {
        id: 'acr-admin-disabled',
        resourceType: 'azurerm_container_registry',
        attribute: 'admin_enabled',
        operator: 'equals',
        value: true,
        severity: 'medium',
        title: 'Admin account enabled',
        description: 'Container Registry has admin account enabled.',
        remediation: 'Set admin_enabled = false and use Azure AD authentication',
        complianceFrameworks: ['CIS']
    },
    {
        id: 'acr-public-access',
        resourceType: 'azurerm_container_registry',
        attribute: 'public_network_access_enabled',
        operator: 'equals',
        value: true,
        severity: 'medium',
        title: 'Public network access enabled',
        description: 'Container Registry is accessible from the public internet.',
        remediation: 'Set public_network_access_enabled = false',
        complianceFrameworks: ['CIS']
    },
    {
        id: 'acr-content-trust',
        resourceType: 'azurerm_container_registry',
        attribute: 'trust_policy',
        operator: 'not_exists',
        value: null,
        severity: 'low',
        title: 'Content trust not enabled',
        description: 'Container Registry does not have content trust (image signing) enabled.',
        remediation: 'Add trust_policy block with enabled = true',
        complianceFrameworks: ['CIS']
    },

    // ==========================================
    // Cosmos DB Rules
    // ==========================================
    {
        id: 'cosmosdb-public-access',
        resourceType: 'azurerm_cosmosdb_account',
        attribute: 'public_network_access_enabled',
        operator: 'equals',
        value: true,
        severity: 'medium',
        title: 'Public network access enabled',
        description: 'Cosmos DB is accessible from the public internet.',
        remediation: 'Set public_network_access_enabled = false',
        complianceFrameworks: ['CIS']
    },
    {
        id: 'cosmosdb-local-auth',
        resourceType: 'azurerm_cosmosdb_account',
        attribute: 'local_authentication_disabled',
        operator: 'not_equals',
        value: true,
        severity: 'medium',
        title: 'Local authentication enabled',
        description: 'Cosmos DB allows key-based authentication.',
        remediation: 'Set local_authentication_disabled = true',
        complianceFrameworks: ['CIS']
    },

    // ==========================================
    // Redis Cache Rules
    // ==========================================
    {
        id: 'redis-min-tls',
        resourceType: 'azurerm_redis_cache',
        attribute: 'minimum_tls_version',
        operator: 'not_equals',
        value: '1.2',
        severity: 'medium',
        title: 'TLS version below 1.2',
        description: 'Redis Cache accepts TLS versions older than 1.2.',
        remediation: 'Set minimum_tls_version = "1.2"',
        complianceFrameworks: ['CIS', 'PCI-DSS']
    },
    {
        id: 'redis-ssl-only',
        resourceType: 'azurerm_redis_cache',
        attribute: 'enable_non_ssl_port',
        operator: 'equals',
        value: true,
        severity: 'high',
        title: 'Non-SSL port enabled',
        description: 'Redis Cache allows non-SSL connections.',
        remediation: 'Set enable_non_ssl_port = false',
        complianceFrameworks: ['CIS', 'PCI-DSS']
    },
    {
        id: 'redis-public-access',
        resourceType: 'azurerm_redis_cache',
        attribute: 'public_network_access_enabled',
        operator: 'equals',
        value: true,
        severity: 'medium',
        title: 'Public network access enabled',
        description: 'Redis Cache is accessible from the public internet.',
        remediation: 'Set public_network_access_enabled = false',
        complianceFrameworks: ['CIS']
    },

    // ==========================================
    // PostgreSQL Rules
    // ==========================================
    {
        id: 'postgresql-ssl',
        resourceType: 'azurerm_postgresql_server',
        attribute: 'ssl_enforcement_enabled',
        operator: 'not_equals',
        value: true,
        severity: 'high',
        title: 'SSL not enforced',
        description: 'PostgreSQL server allows non-SSL connections.',
        remediation: 'Set ssl_enforcement_enabled = true',
        complianceFrameworks: ['CIS', 'PCI-DSS']
    },
    {
        id: 'postgresql-min-tls',
        resourceType: 'azurerm_postgresql_server',
        attribute: 'ssl_minimal_tls_version_enforced',
        operator: 'not_equals',
        value: 'TLS1_2',
        severity: 'medium',
        title: 'TLS version below 1.2',
        description: 'PostgreSQL server accepts TLS versions older than 1.2.',
        remediation: 'Set ssl_minimal_tls_version_enforced = "TLS1_2"',
        complianceFrameworks: ['CIS', 'PCI-DSS']
    },
    {
        id: 'postgresql-public-access',
        resourceType: 'azurerm_postgresql_server',
        attribute: 'public_network_access_enabled',
        operator: 'equals',
        value: true,
        severity: 'medium',
        title: 'Public network access enabled',
        description: 'PostgreSQL server is accessible from the public internet.',
        remediation: 'Set public_network_access_enabled = false',
        complianceFrameworks: ['CIS']
    },

    // ==========================================
    // MySQL Rules
    // ==========================================
    {
        id: 'mysql-ssl',
        resourceType: 'azurerm_mysql_server',
        attribute: 'ssl_enforcement_enabled',
        operator: 'not_equals',
        value: true,
        severity: 'high',
        title: 'SSL not enforced',
        description: 'MySQL server allows non-SSL connections.',
        remediation: 'Set ssl_enforcement_enabled = true',
        complianceFrameworks: ['CIS', 'PCI-DSS']
    },
    {
        id: 'mysql-min-tls',
        resourceType: 'azurerm_mysql_server',
        attribute: 'ssl_minimal_tls_version_enforced',
        operator: 'not_equals',
        value: 'TLS1_2',
        severity: 'medium',
        title: 'TLS version below 1.2',
        description: 'MySQL server accepts TLS versions older than 1.2.',
        remediation: 'Set ssl_minimal_tls_version_enforced = "TLS1_2"',
        complianceFrameworks: ['CIS', 'PCI-DSS']
    },
    {
        id: 'mysql-public-access',
        resourceType: 'azurerm_mysql_server',
        attribute: 'public_network_access_enabled',
        operator: 'equals',
        value: true,
        severity: 'medium',
        title: 'Public network access enabled',
        description: 'MySQL server is accessible from the public internet.',
        remediation: 'Set public_network_access_enabled = false',
        complianceFrameworks: ['CIS']
    },

    // ==========================================
    // Network Security Group Rules
    // ==========================================
    {
        id: 'nsg-allow-all-inbound',
        resourceType: 'azurerm_network_security_rule',
        attribute: 'source_address_prefix',
        operator: 'equals',
        value: '*',
        severity: 'high',
        title: 'Allow all inbound traffic',
        description: 'NSG rule allows traffic from any source.',
        remediation: 'Restrict source_address_prefix to specific IP ranges',
        complianceFrameworks: ['CIS', 'NIST']
    },
    {
        id: 'nsg-rdp-open',
        resourceType: 'azurerm_network_security_rule',
        attribute: 'destination_port_range',
        operator: 'equals',
        value: '3389',
        severity: 'critical',
        title: 'RDP port open',
        description: 'NSG rule exposes RDP port (3389) which is commonly attacked.',
        remediation: 'Use Azure Bastion or restrict RDP access to specific IPs',
        complianceFrameworks: ['CIS', 'NIST', 'PCI-DSS']
    },
    {
        id: 'nsg-ssh-open',
        resourceType: 'azurerm_network_security_rule',
        attribute: 'destination_port_range',
        operator: 'equals',
        value: '22',
        severity: 'high',
        title: 'SSH port open',
        description: 'NSG rule exposes SSH port (22) which is commonly attacked.',
        remediation: 'Use Azure Bastion or restrict SSH access to specific IPs',
        complianceFrameworks: ['CIS', 'NIST']
    },

    // ==========================================
    // Application Gateway Rules
    // ==========================================
    {
        id: 'appgw-waf',
        resourceType: 'azurerm_application_gateway',
        attribute: 'waf_configuration',
        operator: 'not_exists',
        value: null,
        severity: 'medium',
        title: 'WAF not enabled',
        description: 'Application Gateway does not have WAF (Web Application Firewall) enabled.',
        remediation: 'Add waf_configuration block or use firewall_policy_id',
        complianceFrameworks: ['CIS', 'NIST']
    },

    // ==========================================
    // Service Bus Rules
    // ==========================================
    {
        id: 'servicebus-local-auth',
        resourceType: 'azurerm_servicebus_namespace',
        attribute: 'local_auth_enabled',
        operator: 'equals',
        value: true,
        severity: 'medium',
        title: 'Local authentication enabled',
        description: 'Service Bus allows SAS key authentication.',
        remediation: 'Set local_auth_enabled = false and use managed identity',
        complianceFrameworks: ['CIS']
    },
    {
        id: 'servicebus-public-access',
        resourceType: 'azurerm_servicebus_namespace',
        attribute: 'public_network_access_enabled',
        operator: 'equals',
        value: true,
        severity: 'medium',
        title: 'Public network access enabled',
        description: 'Service Bus is accessible from the public internet.',
        remediation: 'Set public_network_access_enabled = false',
        complianceFrameworks: ['CIS']
    },

    // ==========================================
    // Event Hub Rules
    // ==========================================
    {
        id: 'eventhub-local-auth',
        resourceType: 'azurerm_eventhub_namespace',
        attribute: 'local_authentication_enabled',
        operator: 'equals',
        value: true,
        severity: 'medium',
        title: 'Local authentication enabled',
        description: 'Event Hub allows SAS key authentication.',
        remediation: 'Set local_authentication_enabled = false and use managed identity',
        complianceFrameworks: ['CIS']
    },
    {
        id: 'eventhub-public-access',
        resourceType: 'azurerm_eventhub_namespace',
        attribute: 'public_network_access_enabled',
        operator: 'equals',
        value: true,
        severity: 'medium',
        title: 'Public network access enabled',
        description: 'Event Hub is accessible from the public internet.',
        remediation: 'Set public_network_access_enabled = false',
        complianceFrameworks: ['CIS']
    }
];

/**
 * Get security rules for a specific resource type
 */
export function getSecurityRulesForType(resourceType: string): SecurityRule[] {
    return SECURITY_RULES.filter(rule => rule.resourceType === resourceType);
}

/**
 * Get all security rules grouped by severity
 */
export function getSecurityRulesBySeverity(): Record<SecuritySeverity, SecurityRule[]> {
    const grouped: Record<SecuritySeverity, SecurityRule[]> = {
        critical: [],
        high: [],
        medium: [],
        low: [],
        info: []
    };

    for (const rule of SECURITY_RULES) {
        grouped[rule.severity].push(rule);
    }

    return grouped;
}

/**
 * Get all resource types that have security rules
 */
export function getResourceTypesWithSecurityRules(): string[] {
    return [...new Set(SECURITY_RULES.map(rule => rule.resourceType))];
}

/**
 * Severity weight for scoring
 */
export const SEVERITY_WEIGHTS: Record<SecuritySeverity, number> = {
    critical: 100,
    high: 75,
    medium: 50,
    low: 25,
    info: 10
};
