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
     * Get resource detail string (IP, SKU, size, etc.)
     */
    private getResourceDetail(node: DiagramNode): string {
        const resource = this.resourceMap.get(node.id);
        if (!resource) return '';

        const ni = resource.networkInfo || {};
        const attr = resource.attributes || {};

        // VNet: address space
        if (node.type === 'azurerm_virtual_network') {
            if (attr.address_space) {
                const space = Array.isArray(attr.address_space) ? attr.address_space.join(', ') : attr.address_space;
                return space;
            }
        }

        // Subnet: CIDR prefix
        if (node.type === 'azurerm_subnet') {
            if (ni.addressPrefix) return ni.addressPrefix.split(' in ')[0];
            if (attr.address_prefixes) {
                const p = Array.isArray(attr.address_prefixes) ? attr.address_prefixes.join(', ') : attr.address_prefixes;
                return p;
            }
            if (attr.address_prefix) return attr.address_prefix;
        }

        // NIC: private IP + subnet ref
        if (node.type === 'azurerm_network_interface') {
            const parts: string[] = [];
            if (ni.privateIpAddress) parts.push(ni.privateIpAddress);
            if (ni.subnetAddressPrefix) parts.push(ni.subnetAddressPrefix);
            return parts.join(' | ') || '';
        }

        // Public IP
        if (node.type === 'azurerm_public_ip') {
            const parts: string[] = [];
            if (ni.ipAddress) parts.push(ni.ipAddress);
            if (ni.publicIpAddress) parts.push(ni.publicIpAddress);
            if (!parts.length && attr.allocation_method) parts.push(attr.allocation_method);
            if (attr.sku) parts.push(`SKU: ${attr.sku}`);
            return parts.join(' ') || '';
        }

        // NSG: rule count
        if (node.type === 'azurerm_network_security_group') {
            if (resource.securityRules && resource.securityRules.length > 0) {
                return resource.securityRules.length + ' rules';
            }
        }

        // VM: size
        if (node.type.includes('virtual_machine')) {
            const size = attr.size || attr.vm_size;
            if (size) return size;
        }

        // Storage account: tier + replication
        if (node.type === 'azurerm_storage_account') {
            const parts: string[] = [];
            if (attr.account_tier) parts.push(attr.account_tier);
            if (attr.account_replication_type) parts.push(attr.account_replication_type);
            return parts.join('_') || '';
        }

        // SQL Server / DB
        if (node.type === 'azurerm_sql_server' || node.type === 'azurerm_mssql_server') {
            if (attr.version) return 'v' + attr.version;
        }
        if (node.type === 'azurerm_sql_database' || node.type === 'azurerm_mssql_database') {
            const parts: string[] = [];
            if (attr.sku_name) parts.push(attr.sku_name);
            if (attr.max_size_gb) parts.push(attr.max_size_gb + 'GB');
            return parts.join(' | ') || '';
        }

        // AKS
        if (node.type === 'azurerm_kubernetes_cluster') {
            const parts: string[] = [];
            if (attr.kubernetes_version) parts.push('k8s ' + attr.kubernetes_version);
            if (attr.sku_tier) parts.push(attr.sku_tier);
            if (ni.addressPrefix) parts.push(ni.addressPrefix);
            return parts.join(' | ') || '';
        }

        // App Service / Function App
        if (node.type === 'azurerm_app_service' || node.type === 'azurerm_linux_web_app' || node.type === 'azurerm_windows_web_app') {
            const parts: string[] = [];
            if (attr.sku_name) parts.push(attr.sku_name);
            if (attr.https_only) parts.push('HTTPS');
            return parts.join(' | ') || '';
        }

        if (node.type === 'azurerm_app_service_plan' || node.type === 'azurerm_service_plan') {
            const parts: string[] = [];
            if (attr.sku_name) parts.push(attr.sku_name);
            if (attr.os_type) parts.push(attr.os_type);
            if (attr.sku) {
                const sku = attr.sku;
                if (typeof sku === 'object') {
                    if (sku.tier) parts.push(sku.tier);
                    if (sku.size) parts.push(sku.size);
                }
            }
            return parts.join(' | ') || '';
        }

        // Function App
        if (node.type === 'azurerm_function_app' || node.type === 'azurerm_linux_function_app' || node.type === 'azurerm_windows_function_app') {
            const parts: string[] = [];
            if (attr.os_type) parts.push(attr.os_type);
            return parts.join(' | ') || '';
        }

        // Firewall / App Gateway / NAT Gateway
        if (node.type === 'azurerm_firewall') {
            const parts: string[] = [];
            if (attr.sku_name) parts.push(attr.sku_name);
            if (attr.sku_tier) parts.push(attr.sku_tier);
            return parts.join(' ') || '';
        }

        if (node.type === 'azurerm_application_gateway') {
            if (attr.sku) {
                const sku = attr.sku;
                if (typeof sku === 'object') {
                    const parts: string[] = [];
                    if (sku.name) parts.push(sku.name);
                    if (sku.tier) parts.push(sku.tier);
                    if (sku.capacity) parts.push(`cap:${sku.capacity}`);
                    return parts.join(' ') || '';
                }
                return String(sku);
            }
        }

        if (node.type === 'azurerm_nat_gateway') {
            const parts: string[] = [];
            if (attr.sku_name) parts.push(attr.sku_name);
            if (attr.idle_timeout_in_minutes) parts.push(`${attr.idle_timeout_in_minutes}m timeout`);
            return parts.join(' | ') || '';
        }

        // Load Balancer
        if (node.type === 'azurerm_lb') {
            const parts: string[] = [];
            if (attr.sku) parts.push(attr.sku);
            if (attr.sku_name) parts.push(attr.sku_name);
            return parts.join(' ') || '';
        }

        // Key Vault
        if (node.type === 'azurerm_key_vault') {
            const parts: string[] = [];
            if (attr.sku_name) parts.push(attr.sku_name);
            if (attr.soft_delete_retention_days) parts.push(`${attr.soft_delete_retention_days}d retention`);
            return parts.join(' | ') || '';
        }

        // Redis Cache
        if (node.type === 'azurerm_redis_cache') {
            const parts: string[] = [];
            if (attr.sku_name) parts.push(attr.sku_name);
            if (attr.family) parts.push(attr.family);
            if (attr.capacity) parts.push(`cap:${attr.capacity}`);
            return parts.join(' ') || '';
        }

        // Cosmos DB
        if (node.type === 'azurerm_cosmosdb_account') {
            const parts: string[] = [];
            if (attr.offer_type) parts.push(attr.offer_type);
            if (attr.kind) parts.push(attr.kind);
            return parts.join(' | ') || '';
        }

        // Container group: ports
        if (node.type === 'azurerm_container_group') {
            const parts: string[] = [];
            if (ni.ipAddress) parts.push(ni.ipAddress);
            if (ni.ports && ni.ports.length) parts.push('ports: ' + ni.ports.join(','));
            if (attr.os_type) parts.push(attr.os_type);
            return parts.join(' ') || '';
        }

        // Container Registry
        if (node.type === 'azurerm_container_registry') {
            const parts: string[] = [];
            if (attr.sku) parts.push(attr.sku);
            if (attr.admin_enabled) parts.push('admin');
            return parts.join(' | ') || '';
        }

        // Log Analytics
        if (node.type === 'azurerm_log_analytics_workspace') {
            const parts: string[] = [];
            if (attr.sku) parts.push(attr.sku);
            if (attr.retention_in_days) parts.push(`${attr.retention_in_days}d`);
            return parts.join(' | ') || '';
        }

        // Application Insights
        if (node.type === 'azurerm_application_insights') {
            const parts: string[] = [];
            if (attr.application_type) parts.push(attr.application_type);
            if (attr.retention_in_days) parts.push(`${attr.retention_in_days}d`);
            return parts.join(' | ') || '';
        }

        // Route table
        if (node.type === 'azurerm_route_table') {
            return 'UDR';
        }

        // VPN Gateway
        if (node.type === 'azurerm_virtual_network_gateway') {
            const parts: string[] = [];
            if (attr.type) parts.push(attr.type);
            if (attr.sku) parts.push(attr.sku);
            return parts.join(' | ') || '';
        }

        // Express Route
        if (node.type === 'azurerm_express_route_circuit') {
            const parts: string[] = [];
            if (attr.service_provider_name) parts.push(attr.service_provider_name);
            if (attr.bandwidth_in_mbps) parts.push(`${attr.bandwidth_in_mbps}Mbps`);
            return parts.join(' | ') || '';
        }

        // Generic: check for sku, location
        if (attr.sku_name) return attr.sku_name;
        if (attr.sku && typeof attr.sku === 'string') return attr.sku;

        return '';
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
        const detail = this.getResourceDetail(node);

        // Try to load icon as base64
        let iconContent = '';
        const iconPath = path.join(this.extensionPath, 'resources', 'azure-icons', resourceInfo.iconFileName);
        try {
            if (fs.existsSync(iconPath)) {
                const iconData = fs.readFileSync(iconPath);
                const base64 = iconData.toString('base64');
                const mimeType = iconPath.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
                iconContent = `<image x="${x + 4}" y="${y + (node.height - 24) / 2}" width="24" height="24"
                       xlink:href="data:${mimeType};base64,${base64}"/>`;
            }
        } catch (e) {
            // Icon not found, skip it
        }

        // Calculate text positions
        const textX = x + 32;
        const hasDetail = detail.length > 0;
        const nameY = hasDetail ? y + node.height / 2 - 2 : y + node.height / 2 + 3;
        const detailY = y + node.height / 2 + 9;

        let detailElement = '';
        if (hasDetail) {
            detailElement = `
    <text x="${textX}" y="${detailY}" class="node-detail">
      ${this.escapeXml(this.truncateText(detail, 16))}
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
      ${this.escapeXml(this.truncateText(displayName, 12))}
    </text>${detailElement}
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
