import * as fs from 'fs';
import * as path from 'path';
import { DiagramNode } from './diagramLayout';
import { TerraformResource } from './terraformParser';
import { AzureIconMapper } from './azureIconMapper';
import { 
    DiagramConnection, 
    SecurityPosture, 
    CostEstimate, 
    SKUInfo, 
    TagCompliance,
    EnhancedDiagramNode 
} from './types';
// Category colors for left border
const CATEGORY_COLORS: Record<string, string> = {
    'Compute': '#107C10',
    'Networking': '#00485B',
    'Storage': '#0078D4',
    'Databases': '#E81123',
    'Security': '#FF8C00',
    'Monitoring + Management': '#8661C5',
    'Containers': '#00BCF2',
    'Web': '#FFB900',
    'Identity': '#5C2D91',
    'Analytics': '#0099BC',
    'AI + Machine Learning': '#7719AA',
    'Integration': '#CA5010',
    'DevOps': '#038387',
    'General': '#69797E'
};

// Zone tint colors
const ZONE_COLORS: Record<string, { bg: string; border: string }> = {
    'networking': { bg: 'rgba(0, 72, 91, 0.06)', border: 'rgba(0, 72, 91, 0.18)' },
    'data': { bg: 'rgba(0, 120, 212, 0.06)', border: 'rgba(0, 120, 212, 0.18)' },
    'application': { bg: 'rgba(16, 124, 16, 0.06)', border: 'rgba(16, 124, 16, 0.18)' },
    'security': { bg: 'rgba(255, 140, 0, 0.06)', border: 'rgba(255, 140, 0, 0.18)' },
    'management': { bg: 'rgba(134, 97, 197, 0.06)', border: 'rgba(134, 97, 197, 0.18)' },
    'identity': { bg: 'rgba(92, 45, 145, 0.06)', border: 'rgba(92, 45, 145, 0.18)' },
    'edge': { bg: 'rgba(0, 0, 0, 0.03)', border: 'rgba(0, 0, 0, 0.10)' },
    'dmz': { bg: 'rgba(255, 0, 0, 0.04)', border: 'rgba(255, 0, 0, 0.12)' },
    'presentation': { bg: 'rgba(104, 33, 122, 0.05)', border: 'rgba(104, 33, 122, 0.14)' },
    'other': { bg: 'rgba(243, 242, 241, 0.30)', border: 'rgba(0, 0, 0, 0.10)' }
};

export class DiagramRenderer {
    private extensionPath: string;
    private resourceMap: Map<string, TerraformResource> = new Map();

    constructor(extensionPath: string) {
        this.extensionPath = extensionPath;
    }

    /**
     * Set resources for detail extraction
     */
    setResources(resources: TerraformResource[]): void {
        this.resourceMap.clear();
        resources.forEach(r => {
            this.resourceMap.set(`${r.type}_${r.name}`, r);
        });
    }

    /**
     * Get resource detail lines (IP, SKU, size, etc.) - returns array for multi-line display
     * Enhanced with DevOps-relevant information
     */
    private getResourceDetails(node: DiagramNode): string[] {
        const resource = this.resourceMap.get(node.id);
        if (!resource) return [];

        const ni = resource.networkInfo || {};
        const attr = resource.attributes || {};
        const tags = resource.tags || {};
        const details: string[] = [];

        // Helper to add non-empty values
        const add = (value: string | undefined | null) => {
            if (value && value.trim()) details.push(value.trim());
        };

        // Helper to extract reference name from Terraform reference
        const extractRef = (value: any): string => {
            if (typeof value === 'string') {
                const match = value.match(/azurerm_\w+\.([^.]+)/);
                return match ? match[1] : value;
            }
            return String(value);
        };

        // Helper to format tags for display
        const formatTags = (): string | undefined => {
            const importantTags = ['environment', 'env', 'owner', 'cost-center', 'project'];
            const found: string[] = [];
            importantTags.forEach(t => {
                if (tags[t]) found.push(`${t}:${tags[t]}`);
            });
            return found.length > 0 ? found.slice(0, 2).join(' ') : undefined;
        };

        // Resource Group
        if (node.type === 'azurerm_resource_group') {
            add(attr.location);
            add(formatTags());
            return details;
        }

        // VNet: address space + DNS + peering info
        if (node.type === 'azurerm_virtual_network') {
            if (attr.address_space) {
                const space = Array.isArray(attr.address_space) ? attr.address_space.join(', ') : attr.address_space;
                add(`CIDR: ${space}`);
            }
            add(attr.location);
            if (attr.dns_servers && Array.isArray(attr.dns_servers) && attr.dns_servers.length > 0) {
                add(`DNS: ${attr.dns_servers.join(', ')}`);
            }
            if (attr.bgp_community) add(`BGP: ${attr.bgp_community}`);
            add(formatTags());
            return details;
        }

        // VNet Peering
        if (node.type === 'azurerm_virtual_network_peering') {
            if (attr.allow_virtual_network_access) add('VNet Access: Yes');
            if (attr.allow_forwarded_traffic) add('Forwarding: Yes');
            if (attr.allow_gateway_transit) add('Gateway Transit');
            if (attr.use_remote_gateways) add('Use Remote GW');
            return details;
        }

        // Subnet: CIDR prefix + delegations + service endpoints
        if (node.type === 'azurerm_subnet') {
            if (attr.address_prefixes) {
                const p = Array.isArray(attr.address_prefixes) ? attr.address_prefixes.join(', ') : attr.address_prefixes;
                add(`CIDR: ${p}`);
            } else if (attr.address_prefix) {
                add(`CIDR: ${attr.address_prefix}`);
            } else if (ni.addressPrefix) {
                add(`CIDR: ${ni.addressPrefix.split(' in ')[0]}`);
            }
            if (attr.service_endpoints && Array.isArray(attr.service_endpoints)) {
                const endpoints = attr.service_endpoints.map((e: string) => e.replace('Microsoft.', '')).slice(0, 3);
                add(`Endpoints: ${endpoints.join(', ')}`);
            }
            if (attr.delegation) {
                const del = Array.isArray(attr.delegation) ? attr.delegation[0] : attr.delegation;
                if (del && del.name) add(`Delegation: ${del.name}`);
            }
            if (attr.private_endpoint_network_policies_enabled === false) add('PE Policies: Off');
            return details;
        }

        // NIC: private IP + subnet ref + accelerated networking
        if (node.type === 'azurerm_network_interface') {
            if (ni.privateIpAddress) add(`Private IP: ${ni.privateIpAddress}`);
            if (attr.ip_configuration) {
                const ipConfig = Array.isArray(attr.ip_configuration) ? attr.ip_configuration[0] : attr.ip_configuration;
                if (ipConfig) {
                    if (ipConfig.private_ip_address) add(`IP: ${ipConfig.private_ip_address}`);
                    if (ipConfig.private_ip_address_allocation) add(ipConfig.private_ip_address_allocation);
                    if (ipConfig.public_ip_address_id) add('Has Public IP');
                }
            }
            if (attr.enable_accelerated_networking) add('Accelerated NW');
            if (attr.enable_ip_forwarding) add('IP Forwarding');
            return details;
        }

        // Public IP
        if (node.type === 'azurerm_public_ip') {
            if (attr.allocation_method) add(attr.allocation_method);
            if (attr.sku) add(`SKU: ${attr.sku}`);
            if (attr.sku_tier) add(`Tier: ${attr.sku_tier}`);
            if (attr.zones && Array.isArray(attr.zones)) add(`Zones: ${attr.zones.join(',')}`);
            if (attr.domain_name_label) add(`DNS: ${attr.domain_name_label}`);
            if (attr.ip_version) add(attr.ip_version);
            if (attr.idle_timeout_in_minutes) add(`Timeout: ${attr.idle_timeout_in_minutes}m`);
            return details;
        }

        // NSG: rule count + key rules with ports
        if (node.type === 'azurerm_network_security_group') {
            if (resource.securityRules && resource.securityRules.length > 0) {
                add(`${resource.securityRules.length} security rules`);
                // Show ports from first few rules
                const portsInfo = resource.securityRules.slice(0, 3).map(r => {
                    const port = r.destinationPortRange || '*';
                    const access = r.access === 'Allow' ? '✓' : '✗';
                    return `${access}${port}`;
                }).join(' ');
                if (portsInfo) add(portsInfo);
            }
            add(attr.location);
            return details;
        }

        // NSG Rule - detailed
        if (node.type === 'azurerm_network_security_rule') {
            add(`${attr.direction || ''} ${attr.access || ''}`);
            if (attr.protocol) add(`Proto: ${attr.protocol}`);
            if (attr.source_port_range) add(`Src: ${attr.source_port_range}`);
            if (attr.destination_port_range) add(`Dst: ${attr.destination_port_range}`);
            if (attr.source_address_prefix) add(`From: ${attr.source_address_prefix}`);
            if (attr.destination_address_prefix) add(`To: ${attr.destination_address_prefix}`);
            if (attr.priority) add(`Priority: ${attr.priority}`);
            return details;
        }

        // VM: size + OS + disk + networking
        if (node.type.includes('virtual_machine') || node.type.includes('linux_virtual_machine') || node.type.includes('windows_virtual_machine')) {
            const size = attr.size || attr.vm_size;
            if (size) add(`Size: ${size}`);
            if (attr.admin_username) add(`Admin: ${attr.admin_username}`);
            if (attr.source_image_reference) {
                const img = attr.source_image_reference;
                if (typeof img === 'object') {
                    const os = `${img.offer || ''}${img.sku ? ' ' + img.sku : ''}`;
                    if (os.trim()) add(`OS: ${os.trim()}`);
                }
            }
            if (attr.os_disk) {
                const disk = attr.os_disk;
                if (typeof disk === 'object') {
                    const diskInfo = [];
                    if (disk.storage_account_type) diskInfo.push(disk.storage_account_type);
                    if (disk.disk_size_gb) diskInfo.push(`${disk.disk_size_gb}GB`);
                    if (disk.caching) diskInfo.push(disk.caching);
                    if (diskInfo.length) add(`Disk: ${diskInfo.join(' ')}`);
                }
            }
            if (attr.zone) add(`Zone: ${attr.zone}`);
            if (attr.availability_set_id) add('In Avail Set');
            if (attr.proximity_placement_group_id) add('PPG');
            if (attr.boot_diagnostics) add('Boot Diag');
            if (attr.identity) add('Managed ID');
            add(formatTags());
            return details;
        }

        // VM Scale Set
        if (node.type === 'azurerm_virtual_machine_scale_set' || node.type.includes('orchestrated_virtual_machine_scale_set')) {
            if (attr.sku) add(`SKU: ${attr.sku}`);
            if (attr.instances) add(`Instances: ${attr.instances}`);
            if (attr.zones && Array.isArray(attr.zones)) add(`Zones: ${attr.zones.join(',')}`);
            if (attr.upgrade_policy_mode) add(`Upgrade: ${attr.upgrade_policy_mode}`);
            if (attr.overprovision !== undefined) add(`Overprov: ${attr.overprovision}`);
            if (attr.single_placement_group !== undefined) add(`Single PG: ${attr.single_placement_group}`);
            return details;
        }

        // Storage account - comprehensive
        if (node.type === 'azurerm_storage_account') {
            if (attr.account_tier && attr.account_replication_type) {
                add(`${attr.account_tier}_${attr.account_replication_type}`);
            }
            if (attr.account_kind) add(attr.account_kind);
            if (attr.access_tier) add(`Access: ${attr.access_tier}`);
            if (attr.min_tls_version) add(`TLS: ${attr.min_tls_version}`);
            if (attr.enable_https_traffic_only || attr.https_traffic_only_enabled) add('HTTPS only');
            if (attr.allow_nested_items_to_be_public === false) add('No public blobs');
            if (attr.is_hns_enabled) add('HNS (ADLS)');
            if (attr.nfsv3_enabled) add('NFSv3');
            if (attr.large_file_share_enabled) add('Large Files');
            if (attr.network_rules) {
                const nr = attr.network_rules;
                if (typeof nr === 'object' && nr.default_action) {
                    add(`Default: ${nr.default_action}`);
                }
            }
            add(formatTags());
            return details;
        }

        // Storage container
        if (node.type === 'azurerm_storage_container') {
            if (attr.container_access_type) add(`Access: ${attr.container_access_type}`);
            if (attr.metadata) add('Has Metadata');
            return details;
        }

        // Storage share (File)
        if (node.type === 'azurerm_storage_share') {
            if (attr.quota) add(`Quota: ${attr.quota}GB`);
            if (attr.access_tier) add(`Tier: ${attr.access_tier}`);
            if (attr.enabled_protocol) add(`Protocol: ${attr.enabled_protocol}`);
            return details;
        }

        // Managed Disk
        if (node.type === 'azurerm_managed_disk') {
            if (attr.storage_account_type) add(attr.storage_account_type);
            if (attr.disk_size_gb) add(`${attr.disk_size_gb}GB`);
            if (attr.disk_iops_read_write) add(`IOPS: ${attr.disk_iops_read_write}`);
            if (attr.disk_mbps_read_write) add(`MBps: ${attr.disk_mbps_read_write}`);
            if (attr.zone) add(`Zone: ${attr.zone}`);
            if (attr.network_access_policy) add(`Net: ${attr.network_access_policy}`);
            return details;
        }

        // SQL Server - comprehensive
        if (node.type === 'azurerm_sql_server' || node.type === 'azurerm_mssql_server') {
            if (attr.version) add(`SQL v${attr.version}`);
            if (attr.administrator_login) add(`Admin: ${attr.administrator_login}`);
            if (attr.minimum_tls_version) add(`TLS: ${attr.minimum_tls_version}`);
            if (attr.public_network_access_enabled === false) add('Private only');
            if (attr.outbound_network_restriction_enabled) add('Outbound restricted');
            if (attr.azuread_administrator) add('AAD Admin');
            if (attr.identity) add('Managed ID');
            add(attr.location);
            add(formatTags());
            return details;
        }

        // SQL Database - comprehensive
        if (node.type === 'azurerm_sql_database' || node.type === 'azurerm_mssql_database') {
            if (attr.sku_name) add(`SKU: ${attr.sku_name}`);
            if (attr.max_size_gb) add(`Max: ${attr.max_size_gb}GB`);
            if (attr.collation) add(attr.collation);
            if (attr.zone_redundant) add('Zone Redundant');
            if (attr.read_scale) add('Read Scale-out');
            if (attr.geo_backup_enabled) add('Geo Backup');
            if (attr.license_type) add(`License: ${attr.license_type}`);
            if (attr.min_capacity) add(`Min vCores: ${attr.min_capacity}`);
            if (attr.auto_pause_delay_in_minutes) add(`AutoPause: ${attr.auto_pause_delay_in_minutes}m`);
            if (attr.short_term_retention_policy) {
                const stp = attr.short_term_retention_policy;
                if (typeof stp === 'object' && stp.retention_days) {
                    add(`PITR: ${stp.retention_days}d`);
                }
            }
            if (attr.long_term_retention_policy) add('LTR enabled');
            add(formatTags());
            return details;
        }

        // SQL Elastic Pool
        if (node.type === 'azurerm_mssql_elasticpool') {
            if (attr.sku) {
                const sku = attr.sku;
                if (typeof sku === 'object') {
                    if (sku.name) add(`SKU: ${sku.name}`);
                    if (sku.tier) add(`Tier: ${sku.tier}`);
                    if (sku.capacity) add(`DTU/vCore: ${sku.capacity}`);
                }
            }
            if (attr.max_size_gb) add(`Max: ${attr.max_size_gb}GB`);
            if (attr.zone_redundant) add('Zone Redundant');
            return details;
        }

        // PostgreSQL / MySQL - comprehensive
        if (node.type.includes('postgresql') || node.type.includes('mysql')) {
            if (attr.sku_name) add(`SKU: ${attr.sku_name}`);
            if (attr.version) add(`v${attr.version}`);
            if (attr.storage_mb) add(`Storage: ${Math.round(attr.storage_mb / 1024)}GB`);
            if (attr.administrator_login) add(`Admin: ${attr.administrator_login}`);
            if (attr.ssl_enforcement_enabled) add('SSL enforced');
            if (attr.ssl_minimal_tls_version_enforced) add(`TLS: ${attr.ssl_minimal_tls_version_enforced}`);
            if (attr.geo_redundant_backup_enabled) add('Geo Backup');
            if (attr.backup_retention_days) add(`Backup: ${attr.backup_retention_days}d`);
            if (attr.auto_grow_enabled) add('Auto Grow');
            if (attr.public_network_access_enabled === false) add('Private');
            if (attr.high_availability) add('HA enabled');
            add(formatTags());
            return details;
        }

        // AKS - comprehensive DevOps info
        if (node.type === 'azurerm_kubernetes_cluster') {
            if (attr.kubernetes_version) add(`K8s: ${attr.kubernetes_version}`);
            if (attr.sku_tier) add(`Tier: ${attr.sku_tier}`);
            if (attr.default_node_pool) {
                const pool = attr.default_node_pool;
                if (typeof pool === 'object') {
                    if (pool.vm_size) add(`VM: ${pool.vm_size}`);
                    if (pool.node_count) add(`Nodes: ${pool.node_count}`);
                    if (pool.min_count !== undefined && pool.max_count !== undefined) {
                        add(`Autoscale: ${pool.min_count}-${pool.max_count}`);
                    }
                    if (pool.zones && Array.isArray(pool.zones)) add(`Zones: ${pool.zones.join(',')}`);
                    if (pool.os_disk_size_gb) add(`OS Disk: ${pool.os_disk_size_gb}GB`);
                    if (pool.os_disk_type) add(`Disk: ${pool.os_disk_type}`);
                }
            }
            if (attr.network_profile) {
                const net = attr.network_profile;
                if (typeof net === 'object') {
                    if (net.network_plugin) add(`CNI: ${net.network_plugin}`);
                    if (net.network_policy) add(`Policy: ${net.network_policy}`);
                    if (net.service_cidr) add(`Svc CIDR: ${net.service_cidr}`);
                    if (net.dns_service_ip) add(`DNS IP: ${net.dns_service_ip}`);
                    if (net.load_balancer_sku) add(`LB: ${net.load_balancer_sku}`);
                }
            }
            if (attr.private_cluster_enabled) add('Private Cluster');
            if (attr.azure_policy_enabled) add('Azure Policy');
            if (attr.role_based_access_control_enabled) add('RBAC');
            if (attr.oidc_issuer_enabled) add('OIDC');
            if (attr.workload_identity_enabled) add('Workload ID');
            if (attr.automatic_channel_upgrade) add(`Upgrade: ${attr.automatic_channel_upgrade}`);
            if (attr.identity) add('Managed ID');
            add(formatTags());
            return details;
        }

        // AKS Node Pool
        if (node.type === 'azurerm_kubernetes_cluster_node_pool') {
            if (attr.vm_size) add(`VM: ${attr.vm_size}`);
            if (attr.node_count) add(`Nodes: ${attr.node_count}`);
            if (attr.min_count !== undefined && attr.max_count !== undefined) {
                add(`Autoscale: ${attr.min_count}-${attr.max_count}`);
            }
            if (attr.os_type) add(`OS: ${attr.os_type}`);
            if (attr.os_disk_size_gb) add(`Disk: ${attr.os_disk_size_gb}GB`);
            if (attr.zones && Array.isArray(attr.zones)) add(`Zones: ${attr.zones.join(',')}`);
            if (attr.node_taints && Array.isArray(attr.node_taints)) add(`Taints: ${attr.node_taints.length}`);
            if (attr.node_labels) add('Has Labels');
            if (attr.mode) add(`Mode: ${attr.mode}`);
            return details;
        }

        // App Service / Web App - comprehensive
        if (node.type === 'azurerm_app_service' || node.type === 'azurerm_linux_web_app' || node.type === 'azurerm_windows_web_app') {
            if (attr.https_only) add('HTTPS only');
            if (attr.site_config) {
                const cfg = attr.site_config;
                if (typeof cfg === 'object') {
                    if (cfg.always_on) add('Always On');
                    if (cfg.http2_enabled) add('HTTP/2');
                    if (cfg.minimum_tls_version) add(`TLS: ${cfg.minimum_tls_version}`);
                    if (cfg.ftps_state) add(`FTPS: ${cfg.ftps_state}`);
                    if (cfg.health_check_path) add(`Health: ${cfg.health_check_path}`);
                    if (cfg.worker_count) add(`Workers: ${cfg.worker_count}`);
                    if (cfg.application_stack) {
                        const stack = cfg.application_stack;
                        if (typeof stack === 'object') {
                            const ver = stack.node_version || stack.python_version || stack.dotnet_version || stack.java_version;
                            if (ver) add(`Runtime: ${ver}`);
                        }
                    }
                }
            }
            if (attr.virtual_network_subnet_id) add('VNet Integrated');
            if (attr.identity) add('Managed ID');
            add(formatTags());
            return details;
        }

        // Service Plan - comprehensive
        if (node.type === 'azurerm_app_service_plan' || node.type === 'azurerm_service_plan') {
            if (attr.sku_name) add(`SKU: ${attr.sku_name}`);
            if (attr.os_type) add(attr.os_type);
            if (attr.worker_count) add(`Workers: ${attr.worker_count}`);
            if (attr.zone_balancing_enabled) add('Zone Balanced');
            if (attr.maximum_elastic_worker_count) add(`Max Elastic: ${attr.maximum_elastic_worker_count}`);
            if (attr.sku && typeof attr.sku === 'object') {
                if (attr.sku.tier) add(`Tier: ${attr.sku.tier}`);
                if (attr.sku.size) add(`Size: ${attr.sku.size}`);
            }
            add(formatTags());
            return details;
        }

        // Function App - comprehensive
        if (node.type === 'azurerm_function_app' || node.type === 'azurerm_linux_function_app' || node.type === 'azurerm_windows_function_app') {
            if (attr.os_type) add(attr.os_type);
            if (attr.https_only) add('HTTPS only');
            if (attr.functions_extension_version) add(`Runtime: ${attr.functions_extension_version}`);
            if (attr.site_config) {
                const cfg = attr.site_config;
                if (typeof cfg === 'object') {
                    if (cfg.always_on) add('Always On');
                    if (cfg.application_stack) {
                        const stack = cfg.application_stack;
                        if (typeof stack === 'object') {
                            const runtime = stack.node_version || stack.python_version || stack.dotnet_version || stack.java_version;
                            if (runtime) add(`Stack: ${runtime}`);
                        }
                    }
                }
            }
            if (attr.virtual_network_subnet_id) add('VNet Integrated');
            if (attr.identity) add('Managed ID');
            add(formatTags());
            return details;
        }

        // Firewall - comprehensive
        if (node.type === 'azurerm_firewall') {
            if (attr.sku_name) add(`SKU: ${attr.sku_name}`);
            if (attr.sku_tier) add(`Tier: ${attr.sku_tier}`);
            if (attr.threat_intel_mode) add(`Threat Intel: ${attr.threat_intel_mode}`);
            if (attr.zones && Array.isArray(attr.zones)) add(`Zones: ${attr.zones.join(',')}`);
            if (attr.firewall_policy_id) add('Has Policy');
            add(formatTags());
            return details;
        }

        // Application Gateway - comprehensive
        if (node.type === 'azurerm_application_gateway') {
            if (attr.sku && typeof attr.sku === 'object') {
                if (attr.sku.name) add(`SKU: ${attr.sku.name}`);
                if (attr.sku.tier) add(`Tier: ${attr.sku.tier}`);
                if (attr.sku.capacity) add(`Capacity: ${attr.sku.capacity}`);
            }
            if (attr.autoscale_configuration) {
                const as = attr.autoscale_configuration;
                if (typeof as === 'object') {
                    add(`Scale: ${as.min_capacity || 0}-${as.max_capacity || '?'}`);
                }
            }
            if (attr.enable_http2) add('HTTP/2');
            if (attr.zones && Array.isArray(attr.zones)) add(`Zones: ${attr.zones.join(',')}`);
            if (attr.waf_configuration || attr.firewall_policy_id) add('WAF enabled');
            add(formatTags());
            return details;
        }

        // NAT Gateway
        if (node.type === 'azurerm_nat_gateway') {
            if (attr.sku_name) add(`SKU: ${attr.sku_name}`);
            if (attr.idle_timeout_in_minutes) add(`Idle: ${attr.idle_timeout_in_minutes}m`);
            if (attr.zones && Array.isArray(attr.zones)) add(`Zones: ${attr.zones.join(',')}`);
            return details;
        }

        // Load Balancer - comprehensive
        if (node.type === 'azurerm_lb') {
            if (attr.sku) add(`SKU: ${attr.sku}`);
            if (attr.sku_name) add(`SKU: ${attr.sku_name}`);
            if (attr.sku_tier) add(`Tier: ${attr.sku_tier}`);
            if (attr.frontend_ip_configuration) {
                const fips = Array.isArray(attr.frontend_ip_configuration) ? attr.frontend_ip_configuration : [attr.frontend_ip_configuration];
                add(`Frontends: ${fips.length}`);
            }
            add(formatTags());
            return details;
        }

        // Key Vault - comprehensive
        if (node.type === 'azurerm_key_vault') {
            if (attr.sku_name) add(`SKU: ${attr.sku_name}`);
            if (attr.soft_delete_retention_days) add(`Retention: ${attr.soft_delete_retention_days}d`);
            if (attr.purge_protection_enabled) add('Purge Protected');
            if (attr.enable_rbac_authorization) add('RBAC Auth');
            if (attr.enabled_for_deployment) add('VM Deploy');
            if (attr.enabled_for_disk_encryption) add('Disk Encrypt');
            if (attr.public_network_access_enabled === false) add('Private');
            add(formatTags());
            return details;
        }

        // Redis Cache - comprehensive
        if (node.type === 'azurerm_redis_cache') {
            if (attr.sku_name) add(`SKU: ${attr.sku_name}`);
            if (attr.family && attr.capacity) add(`${attr.family}${attr.capacity}`);
            if (attr.minimum_tls_version) add(`TLS: ${attr.minimum_tls_version}`);
            if (attr.enable_non_ssl_port === false) add('SSL only');
            if (attr.shard_count) add(`Shards: ${attr.shard_count}`);
            if (attr.replicas_per_master) add(`Replicas: ${attr.replicas_per_master}`);
            if (attr.zones && Array.isArray(attr.zones)) add(`Zones: ${attr.zones.join(',')}`);
            if (attr.redis_configuration) {
                const cfg = attr.redis_configuration;
                if (typeof cfg === 'object') {
                    if (cfg.maxmemory_policy) add(`Evict: ${cfg.maxmemory_policy}`);
                    if (cfg.rdb_backup_enabled) add('RDB Backup');
                    if (cfg.aof_backup_enabled) add('AOF Backup');
                }
            }
            add(formatTags());
            return details;
        }

        // Cosmos DB - comprehensive
        if (node.type === 'azurerm_cosmosdb_account') {
            if (attr.offer_type) add(attr.offer_type);
            if (attr.kind) add(attr.kind);
            if (attr.consistency_policy) {
                const cp = attr.consistency_policy;
                if (typeof cp === 'object' && cp.consistency_level) {
                    add(`Consistency: ${cp.consistency_level}`);
                }
            }
            if (attr.geo_location) {
                const locs = Array.isArray(attr.geo_location) ? attr.geo_location : [attr.geo_location];
                add(`Regions: ${locs.length}`);
            }
            if (attr.is_virtual_network_filter_enabled) add('VNet Filter');
            if (attr.enable_automatic_failover) add('Auto Failover');
            if (attr.enable_multiple_write_locations) add('Multi-Write');
            if (attr.public_network_access_enabled === false) add('Private');
            if (attr.analytical_storage_enabled) add('Analytical');
            add(formatTags());
            return details;
        }

        // Container group - comprehensive
        if (node.type === 'azurerm_container_group') {
            if (attr.os_type) add(attr.os_type);
            if (attr.ip_address_type) add(attr.ip_address_type);
            if (attr.restart_policy) add(`Restart: ${attr.restart_policy}`);
            if (attr.dns_name_label) add(`DNS: ${attr.dns_name_label}`);
            if (ni.ports && ni.ports.length) add(`Ports: ${ni.ports.join(',')}`);
            if (attr.container) {
                const containers = Array.isArray(attr.container) ? attr.container : [attr.container];
                add(`Containers: ${containers.length}`);
                const c = containers[0];
                if (c && typeof c === 'object') {
                    if (c.cpu) add(`CPU: ${c.cpu}`);
                    if (c.memory) add(`Mem: ${c.memory}GB`);
                }
            }
            add(formatTags());
            return details;
        }

        // Container Registry - comprehensive
        if (node.type === 'azurerm_container_registry') {
            if (attr.sku) add(`SKU: ${attr.sku}`);
            if (attr.admin_enabled) add('Admin enabled');
            if (attr.public_network_access_enabled === false) add('Private');
            if (attr.zone_redundancy_enabled) add('Zone Redundant');
            if (attr.georeplications) {
                const geos = Array.isArray(attr.georeplications) ? attr.georeplications : [attr.georeplications];
                add(`Geo-replicas: ${geos.length}`);
            }
            if (attr.retention_policy) add('Retention Policy');
            if (attr.trust_policy) add('Content Trust');
            if (attr.quarantine_policy_enabled) add('Quarantine');
            add(formatTags());
            return details;
        }

        // Log Analytics - comprehensive
        if (node.type === 'azurerm_log_analytics_workspace') {
            if (attr.sku) add(`SKU: ${attr.sku}`);
            if (attr.retention_in_days) add(`Retention: ${attr.retention_in_days}d`);
            if (attr.daily_quota_gb) add(`Quota: ${attr.daily_quota_gb}GB/day`);
            if (attr.internet_ingestion_enabled === false) add('No Internet Ingest');
            if (attr.internet_query_enabled === false) add('No Internet Query');
            if (attr.reservation_capacity_in_gb_per_day) add(`Reserved: ${attr.reservation_capacity_in_gb_per_day}GB`);
            add(formatTags());
            return details;
        }

        // Application Insights - comprehensive
        if (node.type === 'azurerm_application_insights') {
            if (attr.application_type) add(attr.application_type);
            if (attr.retention_in_days) add(`Retention: ${attr.retention_in_days}d`);
            if (attr.sampling_percentage) add(`Sampling: ${attr.sampling_percentage}%`);
            if (attr.daily_data_cap_in_gb) add(`Cap: ${attr.daily_data_cap_in_gb}GB/day`);
            if (attr.disable_ip_masking) add('IP Not Masked');
            if (attr.workspace_id) add('LA Workspace');
            add(formatTags());
            return details;
        }

        // Monitor Action Group
        if (node.type === 'azurerm_monitor_action_group') {
            if (attr.email_receiver) {
                const emails = Array.isArray(attr.email_receiver) ? attr.email_receiver : [attr.email_receiver];
                add(`Email: ${emails.length}`);
            }
            if (attr.sms_receiver) add('SMS');
            if (attr.webhook_receiver) add('Webhook');
            if (attr.azure_function_receiver) add('Function');
            if (attr.logic_app_receiver) add('Logic App');
            if (attr.arm_role_receiver) add('ARM Role');
            return details;
        }

        // Monitor Alert Rule
        if (node.type.includes('monitor_metric_alert') || node.type.includes('monitor_activity_log_alert')) {
            if (attr.severity) add(`Severity: ${attr.severity}`);
            if (attr.frequency) add(`Freq: ${attr.frequency}`);
            if (attr.window_size) add(`Window: ${attr.window_size}`);
            if (attr.auto_mitigate) add('Auto Mitigate');
            return details;
        }

        // Route table - comprehensive
        if (node.type === 'azurerm_route_table') {
            add('UDR');
            if (attr.disable_bgp_route_propagation) add('BGP disabled');
            if (attr.route) {
                const routes = Array.isArray(attr.route) ? attr.route : [attr.route];
                add(`Routes: ${routes.length}`);
            }
            return details;
        }

        // Route
        if (node.type === 'azurerm_route') {
            if (attr.address_prefix) add(`Prefix: ${attr.address_prefix}`);
            if (attr.next_hop_type) add(`→ ${attr.next_hop_type}`);
            if (attr.next_hop_in_ip_address) add(`Next: ${attr.next_hop_in_ip_address}`);
            return details;
        }

        // VPN Gateway - comprehensive
        if (node.type === 'azurerm_virtual_network_gateway') {
            if (attr.type) add(attr.type);
            if (attr.sku) add(`SKU: ${attr.sku}`);
            if (attr.vpn_type) add(attr.vpn_type);
            if (attr.active_active) add('Active-Active');
            if (attr.enable_bgp) add('BGP enabled');
            if (attr.generation) add(`Gen${attr.generation}`);
            if (attr.private_ip_address_enabled) add('Private IP');
            return details;
        }

        // Express Route - comprehensive
        if (node.type === 'azurerm_express_route_circuit') {
            if (attr.service_provider_name) add(attr.service_provider_name);
            if (attr.bandwidth_in_mbps) add(`BW: ${attr.bandwidth_in_mbps}Mbps`);
            if (attr.peering_location) add(attr.peering_location);
            if (attr.sku) {
                const sku = attr.sku;
                if (typeof sku === 'object') {
                    if (sku.tier) add(`Tier: ${sku.tier}`);
                    if (sku.family) add(`Family: ${sku.family}`);
                }
            }
            return details;
        }

        // Bastion - comprehensive
        if (node.type === 'azurerm_bastion_host') {
            if (attr.sku) add(`SKU: ${attr.sku}`);
            if (attr.copy_paste_enabled) add('Copy/Paste');
            if (attr.file_copy_enabled) add('File Copy');
            if (attr.tunneling_enabled) add('Tunneling');
            if (attr.ip_connect_enabled) add('IP Connect');
            if (attr.shareable_link_enabled) add('Shareable Link');
            if (attr.scale_units) add(`Scale: ${attr.scale_units}`);
            return details;
        }

        // Private Endpoint - comprehensive
        if (node.type === 'azurerm_private_endpoint') {
            if (attr.private_service_connection) {
                const psc = attr.private_service_connection;
                if (typeof psc === 'object') {
                    if (psc.subresource_names && Array.isArray(psc.subresource_names)) {
                        add(`Subresource: ${psc.subresource_names.join(', ')}`);
                    }
                    if (psc.is_manual_connection) add('Manual approval');
                }
            }
            if (attr.private_dns_zone_group) add('DNS Zone linked');
            return details;
        }

        // Private DNS Zone
        if (node.type === 'azurerm_private_dns_zone') {
            add(attr.location || 'Global');
            return details;
        }

        // Private DNS Zone VNet Link
        if (node.type === 'azurerm_private_dns_zone_virtual_network_link') {
            if (attr.registration_enabled) add('Auto-register');
            return details;
        }

        // Managed Identity
        if (node.type === 'azurerm_user_assigned_identity') {
            add(attr.location || '');
            add(formatTags());
            return details;
        }

        // Role Assignment - comprehensive
        if (node.type === 'azurerm_role_assignment') {
            if (attr.role_definition_name) add(`Role: ${attr.role_definition_name}`);
            if (attr.principal_type) add(`Type: ${attr.principal_type}`);
            return details;
        }

        // Recovery Services Vault
        if (node.type === 'azurerm_recovery_services_vault') {
            if (attr.sku) add(`SKU: ${attr.sku}`);
            if (attr.soft_delete_enabled) add('Soft Delete');
            if (attr.storage_mode_type) add(`Storage: ${attr.storage_mode_type}`);
            if (attr.cross_region_restore_enabled) add('Cross-Region');
            add(formatTags());
            return details;
        }

        // Backup Policy VM
        if (node.type === 'azurerm_backup_policy_vm') {
            if (attr.backup && attr.backup.frequency) add(`Freq: ${attr.backup.frequency}`);
            if (attr.retention_daily && attr.retention_daily.count) add(`Daily: ${attr.retention_daily.count}d`);
            if (attr.retention_weekly) add('Weekly retention');
            if (attr.retention_monthly) add('Monthly retention');
            if (attr.retention_yearly) add('Yearly retention');
            return details;
        }

        // DNS Zone
        if (node.type === 'azurerm_dns_zone') {
            if (attr.zone_type) add(`Type: ${attr.zone_type}`);
            return details;
        }

        // Front Door
        if (node.type === 'azurerm_frontdoor' || node.type === 'azurerm_cdn_frontdoor_profile') {
            if (attr.sku_name) add(`SKU: ${attr.sku_name}`);
            if (attr.load_balancer_enabled === false) add('LB Disabled');
            return details;
        }

        // CDN Profile
        if (node.type === 'azurerm_cdn_profile') {
            if (attr.sku) add(`SKU: ${attr.sku}`);
            return details;
        }

        // Event Hub
        if (node.type === 'azurerm_eventhub_namespace') {
            if (attr.sku) add(`SKU: ${attr.sku}`);
            if (attr.capacity) add(`Capacity: ${attr.capacity}`);
            if (attr.auto_inflate_enabled) add('Auto-inflate');
            if (attr.maximum_throughput_units) add(`Max TU: ${attr.maximum_throughput_units}`);
            if (attr.zone_redundant) add('Zone Redundant');
            return details;
        }

        // Service Bus
        if (node.type === 'azurerm_servicebus_namespace') {
            if (attr.sku) add(`SKU: ${attr.sku}`);
            if (attr.capacity) add(`Capacity: ${attr.capacity}`);
            if (attr.zone_redundant) add('Zone Redundant');
            if (attr.premium_messaging_partitions) add(`Partitions: ${attr.premium_messaging_partitions}`);
            return details;
        }

        // API Management
        if (node.type === 'azurerm_api_management') {
            if (attr.sku_name) add(`SKU: ${attr.sku_name}`);
            if (attr.publisher_name) add(`Publisher: ${attr.publisher_name}`);
            if (attr.virtual_network_type) add(`VNet: ${attr.virtual_network_type}`);
            if (attr.zones && Array.isArray(attr.zones)) add(`Zones: ${attr.zones.join(',')}`);
            return details;
        }

        // Generic fallback: extract common attributes
        if (attr.sku_name) add(attr.sku_name);
        else if (attr.sku && typeof attr.sku === 'string') add(attr.sku);
        if (attr.location && details.length === 0) add(attr.location);

        return details;
    }

    /**
     * Get resource detail string (single line, for backwards compat)
     */
    private getResourceDetail(node: DiagramNode): string {
        const details = this.getResourceDetails(node);
        return details.slice(0, 2).join(' | ');
    }

    /**
     * Generate SVG string from diagram nodes
     */
    generateSVG(nodes: DiagramNode[], title?: string): string {
        if (nodes.length === 0) {
            return this.generateEmptySVG();
        }

        // Calculate bounds
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        nodes.forEach(node => {
            minX = Math.min(minX, node.x);
            maxX = Math.max(maxX, node.x + node.width);
            minY = Math.min(minY, node.y);
            maxY = Math.max(maxY, node.y + node.height);
        });

        const padding = 40;
        const width = maxX - minX + padding * 2;
        const height = maxY - minY + padding * 2;
        const offsetX = -minX + padding;
        const offsetY = -minY + padding;

        let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <style>
      .node-text { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9px; fill: #201F1E; }
      .node-text-bold { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9px; font-weight: 600; fill: #201F1E; }
      .node-detail { font-family: 'Monaco', 'Consolas', monospace; font-size: 7px; fill: #0078D4; }
      .zone-label { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; font-weight: 600; fill: #605E5C; }
      .connection-line { stroke: #A19F9D; stroke-opacity: 0.6; stroke-width: 1.5; fill: none; }
      .connection-arrow { fill: #A19F9D; fill-opacity: 0.6; }
    </style>
  </defs>
  <rect width="100%" height="100%" fill="white"/>
`;

        // Draw connections first (behind nodes)
        const drawnConnections = new Set<string>();
        nodes.forEach(node => {
            if (node.connections && node.connections.length > 0) {
                node.connections.forEach(connectionId => {
                    const connKey = [node.id, connectionId].sort().join('::');
                    if (drawnConnections.has(connKey)) return;
                    drawnConnections.add(connKey);

                    const targetNode = nodes.find(n => n.id === connectionId);
                    if (targetNode && !node.isGroupContainer && !targetNode.isGroupContainer) {
                        svg += this.renderConnection(node, targetNode, offsetX, offsetY);
                    }
                });
            }
        });

        // Draw group containers first (behind resource nodes)
        // Render resource group containers with special styling
        nodes.filter(n => n.isGroupContainer).forEach(node => {
            if (node.type === 'resource-group-container') {
                svg += this.renderResourceGroupContainer(node, offsetX, offsetY);
            } else {
                svg += this.renderGroupContainer(node, offsetX, offsetY);
            }
        });

        // Draw resource nodes on top
        nodes.filter(n => !n.isGroupContainer && n.type !== 'zone-title').forEach(node => {
            svg += this.renderResourceNode(node, offsetX, offsetY);
        });

        svg += '</svg>';
        return svg;
    }

    private generateEmptySVG(): string {
        return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">
  <rect width="100%" height="100%" fill="white"/>
  <text x="200" y="100" text-anchor="middle" font-family="Segoe UI, Arial" font-size="14" fill="#666">
    No Azure resources found
  </text>
</svg>`;
    }

    private renderGroupContainer(node: DiagramNode, offsetX: number, offsetY: number): string {
        const x = node.x + offsetX;
        const y = node.y + offsetY;
        const zoneName = (node.zone || node.name || '').toLowerCase();
        const zoneColors = ZONE_COLORS[zoneName] || ZONE_COLORS['other'];

        return `
  <g>
    <rect x="${x}" y="${y}" width="${node.width}" height="${node.height}"
          rx="8" ry="8" fill="${zoneColors.bg}" stroke="${zoneColors.border}" stroke-width="1.5"/>
    <rect x="${x}" y="${y}" width="${node.width}" height="24"
          rx="8" ry="8" fill="rgba(0, 120, 212, 0.06)"/>
    <rect x="${x}" y="${y + 16}" width="${node.width}" height="8" fill="${zoneColors.bg}"/>
    <line x1="${x}" y1="${y + 24}" x2="${x + node.width}" y2="${y + 24}"
          stroke="rgba(0, 0, 0, 0.06)" stroke-width="1"/>
    <text x="${x + 12}" y="${y + 16}" class="zone-label">${this.escapeXml(node.name)}</text>
  </g>`;
    }

    private renderResourceGroupContainer(node: DiagramNode, offsetX: number, offsetY: number): string {
        const x = node.x + offsetX;
        const y = node.y + offsetY;
        const displayName = node.displayName || `Resource Group: ${node.name}`;

        // Azure-style resource group container with blue accent
        return `
  <g>
    <!-- Main container with shadow -->
    <rect x="${x + 2}" y="${y + 2}" width="${node.width}" height="${node.height}"
          rx="8" ry="8" fill="rgba(0,0,0,0.05)"/>
    <rect x="${x}" y="${y}" width="${node.width}" height="${node.height}"
          rx="8" ry="8" fill="#FAFAFA" stroke="#0078D4" stroke-width="2"/>
    <!-- Header bar -->
    <rect x="${x}" y="${y}" width="${node.width}" height="28"
          rx="8" ry="8" fill="rgba(0, 120, 212, 0.1)"/>
    <rect x="${x}" y="${y + 20}" width="${node.width}" height="8" fill="#FAFAFA"/>
    <line x1="${x}" y1="${y + 28}" x2="${x + node.width}" y2="${y + 28}"
          stroke="rgba(0, 120, 212, 0.2)" stroke-width="1"/>
    <!-- Resource Group icon (simplified) -->
    <rect x="${x + 8}" y="${y + 6}" width="16" height="16" rx="2" fill="#0078D4"/>
    <rect x="${x + 11}" y="${y + 9}" width="4" height="4" rx="1" fill="white"/>
    <rect x="${x + 17}" y="${y + 9}" width="4" height="4" rx="1" fill="white"/>
    <rect x="${x + 11}" y="${y + 15}" width="4" height="4" rx="1" fill="white"/>
    <rect x="${x + 17}" y="${y + 15}" width="4" height="4" rx="1" fill="white"/>
    <!-- Title -->
    <text x="${x + 30}" y="${y + 18}" class="zone-label" fill="#0078D4">${this.escapeXml(displayName)}</text>
  </g>`;
    }

    private renderResourceNode(node: DiagramNode, offsetX: number, offsetY: number): string {
        const x = node.x + offsetX;
        const y = node.y + offsetY;
        const resourceInfo = AzureIconMapper.getResourceInfo(node.type);
        const borderColor = CATEGORY_COLORS[resourceInfo.category] || CATEGORY_COLORS['General'];
        const displayName = node.displayName || node.name;
        const details = this.getResourceDetails(node);

        // Try to load icon as base64
        let iconContent = '';
        const iconPath = path.join(this.extensionPath, 'resources', 'azure-icons', resourceInfo.iconFileName);
        try {
            if (fs.existsSync(iconPath)) {
                const iconData = fs.readFileSync(iconPath);
                const base64 = iconData.toString('base64');
                const mimeType = iconPath.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
                iconContent = `<image x="${x + 4}" y="${y + (node.height - 28) / 2}" width="28" height="28"
                       xlink:href="data:${mimeType};base64,${base64}"/>`;
            }
        } catch (e) {
            // Icon not found, skip it
        }

        // Calculate text positions - support up to 3 lines of details
        const textX = x + 36;
        const maxTextWidth = node.width - 42;
        const charLimit = Math.floor(maxTextWidth / 5); // approx 5px per char at 8px font

        // Name at top, details below
        const nameY = y + 14;
        let detailElements = '';

        // Show up to 3 detail lines
        const maxDetails = Math.min(details.length, 3);
        for (let i = 0; i < maxDetails; i++) {
            const detailY = y + 26 + (i * 11);
            detailElements += `
    <text x="${textX}" y="${detailY}" class="node-detail">
      ${this.escapeXml(this.truncateText(details[i], charLimit))}
    </text>`;
        }

        // Render DevOps badges
        const badgeContent = this.renderDevOpsBadges(node, x, y);

        return `
  <g>
    <rect x="${x}" y="${y}" width="${node.width}" height="${node.height}"
          rx="5" ry="5" fill="white" stroke="#E1DFDD" stroke-width="1"/>
    <rect x="${x}" y="${y}" width="3" height="${node.height}"
          rx="2" ry="2" fill="${borderColor}"/>
    ${iconContent}
    <text x="${textX}" y="${nameY}" class="node-text-bold">
      ${this.escapeXml(this.truncateText(displayName, charLimit))}
    </text>${detailElements}${badgeContent}
  </g>`;
    }

    /**
     * Render DevOps feature badges (security, cost, tag compliance)
     */
    private renderDevOpsBadges(node: DiagramNode, x: number, y: number): string {
        let badges = '';
        let badgeX = x + node.width - 8; // Start from right edge
        const badgeY = y + 4;
        const badgeSize = 14;
        const badgeSpacing = 16;

        // Security badge (top-right corner)
        if (node.securityBadges && node.securityBadges.length > 0) {
            const topBadge = node.securityBadges[0];
            const badgeColor = this.getSecurityBadgeColor(topBadge.severity);
            const icon = this.getSecurityIcon(topBadge.severity);

            badges += `
    <g class="security-badge" transform="translate(${badgeX - badgeSize}, ${badgeY})">
      <title>${this.escapeXml(topBadge.tooltip)}</title>
      <circle cx="${badgeSize/2}" cy="${badgeSize/2}" r="${badgeSize/2}" fill="${badgeColor}" stroke="white" stroke-width="1"/>
      <text x="${badgeSize/2}" y="${badgeSize/2 + 3}" text-anchor="middle" fill="white" font-size="8" font-weight="bold">${icon}</text>
    </g>`;
            badgeX -= badgeSpacing;
        }

        // Overall security score indicator
        if (node.overallSecurityScore && !node.securityBadges) {
            const scoreColor = this.getSecurityBadgeColor(node.overallSecurityScore);
            badges += `
    <g class="security-score" transform="translate(${badgeX - badgeSize}, ${badgeY})">
      <title>Security: ${node.overallSecurityScore}</title>
      <rect x="0" y="0" width="${badgeSize}" height="${badgeSize}" rx="2" fill="${scoreColor}" stroke="white" stroke-width="1"/>
      <text x="${badgeSize/2}" y="${badgeSize/2 + 3}" text-anchor="middle" fill="white" font-size="7" font-weight="bold">S</text>
    </g>`;
            badgeX -= badgeSpacing;
        }

        // Tag compliance badge
        if (node.tagBadge && !node.tagBadge.hasRequiredTags) {
            const tagColor = node.tagBadge.missingCount > 2 ? '#D83B01' : '#FFB900'; // Red or Yellow
            badges += `
    <g class="tag-badge" transform="translate(${badgeX - badgeSize}, ${badgeY})">
      <title>${this.escapeXml(node.tagBadge.tooltip)}</title>
      <rect x="0" y="0" width="${badgeSize}" height="${badgeSize}" rx="2" fill="${tagColor}" stroke="white" stroke-width="1"/>
      <text x="${badgeSize/2}" y="${badgeSize/2 + 3}" text-anchor="middle" fill="white" font-size="7" font-weight="bold">T</text>
    </g>`;
            badgeX -= badgeSpacing;
        }

        // Private endpoint indicator
        if (node.hasPrivateEndpoint) {
            badges += `
    <g class="pe-badge" transform="translate(${badgeX - badgeSize}, ${badgeY})">
      <title>Has Private Endpoint</title>
      <rect x="0" y="0" width="${badgeSize}" height="${badgeSize}" rx="2" fill="#107C10" stroke="white" stroke-width="1"/>
      <text x="${badgeSize/2}" y="${badgeSize/2 + 3}" text-anchor="middle" fill="white" font-size="8">🔒</text>
    </g>`;
            badgeX -= badgeSpacing;
        }

        // Cost badge (bottom-right corner)
        if (node.costBadge && node.costBadge.monthlyCost > 0) {
            const costY = y + node.height - 16;
            const costColor = node.costBadge.isHighCost ? '#D83B01' : '#666666';
            badges += `
    <g class="cost-badge" transform="translate(${x + node.width - 50}, ${costY})">
      <title>Estimated monthly cost: ${node.costBadge.formattedCost}</title>
      <rect x="0" y="0" width="46" height="12" rx="2" fill="${costColor}" fill-opacity="0.1" stroke="${costColor}" stroke-width="0.5"/>
      <text x="23" y="9" text-anchor="middle" fill="${costColor}" font-size="7" font-weight="bold">${node.costBadge.formattedCost}</text>
    </g>`;
        }

        // SKU label (bottom-left, next to icon area)
        if (node.skuLabel) {
            const skuY = y + node.height - 10;
            badges += `
    <text x="${x + 36}" y="${skuY}" class="node-sku" fill="#666666" font-size="7" font-style="italic">
      ${this.escapeXml(node.skuLabel)}
    </text>`;
        }

        // CIDR range (for network resources)
        if (node.cidrRange) {
            const cidrY = y + node.height - 3;
            badges += `
    <text x="${x + 36}" y="${cidrY}" class="node-cidr" fill="#0078D4" font-size="7" font-family="monospace">
      ${this.escapeXml(node.cidrRange)}
    </text>`;
        }

        return badges;
    }

    /**
     * Get color for security badge based on severity
     */
    private getSecurityBadgeColor(severity: string): string {
        switch (severity) {
            case 'critical': return '#A80000'; // Dark red
            case 'high': return '#D83B01';     // Orange-red
            case 'medium': return '#FFB900';   // Yellow
            case 'low': return '#107C10';      // Green
            case 'info': return '#0078D4';     // Blue
            default: return '#666666';         // Gray
        }
    }

    /**
     * Get icon character for security severity
     */
    private getSecurityIcon(severity: string): string {
        switch (severity) {
            case 'critical': return '!';
            case 'high': return '!';
            case 'medium': return '⚠';
            case 'low': return 'i';
            case 'info': return 'i';
            default: return '?';
        }
    }

    /**
     * Render data flow connections with typed styling
     */
    renderDataFlowConnections(nodes: DiagramNode[], offsetX: number, offsetY: number): string {
        const nodeMap = new Map<string, DiagramNode>();
        nodes.forEach(n => nodeMap.set(n.id, n));

        let flows = '';

        for (const node of nodes) {
            if (!node.dataFlows) continue;

            for (const flow of node.dataFlows) {
                const target = nodeMap.get(flow.targetId);
                if (!target) continue;

                flows += this.renderDataFlowArrow(node, target, flow.flowType, flow.label, offsetX, offsetY);
            }
        }

        return flows;
    }

    /**
     * Render a single data flow arrow
     */
    private renderDataFlowArrow(
        source: DiagramNode,
        target: DiagramNode,
        flowType: string,
        label: string | undefined,
        offsetX: number,
        offsetY: number
    ): string {
        const srcCx = source.x + source.width / 2 + offsetX;
        const srcCy = source.y + source.height / 2 + offsetY;
        const tgtCx = target.x + target.width / 2 + offsetX;
        const tgtCy = target.y + target.height / 2 + offsetY;

        const dx = tgtCx - srcCx;
        const dy = tgtCy - srcCy;

        // Get flow styling
        const flowStyle = this.getDataFlowStyle(flowType);

        // Calculate path
        let pathD: string;
        let endX: number, endY: number;
        let arrowAngle: number;
        let midX: number, midY: number;

        if (Math.abs(dx) >= Math.abs(dy)) {
            const sx = dx > 0 ? source.x + source.width + offsetX : source.x + offsetX;
            const tx = dx > 0 ? target.x + offsetX : target.x + target.width + offsetX;
            midX = (sx + tx) / 2;
            midY = (srcCy + tgtCy) / 2;
            pathD = `M ${sx},${srcCy} C ${midX},${srcCy} ${midX},${tgtCy} ${tx},${tgtCy}`;
            endX = tx; endY = tgtCy;
            arrowAngle = dx > 0 ? -90 : 90;
        } else {
            const sy = dy > 0 ? source.y + source.height + offsetY : source.y + offsetY;
            const ty = dy > 0 ? target.y + offsetY : target.y + target.height + offsetY;
            midX = (srcCx + tgtCx) / 2;
            midY = (sy + ty) / 2;
            pathD = `M ${srcCx},${sy} C ${srcCx},${midY} ${tgtCx},${midY} ${tgtCx},${ty}`;
            endX = tgtCx; endY = ty;
            arrowAngle = dy > 0 ? 0 : 180;
        }

        // Render label if provided
        let labelElement = '';
        if (label) {
            const labelX = (srcCx + tgtCx) / 2;
            const labelY = (srcCy + tgtCy) / 2 - 4;
            labelElement = `
    <rect x="${labelX - 15}" y="${labelY - 8}" width="30" height="12" rx="2" fill="white" fill-opacity="0.9"/>
    <text x="${labelX}" y="${labelY}" text-anchor="middle" fill="${flowStyle.color}" font-size="7" font-weight="bold">
      ${this.escapeXml(label)}
    </text>`;
        }

        return `
  <g class="data-flow data-flow-${flowType}">
    <path d="${pathD}" fill="none" stroke="${flowStyle.color}" stroke-width="2"
          stroke-dasharray="${flowStyle.dashArray}" opacity="0.7"/>
    <polygon points="0,0 -4,-8 4,-8" fill="${flowStyle.color}" opacity="0.7"
             transform="translate(${endX},${endY}) rotate(${arrowAngle})"/>
    ${labelElement}
  </g>`;
    }

    /**
     * Get styling for data flow type
     */
    private getDataFlowStyle(flowType: string): { color: string; dashArray: string } {
        switch (flowType) {
            case 'data':
                return { color: '#0078D4', dashArray: '0' };        // Blue solid
            case 'control':
                return { color: '#8661C5', dashArray: '4,2' };      // Purple dashed
            case 'event':
                return { color: '#107C10', dashArray: '2,2' };      // Green dotted
            case 'dependency':
                return { color: '#666666', dashArray: '6,3' };      // Gray dashed
            default:
                return { color: '#999999', dashArray: '0' };        // Gray solid
        }
    }

    private renderConnection(source: DiagramNode, target: DiagramNode, offsetX: number, offsetY: number): string {
        const srcCx = source.x + source.width / 2 + offsetX;
        const srcCy = source.y + source.height / 2 + offsetY;
        const tgtCx = target.x + target.width / 2 + offsetX;
        const tgtCy = target.y + target.height / 2 + offsetY;

        const dx = tgtCx - srcCx;
        const dy = tgtCy - srcCy;
        const ALIGN_THRESHOLD = 15;

        let pathD: string;
        let endX: number, endY: number;
        let arrowAngle: number;

        if (Math.abs(dy) < ALIGN_THRESHOLD) {
            const sx = dx > 0 ? source.x + source.width + offsetX : source.x + offsetX;
            const tx = dx > 0 ? target.x + offsetX : target.x + target.width + offsetX;
            pathD = `M ${sx},${srcCy} H ${tx}`;
            endX = tx; endY = srcCy;
            arrowAngle = dx > 0 ? -90 : 90;
        } else if (Math.abs(dx) < ALIGN_THRESHOLD) {
            const sy = dy > 0 ? source.y + source.height + offsetY : source.y + offsetY;
            const ty = dy > 0 ? target.y + offsetY : target.y + target.height + offsetY;
            pathD = `M ${srcCx},${sy} V ${ty}`;
            endX = srcCx; endY = ty;
            arrowAngle = dy > 0 ? 0 : 180;
        } else if (Math.abs(dx) >= Math.abs(dy)) {
            const sx = dx > 0 ? source.x + source.width + offsetX : source.x + offsetX;
            const tx = dx > 0 ? target.x + offsetX : target.x + target.width + offsetX;
            const midX = (sx + tx) / 2;
            pathD = `M ${sx},${srcCy} H ${midX} V ${tgtCy} H ${tx}`;
            endX = tx; endY = tgtCy;
            arrowAngle = dx > 0 ? -90 : 90;
        } else {
            const sy = dy > 0 ? source.y + source.height + offsetY : source.y + offsetY;
            const ty = dy > 0 ? target.y + offsetY : target.y + target.height + offsetY;
            const midY = (sy + ty) / 2;
            pathD = `M ${srcCx},${sy} V ${midY} H ${tgtCx} V ${ty}`;
            endX = tgtCx; endY = ty;
            arrowAngle = dy > 0 ? 0 : 180;
        }

        return `
  <g>
    <path d="${pathD}" class="connection-line"/>
    <polygon points="0,0 -4,-8 4,-8" class="connection-arrow"
             transform="translate(${endX},${endY}) rotate(${arrowAngle})"/>
  </g>`;
    }

    private escapeXml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    private truncateText(text: string, maxLength: number): string {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 2) + '..';
    }

    /**
     * Generate PNG from diagram nodes
     */
    async generatePNG(nodes: DiagramNode[], outputPath: string, resources?: TerraformResource[]): Promise<void> {
        if (resources) {
            this.setResources(resources);
        }

        const svg = this.generateSVG(nodes);

        try {
            // Dynamic import for sharp
            let sharp;
            try {
                sharp = require('sharp');
            } catch (e) {
                // Sharp not available, fall back to SVG
                throw new Error('sharp module not available');
            }

            // Convert SVG to PNG with higher density for better quality
            await sharp(Buffer.from(svg), { density: 150 })
                .png()
                .toFile(outputPath);
        } catch (error: any) {
            // If sharp fails, fall back to saving SVG
            const svgPath = outputPath.replace('.png', '.svg');
            fs.writeFileSync(svgPath, svg, 'utf8');
            throw new Error(`PNG generation failed (saved SVG instead): ${error.message}`);
        }
    }

    /**
     * Generate SVG file from diagram nodes
     */
    generateSVGFile(nodes: DiagramNode[], outputPath: string, resources?: TerraformResource[]): void {
        if (resources) {
            this.setResources(resources);
        }

        const svg = this.generateSVG(nodes);
        fs.writeFileSync(outputPath, svg, 'utf8');
    }


    /**
     * Generate HTML with security indicators
     */
    generateDiagramWithSecurity(
        nodes: DiagramNode[], 
        connections: DiagramConnection[],
        securityPostures: Map<string, SecurityPosture>,
        costEstimates: Map<string, CostEstimate>,
        skuInfo: Map<string, SKUInfo>,
        tagCompliance: Map<string, TagCompliance>
    ): string {
        // Add security badges to nodes
        const enhancedNodes = nodes.map(node => {
            const nodeKey = `${node.resourceType}_${node.resourceName}`;
            const security = securityPostures.get(nodeKey);
            const cost = costEstimates.get(nodeKey);
            const sku = skuInfo.get(nodeKey);
            const tags = tagCompliance.get(nodeKey);
            
            return {
                ...node,
                securityBadges: this.generateSecurityBadges(security),
                costBadge: cost ? this.generateCostBadge(cost) : null,
                skuBadge: sku ? this.generateSKUBadge(sku) : null,
                tagBadge: tags ? this.generateTagBadge(tags) : null
            };
        });

        // Generate the enhanced HTML
        return this.generateEnhancedHTML(enhancedNodes, connections);
    }

    private generateSecurityBadges(security?: SecurityPosture): string {
        if (!security) return '';
        
        const badges: string[] = [];
        
        // Encryption badge
        badges.push(`
            <div class="security-badge ${security.isEncrypted ? 'badge-success' : 'badge-warning'}" 
                 title="${security.isEncrypted ? 'Encrypted' : 'Not encrypted'}">
                ${security.isEncrypted ? '🔒' : '🔓'}
            </div>
        `);
        
        // Public endpoint badge
        badges.push(`
            <div class="security-badge ${security.hasPublicEndpoint ? 'badge-danger' : 'badge-success'}" 
                 title="${security.hasPublicEndpoint ? 'Has public endpoint' : 'Private only'}">
                ${security.hasPublicEndpoint ? '🌐' : '🔒'}
            </div>
        `);
        
        // NSG badge
        badges.push(`
            <div class="security-badge ${security.hasNSG ? 'badge-success' : 'badge-warning'}" 
                 title="${security.hasNSG ? 'Has NSG' : 'No NSG'}">
                ${security.hasNSG ? '🛡️' : '⚠️'}
            </div>
        `);
        
        return badges.join('');
    }

    private generateCostBadge(cost: CostEstimate): string {
        const formattedCost = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: cost.currency,
            minimumFractionDigits: 2
        }).format(cost.monthlyCost);
        
        return `
            <div class="cost-badge ${cost.monthlyCost > 100 ? 'badge-high' : 'badge-low'}" 
                 title="Estimated monthly cost: ${formattedCost}">
                💰 ${formattedCost}/mo
            </div>
        `;
    }

    private generateSKUBadge(sku: SKUInfo): string {
        return `
            <div class="sku-badge" title="Tier: ${sku.tier}, SKU: ${sku.sku}${sku.size ? ', Size: ' + sku.size : ''}">
                🏷️ ${sku.tier}
            </div>
        `;
    }

    private generateTagBadge(tags: TagCompliance): string {
        const status = tags.hasRequiredTags ? 'badge-success' : 'badge-warning';
        const title = tags.hasRequiredTags 
            ? 'All required tags present' 
            : `Missing tags: ${tags.missingTags.join(', ')}`;
        
        return `
            <div class="tag-badge ${status}" title="${title}">
                📋 ${tags.hasRequiredTags ? '✓' : '⚠️'}
            </div>
        `;
    }

/**
 * Generate CSS styles for the enhanced HTML diagram
 */
private generateStyles(): string {
    return `
        body {
            font-family: 'Segoe UI', Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        
        #diagramContainer {
            position: relative;
            width: 100%;
            min-height: 600px;
            background-color: white;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            padding: 20px;
        }
        
        .node {
            position: absolute;
            border: 1px solid #e1dfdd;
            border-radius: 5px;
            background-color: white;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
            transition: all 0.2s ease;
            overflow: hidden;
        }
        
        .node:hover {
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            z-index: 1000;
            transform: translateY(-2px);
        }
        
        .node-header {
            background-color: #f8f8f8;
            border-bottom: 1px solid #e1dfdd;
            padding: 8px 12px;
            font-weight: 600;
            font-size: 12px;
            color: #201f1e;
        }
        
        .node-content {
            padding: 12px;
            font-size: 11px;
            color: #605e5c;
        }
        
        .node-icon {
            float: left;
            margin-right: 8px;
            width: 24px;
            height: 24px;
        }
        
        .connection {
            position: absolute;
            pointer-events: none;
            z-index: 1;
        }
        
        .connection-line {
            stroke: #a19f9d;
            stroke-width: 1.5;
            stroke-opacity: 0.6;
            fill: none;
        }
        
        .connection-label {
            font-size: 10px;
            fill: #605e5c;
            background-color: white;
            padding: 2px 4px;
            border-radius: 3px;
            border: 1px solid #e1dfdd;
        }
        
        .badge {
            display: inline-block;
            padding: 2px 6px;
            margin: 2px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 600;
            cursor: help;
        }
        
        .badge-success {
            background-color: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        
        .badge-warning {
            background-color: #fff3cd;
            color: #856404;
            border: 1px solid #ffeaa7;
        }
        
        .badge-danger {
            background-color: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        
        .badge-info {
            background-color: #d1ecf1;
            color: #0c5460;
            border: 1px solid #bee5eb;
        }
        
        .security-badge, .cost-badge, .sku-badge, .tag-badge {
            display: inline-block;
            padding: 2px 6px;
            margin: 2px;
            border-radius: 4px;
            font-size: 10px;
            cursor: help;
        }
        
        .cost-badge {
            background-color: #e8f4e8;
            color: #0d632c;
            border: 1px solid #c8e6c9;
        }
        
        .sku-badge {
            background-color: #e3f2fd;
            color: #0d47a1;
            border: 1px solid #bbdefb;
        }
        
        .tag-badge {
            background-color: #f3e5f5;
            color: #4a148c;
            border: 1px solid #e1bee7;
        }
        
        .node-badges {
            position: absolute;
            top: -20px;
            left: 0;
            right: 0;
            display: flex;
            justify-content: center;
            gap: 4px;
            flex-wrap: wrap;
        }
        
        .tooltip {
            position: absolute;
            background-color: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            z-index: 10000;
            max-width: 300px;
            pointer-events: none;
        }
        
        .legend {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background-color: white;
            border-radius: 8px;
            padding: 15px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            font-size: 12px;
        }
        
        .legend-item {
            display: flex;
            align-items: center;
            margin-bottom: 8px;
        }
        
        .legend-color {
            width: 16px;
            height: 16px;
            border-radius: 3px;
            margin-right: 8px;
        }
    `;
}

/**
 * Generate SVG connection elements for HTML diagram
 */
private generateConnectionElements(connections: DiagramConnection[]): string {
    let html = '';
    
    connections.forEach((conn, index) => {
        const sourceNode = this.findNodeById(conn.sourceId);
        const targetNode = this.findNodeById(conn.targetId);
        
        if (!sourceNode || !targetNode) return;
        
        // Calculate connection path
        const sourceX = sourceNode.x + sourceNode.width / 2;
        const sourceY = sourceNode.y + sourceNode.height / 2;
        const targetX = targetNode.x + targetNode.width / 2;
        const targetY = targetNode.y + targetNode.height / 2;
        
        // Simple straight line for now (you can enhance this with curved paths)
        const midX = (sourceX + targetX) / 2;
        const midY = (sourceY + targetY) / 2;
        
        const lineStyle = this.getConnectionStyle(conn.type);
        
        html += `
            <svg class="connection" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; overflow: visible; z-index: 1;">
                <defs>
                    <marker id="arrowhead-${index}" markerWidth="10" markerHeight="7" 
                            refX="10" refY="3.5" orient="auto">
                        <polygon points="0 0, 10 3.5, 0 7" fill="${lineStyle.stroke}" />
                    </marker>
                </defs>
                <line x1="${sourceX}" y1="${sourceY}" x2="${targetX}" y2="${targetY}"
                      stroke="${lineStyle.stroke}"
                      stroke-width="${lineStyle.strokeWidth}"
                      stroke-dasharray="${lineStyle.strokeDasharray}"
                      marker-end="url(#arrowhead-${index})"
                      class="connection-line" />
                ${conn.label ? `
                    <text x="${midX}" y="${midY - 5}" text-anchor="middle" class="connection-label">
                        ${this.escapeXml(conn.label)}
                    </text>
                ` : ''}
            </svg>
        `;
    });
    
    return html;
}

/**
 * Helper method to find node by ID (for the enhanced HTML generation)
 */
private findNodeById(nodeId: string): any {
    // This would typically use your actual nodes array
    // For now, returning a placeholder
    return null;
}

/**
 * Get connection style based on type
 */
private getConnectionStyle(type: DiagramConnection['type']): {
    stroke: string;
    strokeWidth: number;
    strokeDasharray: string;
} {
    switch (type) {
        case 'data':
            return { stroke: '#107C10', strokeWidth: 2, strokeDasharray: '' };
        case 'control':
            return { stroke: '#0078D4', strokeWidth: 2, strokeDasharray: '' };
        case 'security':
            return { stroke: '#FF8C00', strokeWidth: 2, strokeDasharray: '5,2' };
        case 'dependency':
        default:
            return { stroke: '#666666', strokeWidth: 1, strokeDasharray: '5,5' };
    }
}

/**
 * Generate JavaScript for interactive diagram
 */
private generateScript(): string {
    return `
        document.addEventListener('DOMContentLoaded', function() {
            // Tooltip functionality
            const tooltip = document.createElement('div');
            tooltip.className = 'tooltip';
            tooltip.style.display = 'none';
            document.body.appendChild(tooltip);
            
            // Node hover effects
            const nodes = document.querySelectorAll('.node');
            nodes.forEach(node => {
                node.addEventListener('mouseenter', function(e) {
                    // Show tooltip with node details
                    const nodeId = this.getAttribute('data-id');
                    const nodeType = this.getAttribute('data-type');
                    
                    tooltip.innerHTML = \`
                        <strong>\${nodeId}</strong><br>
                        Type: \${nodeType}<br>
                        Click for details
                    \`;
                    
                    tooltip.style.display = 'block';
                    tooltip.style.left = (e.pageX + 10) + 'px';
                    tooltip.style.top = (e.pageY + 10) + 'px';
                });
                
                node.addEventListener('mousemove', function(e) {
                    tooltip.style.left = (e.pageX + 10) + 'px';
                    tooltip.style.top = (e.pageY + 10) + 'px';
                });
                
                node.addEventListener('mouseleave', function() {
                    tooltip.style.display = 'none';
                });
                
                // Click to highlight connections
                node.addEventListener('click', function() {
                    const nodeId = this.getAttribute('data-id');
                    
                    // Reset all nodes
                    nodes.forEach(n => {
                        n.style.borderColor = '#e1dfdd';
                        n.style.backgroundColor = 'white';
                    });
                    
                    // Highlight this node
                    this.style.borderColor = '#0078D4';
                    this.style.backgroundColor = '#e6f2ff';
                    
                    // Highlight connected nodes
                    const connections = this.querySelectorAll('.connection');
                    connections.forEach(conn => {
                        const targetId = conn.getAttribute('data-target');
                        const targetNode = document.querySelector(\`.node[data-id="\${targetId}"]\`);
                        if (targetNode) {
                            targetNode.style.borderColor = '#107C10';
                            targetNode.style.backgroundColor = '#e8f4e8';
                        }
                    });
                });
            });
            
            // Legend creation
            const legend = document.createElement('div');
            legend.className = 'legend';
            legend.innerHTML = \`
                <h3 style="margin-top: 0; font-size: 14px;">Legend</h3>
                <div class="legend-item">
                    <div class="legend-color" style="background-color: #d4edda;"></div>
                    <span>Secure</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color" style="background-color: #fff3cd;"></div>
                    <span>Warning</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color" style="background-color: #f8d7da;"></div>
                    <span>Critical</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color" style="background-color: #107C10; width: 20px; height: 2px;"></div>
                    <span>Data Flow</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color" style="background-color: #0078D4; width: 20px; height: 2px;"></div>
                    <span>Control Flow</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color" style="background-color: #FF8C00; width: 20px; height: 2px;"></div>
                    <span>Security</span>
                </div>
            \`;
            document.body.appendChild(legend);
            
            // Keyboard shortcuts
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    // Reset all highlights
                    nodes.forEach(n => {
                        n.style.borderColor = '#e1dfdd';
                        n.style.backgroundColor = 'white';
                    });
                }
            });
        });
    `;
}

    private generateEnhancedHTML(nodes: any[], connections: DiagramConnection[]): string {
        // This would be an enhanced version of your existing generateHTML method
        // Add CSS styles for badges and update node rendering
        const enhancedStyles = `
            <style>
                .security-badge, .cost-badge, .sku-badge, .tag-badge {
                    display: inline-block;
                    padding: 2px 6px;
                    margin: 2px;
                    border-radius: 4px;
                    font-size: 10px;
                    cursor: help;
                }
                
                .badge-success {
                    background-color: #d4edda;
                    color: #155724;
                    border: 1px solid #c3e6cb;
                }
                
                .badge-warning {
                    background-color: #fff3cd;
                    color: #856404;
                    border: 1px solid #ffeaa7;
                }
                
                .badge-danger {
                    background-color: #f8d7da;
                    color: #721c24;
                    border: 1px solid #f5c6cb;
                }
                
                .badge-high {
                    background-color: #f8d7da;
                    color: #721c24;
                }
                
                .badge-low {
                    background-color: #d4edda;
                    color: #155724;
                }
                
                .node-badges {
                    position: absolute;
                    top: -20px;
                    left: 0;
                    right: 0;
                    display: flex;
                    justify-content: center;
                    gap: 2px;
                }
                
                .node-content {
                    margin-top: 10px;
                }
            </style>
        `;

        // Update node rendering to include badges
        const nodeElements = nodes.map(node => {
            const badges = `
                ${node.securityBadges || ''}
                ${node.costBadge || ''}
                ${node.skuBadge || ''}
                ${node.tagBadge || ''}
            `;
            
            return `
                <div class="node" 
                     data-id="${node.id}" 
                     data-type="${node.resourceType}"
                     style="left: ${node.x}px; top: ${node.y}px; width: ${node.width}px; height: ${node.height}px;">
                    
                    <div class="node-badges">
                        ${badges}
                    </div>
                    
                    <div class="node-content">
                        ${node.content}
                    </div>
                </div>
            `;
        }).join('\n');

        // Return the complete HTML (combine with your existing generateHTML logic)
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Azure Terraform Diagram with Security Analysis</title>
                <style>
                    ${this.generateStyles()}
                    ${enhancedStyles}
                </style>
            </head>
            <body>
                <div id="diagramContainer">
                    ${nodeElements}
                    ${this.generateConnectionElements(connections)}
                </div>
                <script>
                    ${this.generateScript()}
                </script>
            </body>
            </html>
        `;
    }
}
