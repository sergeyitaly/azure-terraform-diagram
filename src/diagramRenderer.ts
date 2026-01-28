import * as fs from 'fs';
import * as path from 'path';
import { DiagramNode } from './diagramLayout';
import { TerraformResource } from './terraformParser';
import { AzureIconMapper } from './azureIconMapper';

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
     */
    private getResourceDetails(node: DiagramNode): string[] {
        const resource = this.resourceMap.get(node.id);
        if (!resource) return [];

        const ni = resource.networkInfo || {};
        const attr = resource.attributes || {};
        const details: string[] = [];

        // Helper to add non-empty values
        const add = (value: string | undefined | null) => {
            if (value && value.trim()) details.push(value.trim());
        };

        // Helper to extract reference name
        const extractRef = (value: any): string => {
            if (typeof value === 'string') {
                const match = value.match(/azurerm_\w+\.([^.]+)/);
                return match ? match[1] : value;
            }
            return String(value);
        };

        // Resource Group
        if (node.type === 'azurerm_resource_group') {
            add(attr.location);
            return details;
        }

        // VNet: address space
        if (node.type === 'azurerm_virtual_network') {
            if (attr.address_space) {
                const space = Array.isArray(attr.address_space) ? attr.address_space.join(', ') : attr.address_space;
                add(space);
            }
            add(attr.location);
            if (attr.dns_servers && Array.isArray(attr.dns_servers) && attr.dns_servers.length > 0) {
                add(`DNS: ${attr.dns_servers.join(', ')}`);
            }
            return details;
        }

        // Subnet: CIDR prefix
        if (node.type === 'azurerm_subnet') {
            if (attr.address_prefixes) {
                const p = Array.isArray(attr.address_prefixes) ? attr.address_prefixes.join(', ') : attr.address_prefixes;
                add(p);
            } else if (attr.address_prefix) {
                add(attr.address_prefix);
            } else if (ni.addressPrefix) {
                add(ni.addressPrefix.split(' in ')[0]);
            }
            if (attr.service_endpoints && Array.isArray(attr.service_endpoints)) {
                add(`Endpoints: ${attr.service_endpoints.length}`);
            }
            if (attr.delegation) {
                add('Delegated');
            }
            return details;
        }

        // NIC: private IP + subnet ref
        if (node.type === 'azurerm_network_interface') {
            if (ni.privateIpAddress) add(`IP: ${ni.privateIpAddress}`);
            if (attr.ip_configuration) {
                const ipConfig = Array.isArray(attr.ip_configuration) ? attr.ip_configuration[0] : attr.ip_configuration;
                if (ipConfig) {
                    if (ipConfig.private_ip_address) add(`IP: ${ipConfig.private_ip_address}`);
                    if (ipConfig.private_ip_address_allocation) add(ipConfig.private_ip_address_allocation);
                }
            }
            if (attr.enable_accelerated_networking) add('Accelerated');
            return details;
        }

        // Public IP
        if (node.type === 'azurerm_public_ip') {
            if (attr.allocation_method) add(attr.allocation_method);
            if (attr.sku) add(`SKU: ${attr.sku}`);
            if (attr.sku_tier) add(`Tier: ${attr.sku_tier}`);
            if (attr.zones && Array.isArray(attr.zones)) add(`Zones: ${attr.zones.join(',')}`);
            if (attr.domain_name_label) add(`DNS: ${attr.domain_name_label}`);
            return details;
        }

        // NSG: rule count + key rules
        if (node.type === 'azurerm_network_security_group') {
            if (resource.securityRules && resource.securityRules.length > 0) {
                add(`${resource.securityRules.length} security rules`);
                // Show first few rule names
                const ruleNames = resource.securityRules.slice(0, 2).map(r => r.name).join(', ');
                if (ruleNames) add(ruleNames);
            }
            return details;
        }

        // NSG Rule
        if (node.type === 'azurerm_network_security_rule') {
            if (attr.direction) add(attr.direction);
            if (attr.access) add(attr.access);
            if (attr.protocol) add(`Protocol: ${attr.protocol}`);
            if (attr.destination_port_range) add(`Port: ${attr.destination_port_range}`);
            if (attr.priority) add(`Priority: ${attr.priority}`);
            return details;
        }

        // VM: size + OS
        if (node.type.includes('virtual_machine') || node.type.includes('linux_virtual_machine') || node.type.includes('windows_virtual_machine')) {
            const size = attr.size || attr.vm_size;
            if (size) add(size);
            if (attr.admin_username) add(`User: ${attr.admin_username}`);
            if (attr.source_image_reference) {
                const img = attr.source_image_reference;
                if (typeof img === 'object') {
                    add(`${img.publisher || ''}/${img.offer || ''}`);
                    if (img.sku) add(`SKU: ${img.sku}`);
                }
            }
            if (attr.os_disk) {
                const disk = attr.os_disk;
                if (typeof disk === 'object') {
                    if (disk.storage_account_type) add(`Disk: ${disk.storage_account_type}`);
                    if (disk.disk_size_gb) add(`${disk.disk_size_gb}GB`);
                }
            }
            if (attr.zone) add(`Zone: ${attr.zone}`);
            return details;
        }

        // Storage account
        if (node.type === 'azurerm_storage_account') {
            if (attr.account_tier && attr.account_replication_type) {
                add(`${attr.account_tier}_${attr.account_replication_type}`);
            }
            if (attr.account_kind) add(attr.account_kind);
            if (attr.access_tier) add(`Access: ${attr.access_tier}`);
            if (attr.min_tls_version) add(`TLS: ${attr.min_tls_version}`);
            if (attr.enable_https_traffic_only) add('HTTPS only');
            return details;
        }

        // Storage container
        if (node.type === 'azurerm_storage_container') {
            if (attr.container_access_type) add(`Access: ${attr.container_access_type}`);
            return details;
        }

        // SQL Server
        if (node.type === 'azurerm_sql_server' || node.type === 'azurerm_mssql_server') {
            if (attr.version) add(`v${attr.version}`);
            if (attr.administrator_login) add(`Admin: ${attr.administrator_login}`);
            if (attr.minimum_tls_version) add(`TLS: ${attr.minimum_tls_version}`);
            if (attr.public_network_access_enabled === false) add('Private');
            return details;
        }

        // SQL Database
        if (node.type === 'azurerm_sql_database' || node.type === 'azurerm_mssql_database') {
            if (attr.sku_name) add(attr.sku_name);
            if (attr.max_size_gb) add(`${attr.max_size_gb}GB`);
            if (attr.collation) add(attr.collation);
            if (attr.zone_redundant) add('Zone redundant');
            if (attr.read_scale) add('Read scale');
            return details;
        }

        // PostgreSQL / MySQL
        if (node.type.includes('postgresql') || node.type.includes('mysql')) {
            if (attr.sku_name) add(attr.sku_name);
            if (attr.version) add(`v${attr.version}`);
            if (attr.storage_mb) add(`${Math.round(attr.storage_mb / 1024)}GB`);
            if (attr.administrator_login) add(`Admin: ${attr.administrator_login}`);
            if (attr.ssl_enforcement_enabled) add('SSL enforced');
            return details;
        }

        // AKS
        if (node.type === 'azurerm_kubernetes_cluster') {
            if (attr.kubernetes_version) add(`k8s ${attr.kubernetes_version}`);
            if (attr.sku_tier) add(attr.sku_tier);
            if (attr.default_node_pool) {
                const pool = attr.default_node_pool;
                if (typeof pool === 'object') {
                    if (pool.vm_size) add(pool.vm_size);
                    if (pool.node_count) add(`Nodes: ${pool.node_count}`);
                    if (pool.min_count && pool.max_count) add(`Scale: ${pool.min_count}-${pool.max_count}`);
                }
            }
            if (attr.network_profile) {
                const net = attr.network_profile;
                if (typeof net === 'object' && net.network_plugin) {
                    add(`Network: ${net.network_plugin}`);
                }
            }
            return details;
        }

        // App Service / Web App
        if (node.type === 'azurerm_app_service' || node.type === 'azurerm_linux_web_app' || node.type === 'azurerm_windows_web_app') {
            if (attr.https_only) add('HTTPS only');
            if (attr.site_config) {
                const cfg = attr.site_config;
                if (typeof cfg === 'object') {
                    if (cfg.always_on) add('Always On');
                    if (cfg.http2_enabled) add('HTTP/2');
                    if (cfg.minimum_tls_version) add(`TLS ${cfg.minimum_tls_version}`);
                    if (cfg.ftps_state) add(`FTPS: ${cfg.ftps_state}`);
                }
            }
            return details;
        }

        // Service Plan
        if (node.type === 'azurerm_app_service_plan' || node.type === 'azurerm_service_plan') {
            if (attr.sku_name) add(attr.sku_name);
            if (attr.os_type) add(attr.os_type);
            if (attr.worker_count) add(`Workers: ${attr.worker_count}`);
            if (attr.zone_balancing_enabled) add('Zone balanced');
            if (attr.sku && typeof attr.sku === 'object') {
                if (attr.sku.tier) add(attr.sku.tier);
                if (attr.sku.size) add(attr.sku.size);
            }
            return details;
        }

        // Function App
        if (node.type === 'azurerm_function_app' || node.type === 'azurerm_linux_function_app' || node.type === 'azurerm_windows_function_app') {
            if (attr.os_type) add(attr.os_type);
            if (attr.https_only) add('HTTPS only');
            if (attr.site_config) {
                const cfg = attr.site_config;
                if (typeof cfg === 'object') {
                    if (cfg.application_stack) {
                        const stack = cfg.application_stack;
                        if (typeof stack === 'object') {
                            const runtime = stack.node_version || stack.python_version || stack.dotnet_version || stack.java_version;
                            if (runtime) add(`Runtime: ${runtime}`);
                        }
                    }
                }
            }
            return details;
        }

        // Firewall
        if (node.type === 'azurerm_firewall') {
            if (attr.sku_name) add(attr.sku_name);
            if (attr.sku_tier) add(attr.sku_tier);
            if (attr.threat_intel_mode) add(`Threat Intel: ${attr.threat_intel_mode}`);
            if (attr.zones && Array.isArray(attr.zones)) add(`Zones: ${attr.zones.join(',')}`);
            return details;
        }

        // Application Gateway
        if (node.type === 'azurerm_application_gateway') {
            if (attr.sku && typeof attr.sku === 'object') {
                if (attr.sku.name) add(attr.sku.name);
                if (attr.sku.tier) add(attr.sku.tier);
                if (attr.sku.capacity) add(`Capacity: ${attr.sku.capacity}`);
            }
            if (attr.enable_http2) add('HTTP/2');
            if (attr.zones && Array.isArray(attr.zones)) add(`Zones: ${attr.zones.join(',')}`);
            return details;
        }

        // NAT Gateway
        if (node.type === 'azurerm_nat_gateway') {
            if (attr.sku_name) add(attr.sku_name);
            if (attr.idle_timeout_in_minutes) add(`Timeout: ${attr.idle_timeout_in_minutes}m`);
            if (attr.zones && Array.isArray(attr.zones)) add(`Zones: ${attr.zones.join(',')}`);
            return details;
        }

        // Load Balancer
        if (node.type === 'azurerm_lb') {
            if (attr.sku) add(attr.sku);
            if (attr.sku_name) add(attr.sku_name);
            if (attr.sku_tier) add(attr.sku_tier);
            return details;
        }

        // Key Vault
        if (node.type === 'azurerm_key_vault') {
            if (attr.sku_name) add(attr.sku_name);
            if (attr.soft_delete_retention_days) add(`Retention: ${attr.soft_delete_retention_days}d`);
            if (attr.purge_protection_enabled) add('Purge protected');
            if (attr.enable_rbac_authorization) add('RBAC enabled');
            return details;
        }

        // Redis Cache
        if (node.type === 'azurerm_redis_cache') {
            if (attr.sku_name) add(attr.sku_name);
            if (attr.family && attr.capacity) add(`${attr.family}${attr.capacity}`);
            if (attr.minimum_tls_version) add(`TLS ${attr.minimum_tls_version}`);
            if (attr.enable_non_ssl_port === false) add('SSL only');
            return details;
        }

        // Cosmos DB
        if (node.type === 'azurerm_cosmosdb_account') {
            if (attr.offer_type) add(attr.offer_type);
            if (attr.kind) add(attr.kind);
            if (attr.consistency_policy) {
                const cp = attr.consistency_policy;
                if (typeof cp === 'object' && cp.consistency_level) {
                    add(`Consistency: ${cp.consistency_level}`);
                }
            }
            if (attr.is_virtual_network_filter_enabled) add('VNet filtered');
            return details;
        }

        // Container group
        if (node.type === 'azurerm_container_group') {
            if (attr.os_type) add(attr.os_type);
            if (attr.ip_address_type) add(attr.ip_address_type);
            if (attr.restart_policy) add(`Restart: ${attr.restart_policy}`);
            if (ni.ports && ni.ports.length) add(`Ports: ${ni.ports.join(',')}`);
            return details;
        }

        // Container Registry
        if (node.type === 'azurerm_container_registry') {
            if (attr.sku) add(attr.sku);
            if (attr.admin_enabled) add('Admin enabled');
            if (attr.public_network_access_enabled === false) add('Private');
            if (attr.zone_redundancy_enabled) add('Zone redundant');
            return details;
        }

        // Log Analytics
        if (node.type === 'azurerm_log_analytics_workspace') {
            if (attr.sku) add(attr.sku);
            if (attr.retention_in_days) add(`Retention: ${attr.retention_in_days}d`);
            if (attr.daily_quota_gb) add(`Quota: ${attr.daily_quota_gb}GB/day`);
            return details;
        }

        // Application Insights
        if (node.type === 'azurerm_application_insights') {
            if (attr.application_type) add(attr.application_type);
            if (attr.retention_in_days) add(`Retention: ${attr.retention_in_days}d`);
            if (attr.sampling_percentage) add(`Sampling: ${attr.sampling_percentage}%`);
            return details;
        }

        // Route table
        if (node.type === 'azurerm_route_table') {
            add('UDR');
            if (attr.disable_bgp_route_propagation) add('BGP disabled');
            return details;
        }

        // Route
        if (node.type === 'azurerm_route') {
            if (attr.address_prefix) add(attr.address_prefix);
            if (attr.next_hop_type) add(`→ ${attr.next_hop_type}`);
            if (attr.next_hop_in_ip_address) add(attr.next_hop_in_ip_address);
            return details;
        }

        // VPN Gateway
        if (node.type === 'azurerm_virtual_network_gateway') {
            if (attr.type) add(attr.type);
            if (attr.sku) add(attr.sku);
            if (attr.vpn_type) add(attr.vpn_type);
            if (attr.active_active) add('Active-Active');
            return details;
        }

        // Express Route
        if (node.type === 'azurerm_express_route_circuit') {
            if (attr.service_provider_name) add(attr.service_provider_name);
            if (attr.bandwidth_in_mbps) add(`${attr.bandwidth_in_mbps}Mbps`);
            if (attr.peering_location) add(attr.peering_location);
            return details;
        }

        // Bastion
        if (node.type === 'azurerm_bastion_host') {
            if (attr.sku) add(attr.sku);
            if (attr.copy_paste_enabled) add('Copy/Paste');
            if (attr.file_copy_enabled) add('File copy');
            if (attr.tunneling_enabled) add('Tunneling');
            return details;
        }

        // Private Endpoint
        if (node.type === 'azurerm_private_endpoint') {
            if (attr.private_service_connection) {
                const psc = attr.private_service_connection;
                if (typeof psc === 'object') {
                    if (psc.subresource_names && Array.isArray(psc.subresource_names)) {
                        add(psc.subresource_names.join(', '));
                    }
                }
            }
            return details;
        }

        // Private DNS Zone
        if (node.type === 'azurerm_private_dns_zone') {
            // Just show the zone name is enough
            return details;
        }

        // Managed Identity
        if (node.type === 'azurerm_user_assigned_identity') {
            add(attr.location || '');
            return details;
        }

        // Role Assignment
        if (node.type === 'azurerm_role_assignment') {
            if (attr.role_definition_name) add(attr.role_definition_name);
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
        nodes.filter(n => n.isGroupContainer).forEach(node => {
            svg += this.renderGroupContainer(node, offsetX, offsetY);
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

        return `
  <g>
    <rect x="${x}" y="${y}" width="${node.width}" height="${node.height}"
          rx="5" ry="5" fill="white" stroke="#E1DFDD" stroke-width="1"/>
    <rect x="${x}" y="${y}" width="3" height="${node.height}"
          rx="2" ry="2" fill="${borderColor}"/>
    ${iconContent}
    <text x="${textX}" y="${nameY}" class="node-text-bold">
      ${this.escapeXml(this.truncateText(displayName, charLimit))}
    </text>${detailElements}
  </g>`;
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
}
