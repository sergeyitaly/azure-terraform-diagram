import { TerraformResource, SecurityRule } from './terraformParser';
import { AzureIconMapper, AzureResourceCategory } from './azureIconMapper';

export interface DiagramNode {
    id: string;
    type: string;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    connections: string[];
    networkInfo?: any;
    securityRules?: SecurityRule[];
    category: AzureResourceCategory;
    parentGroup?: string;
    level: number;
    isGroupContainer?: boolean;
    children?: string[];
    tags?: Record<string, string>;
    module?: string;
    environment?: string;
    color?: string;
    zone?: string;
    icon?: string;
    displayName?: string;
}

export interface DiagramConnection {
    source: string;
    target: string;
    type: 'data' | 'control' | 'security' | 'dependency' | 'reference';
    label?: string;
    details?: string;
    style?: 'solid' | 'dashed' | 'dotted';
    color?: string;
    weight?: number;
    bidirectional?: boolean;
    arrow?: 'forward' | 'backward' | 'both' | 'none';
}

export interface DiagramOptions {
    layout?: 'flow' | 'layered' | 'zones' | 'microservices';
    flowDirection?: 'left-right' | 'top-bottom' | 'right-left' | 'bottom-top';
    showZones?: boolean;
    showIcons?: boolean;
    showDescriptions?: boolean;
    
    includeCategories?: AzureResourceCategory[];
    excludeCategories?: AzureResourceCategory[];
    includeTypes?: string[];
    excludeTypes?: string[];
    environment?: string;
    
    showCriticalConnectionsOnly?: boolean;
    maxConnectionsPerResource?: number;
    hideImplicitDependencies?: boolean;
    hideCrossEnvironment?: boolean;
    
    groupBy?: 'zone' | 'function' | 'layer' | 'resourceGroup' | 'none';
    
    theme?: 'light' | 'dark' | 'blueprint';
    showGrid?: boolean;
    showTitles?: boolean;
    compactMode?: boolean;
    
    width?: number;
    height?: number;
    padding?: number;
}

export class DiagramLayout {
    private static readonly DEFAULT_WIDTH = 4000;
    private static readonly DEFAULT_HEIGHT = 3000;
    private static readonly DEFAULT_PADDING = 100;
    
    // Microsoft Azure standard colors by category (complete list)
    private static readonly MICROSOFT_COLORS: Record<AzureResourceCategory, string> = {
        'Compute': '#0078D4',
        'Networking': '#107C10',
        'Storage': '#0078D4',
        'Databases': '#E3008C',
        'Security': '#FF8C00',
        'Monitoring + Management': '#68217A',
        'General': '#666666',
        'Analytics': '#2D7DB5',
        'AI + Machine Learning': '#7719AA',
        'Integration': '#D4450D',
        'Identity': '#D13438',
        'Web': '#107C10',
        'Containers': '#0078D4',
        'DevOps': '#68217A'
    };
    
    // Microsoft-style zones
    private static readonly ZONES: Record<string, { color: string; order: number }> = {
        'Internet': { color: '#E1E1E1', order: 0 },
        'Edge': { color: '#F3F2F1', order: 1 },
        'DMZ': { color: '#EDEBE9', order: 2 },
        'Presentation': { color: '#F3F2F1', order: 3 },
        'Application': { color: '#E1E1E1', order: 4 },
        'Data': { color: '#F3F2F1', order: 5 },
        'Management': { color: '#EDEBE9', order: 6 },
        'Identity': { color: '#F3F2F1', order: 7 }
    };
    
    // Resource to zone mapping
    private static readonly RESOURCE_ZONES: Record<string, string> = {
        'azurerm_frontdoor': 'Edge',
        'azurerm_cdn_endpoint': 'Edge',
        'azurerm_application_gateway': 'Edge',
        'azurerm_traffic_manager': 'Edge',
        
        'azurerm_firewall': 'DMZ',
        'azurerm_bastion_host': 'DMZ',
        'azurerm_nat_gateway': 'DMZ',
        
        'azurerm_app_service': 'Presentation',
        'azurerm_app_service_plan': 'Presentation',
        'azurerm_static_site': 'Presentation',
        'azurerm_function_app': 'Presentation',
        
        'azurerm_virtual_machine': 'Application',
        'azurerm_kubernetes_cluster': 'Application',
        'azurerm_container_group': 'Application',
        'azurerm_container_registry': 'Application',
        
        'azurerm_sql_database': 'Data',
        'azurerm_cosmosdb_account': 'Data',
        'azurerm_storage_account': 'Data',
        'azurerm_redis_cache': 'Data',
        'azurerm_postgresql_server': 'Data',
        'azurerm_mysql_server': 'Data',
        
        'azurerm_monitor_action_group': 'Management',
        'azurerm_log_analytics_workspace': 'Management',
        'azurerm_application_insights': 'Management',
        'azurerm_automation_account': 'Management',
        
        'azurerm_key_vault': 'Identity',
        'azurerm_user_assigned_identity': 'Identity'
    };
    
    static createLayout(
        resources: TerraformResource[], 
        dependencies: Map<string, string[]>,
        options: DiagramOptions = {}
    ): DiagramNode[] {
        const mergedOptions: DiagramOptions = {
            layout: 'flow',
            flowDirection: 'top-bottom',
            showZones: true,
            showIcons: true,
            showDescriptions: false,
            showCriticalConnectionsOnly: true,
            maxConnectionsPerResource: 2,
            hideImplicitDependencies: true,
            groupBy: 'resourceGroup',  // Changed default to resourceGroup
            theme: 'light',
            showTitles: true,
            compactMode: false,
            width: this.DEFAULT_WIDTH,
            height: this.DEFAULT_HEIGHT,
            padding: this.DEFAULT_PADDING,
            ...options
        };

        const filteredResources = this.filterResources(resources, mergedOptions);

        if (filteredResources.length === 0) {
            return [];
        }

        // If groupBy is resourceGroup, use the resource group layout
        if (mergedOptions.groupBy === 'resourceGroup') {
            let nodes = this.createResourceGroupLayout(filteredResources, dependencies, mergedOptions);
            nodes = this.applyStyling(nodes, mergedOptions);
            this.ensureWithinBounds(nodes, mergedOptions);
            return nodes;
        }

        const layoutMethod = mergedOptions.layout || 'flow';
        let nodes: DiagramNode[] = [];

        switch (layoutMethod) {
            case 'layered':
                nodes = this.createLayeredLayout(filteredResources, dependencies, mergedOptions);
                break;
            case 'zones':
                nodes = this.createZoneBasedLayout(filteredResources, dependencies, mergedOptions);
                break;
            case 'microservices':
                nodes = this.createMicroservicesLayout(filteredResources, dependencies, mergedOptions);
                break;
            case 'flow':
            default:
                nodes = this.createFlowLayout(filteredResources, dependencies, mergedOptions);
                break;
        }
        
        nodes = this.applyStyling(nodes, mergedOptions);
        this.ensureWithinBounds(nodes, mergedOptions);
        
        return nodes;
    }
    
    private static filterResources(
        resources: TerraformResource[], 
        options: DiagramOptions
    ): TerraformResource[] {
        if (!options.includeCategories && !options.excludeCategories && 
            !options.includeTypes && !options.excludeTypes && 
            !options.environment) {
            return resources;
        }
        
        return resources.filter(resource => {
            const resourceInfo = AzureIconMapper.getResourceInfo(resource.type);
            
            if (options.includeCategories?.length && 
                !options.includeCategories.includes(resourceInfo.category)) {
                return false;
            }
            
            if (options.excludeCategories?.includes(resourceInfo.category)) {
                return false;
            }
            
            if (options.includeTypes?.length && 
                !options.includeTypes.includes(resource.type)) {
                return false;
            }
            
            if (options.excludeTypes?.includes(resource.type)) {
                return false;
            }
            
            if (options.environment && this.extractEnvironment(resource) !== options.environment) {
                return false;
            }
            
            return true;
        });
    }
    
    private static createFlowLayout(
        resources: TerraformResource[],
        dependencies: Map<string, string[]>,
        options: DiagramOptions
    ): DiagramNode[] {
        const nodes: DiagramNode[] = [];
        const width = options.width || this.DEFAULT_WIDTH;
        const height = options.height || this.DEFAULT_HEIGHT;
        const padding = options.padding || this.DEFAULT_PADDING;
        
        const resourcesByZone = this.groupResourcesByZone(resources);
        const direction = options.flowDirection || 'top-bottom';
        const isHorizontal = direction === 'left-right' || direction === 'right-left';
        
        const availableWidth = width - 2 * padding;
        const availableHeight = height - 2 * padding;
        
        if (isHorizontal) {
            const zones = Array.from(resourcesByZone.keys())
                .filter(zone => zone !== 'Unknown')
                .sort((a, b) => {
                    const orderA = this.ZONES[a]?.order || 999;
                    const orderB = this.ZONES[b]?.order || 999;
                    return orderA - orderB;
                });
            
            const zoneCount = zones.length;
            const zoneWidth = availableWidth / Math.max(zoneCount, 1);

            zones.forEach((zone, zoneIndex) => {
                const zoneX = padding + zoneIndex * zoneWidth;

                const zoneResources = resourcesByZone.get(zone) || [];
                const resourcesPerColumn = Math.max(Math.ceil(Math.sqrt(zoneResources.length)), 1);
                const resourceWidth = options.compactMode ? 140 : 180;
                const resourceHeight = options.compactMode ? 52 : 64;
                const columnSpacing = 15;
                const rowSpacing = 8;
                const numRows = Math.ceil(zoneResources.length / resourcesPerColumn);

                // Create zone group container (rounded rectangle with label)
                if (options.showZones) {
                    const containerHeight = 35 + numRows * (resourceHeight + rowSpacing) + 10;
                    const zoneContainer: DiagramNode = {
                        id: `zone_container_${zone}`,
                        type: 'zone-container',
                        name: zone,
                        x: zoneX + 10,
                        y: padding,
                        width: zoneWidth - 20,
                        height: Math.max(containerHeight, 120),
                        connections: [],
                        category: 'General',
                        level: 0,
                        isGroupContainer: true,
                        children: [],
                        color: this.ZONES[zone]?.color || '#FFFFFF',
                        zone: zone,
                        displayName: zone
                    };
                    nodes.push(zoneContainer);
                }

                const startX = zoneX + 30;
                const startY = padding + (options.showZones ? 35 : 15);
                
                zoneResources.forEach((resource, resourceIndex) => {
                    const column = resourceIndex % resourcesPerColumn;
                    const row = Math.floor(resourceIndex / resourcesPerColumn);
                    
                    const nodeId = `${resource.type}_${resource.name}`;
                    const resourceInfo = AzureIconMapper.getResourceInfo(resource.type);
                    const env = this.extractEnvironment(resource);
                    
                    const nodeX = startX + column * (resourceWidth + columnSpacing);
                    const nodeY = startY + row * (resourceHeight + rowSpacing);
                    
                    const containerId = options.showZones ? `zone_container_${zone}` : undefined;
                    const node: DiagramNode = {
                        id: nodeId,
                        type: resource.type,
                        name: resource.name,
                        x: nodeX,
                        y: nodeY,
                        width: resourceWidth,
                        height: resourceHeight,
                        connections: dependencies.get(nodeId) || [],
                        networkInfo: resource.networkInfo,
                        securityRules: resource.securityRules,
                        category: resourceInfo.category,
                        tags: resource.tags,
                        environment: env,
                        module: resource.module,
                        level: 1,
                        parentGroup: containerId,
                        color: this.MICROSOFT_COLORS[resourceInfo.category],
                        zone: zone,
                        icon: resourceInfo.icon,
                        displayName: this.getDisplayName(resource)
                    };

                    if (options.showZones) {
                        const container = nodes.find(n => n.id === `zone_container_${zone}`);
                        if (container && container.children) {
                            container.children.push(nodeId);
                        }
                    }

                    nodes.push(node);
                });
            });
            
            // Handle unknown resources
            const unknownResources = resourcesByZone.get('Unknown') || [];
            if (unknownResources.length > 0) {
                const unknownZoneX = padding + zones.length * zoneWidth;
                const unknownResourceWidth = options.compactMode ? 100 : 120;
                const unknownResourceHeight = options.compactMode ? 38 : 44;
                const unknownRowSpacing = 8;
                const unknownNumRows = Math.ceil(unknownResources.length / 3);

                if (options.showZones) {
                    const containerHeight = 35 + unknownNumRows * (unknownResourceHeight + unknownRowSpacing) + 10;
                    const unknownContainer: DiagramNode = {
                        id: 'zone_container_other',
                        type: 'zone-container',
                        name: 'Other Services',
                        x: unknownZoneX + 10,
                        y: padding,
                        width: zoneWidth - 20,
                        height: Math.max(containerHeight, 120),
                        connections: [],
                        category: 'General',
                        level: 0,
                        isGroupContainer: true,
                        children: [],
                        color: '#F3F2F1',
                        zone: 'Other',
                        displayName: 'Other Services'
                    };
                    nodes.push(unknownContainer);
                }

                unknownResources.forEach((resource, index) => {
                    const nodeId = `${resource.type}_${resource.name}`;
                    const resourceInfo = AzureIconMapper.getResourceInfo(resource.type);
                    const env = this.extractEnvironment(resource);

                    const column = index % 3;
                    const row = Math.floor(index / 3);

                    const nodeX = unknownZoneX + 30 + column * (unknownResourceWidth + 15);
                    const nodeY = padding + (options.showZones ? 35 : 15) + row * (unknownResourceHeight + unknownRowSpacing);

                    const node: DiagramNode = {
                        id: nodeId,
                        type: resource.type,
                        name: resource.name,
                        x: nodeX,
                        y: nodeY,
                        width: unknownResourceWidth,
                        height: unknownResourceHeight,
                        connections: dependencies.get(nodeId) || [],
                        networkInfo: resource.networkInfo,
                        securityRules: resource.securityRules,
                        category: resourceInfo.category,
                        tags: resource.tags,
                        environment: env,
                        module: resource.module,
                        level: 1,
                        parentGroup: options.showZones ? 'zone_container_other' : undefined,
                        color: this.MICROSOFT_COLORS[resourceInfo.category],
                        zone: 'Other',
                        icon: resourceInfo.icon,
                        displayName: this.getDisplayName(resource)
                    };

                    if (options.showZones) {
                        const container = nodes.find(n => n.id === 'zone_container_other');
                        if (container && container.children) {
                            container.children.push(nodeId);
                        }
                    }

                    nodes.push(node);
                });
            }
        } else {
            // Vertical layout: zones stacked top-to-bottom
            // Within each zone, same-type resources are placed side-by-side (horizontal)
            // Different type groups are stacked vertically
            const zones = Array.from(resourcesByZone.keys())
                .filter(zone => zone !== 'Unknown')
                .sort((a, b) => {
                    const orderA = this.ZONES[a]?.order || 999;
                    const orderB = this.ZONES[b]?.order || 999;
                    return orderA - orderB;
                });

            const resourceWidth = options.compactMode ? 140 : 180;
            const resourceHeight = options.compactMode ? 52 : 64;
            const colSpacing = 12;
            const rowSpacing = 6;
            const typeGroupSpacing = 14;
            const maxPerRow = 6;
            const zoneGap = 20;
            const headerHeight = 35;

            let currentY = padding;
            const containerPadding = 12;

            zones.forEach((zone) => {
                const zoneResources = resourcesByZone.get(zone) || [];

                // Group resources by type within this zone
                const resourcesByType = new Map<string, TerraformResource[]>();
                zoneResources.forEach(resource => {
                    if (!resourcesByType.has(resource.type)) {
                        resourcesByType.set(resource.type, []);
                    }
                    resourcesByType.get(resource.type)!.push(resource);
                });

                // Calculate max row width needed for this zone
                let maxRowWidth = 0;
                resourcesByType.forEach((typeResources) => {
                    const itemsInFirstRow = Math.min(typeResources.length, maxPerRow);
                    const rowWidth = itemsInFirstRow * resourceWidth + (itemsInFirstRow - 1) * colSpacing;
                    maxRowWidth = Math.max(maxRowWidth, rowWidth);
                });

                // Container width fits content + padding
                const containerWidth = maxRowWidth + containerPadding * 2;
                const containerX = padding + (availableWidth - containerWidth) / 2;
                const containerTop = currentY;

                // Create zone group container (placeholder height, updated later)
                if (options.showZones) {
                    const zoneContainer: DiagramNode = {
                        id: `zone_container_${zone}`,
                        type: 'zone-container',
                        name: zone,
                        x: containerX,
                        y: containerTop,
                        width: containerWidth,
                        height: 70, // placeholder, updated below
                        connections: [],
                        category: 'General',
                        level: 0,
                        isGroupContainer: true,
                        children: [],
                        color: this.ZONES[zone]?.color || '#FFFFFF',
                        zone: zone,
                        displayName: zone
                    };
                    nodes.push(zoneContainer);
                }

                let nodeY = containerTop + (options.showZones ? headerHeight : 10);

                // Layout each type group: same-type resources side-by-side
                resourcesByType.forEach((typeResources) => {
                    const totalItems = typeResources.length;
                    const rowCount = Math.ceil(totalItems / maxPerRow);

                    for (let row = 0; row < rowCount; row++) {
                        const rowStart = row * maxPerRow;
                        const rowEnd = Math.min(rowStart + maxPerRow, totalItems);
                        const itemsInRow = rowEnd - rowStart;

                        // Center this row horizontally within the container
                        const totalRowWidth = itemsInRow * resourceWidth + (itemsInRow - 1) * colSpacing;
                        const rowStartX = containerX + (containerWidth - totalRowWidth) / 2;

                        for (let col = 0; col < itemsInRow; col++) {
                            const resource = typeResources[rowStart + col];
                            const nodeId = `${resource.type}_${resource.name}`;
                            const resourceInfo = AzureIconMapper.getResourceInfo(resource.type);
                            const env = this.extractEnvironment(resource);

                            const nodeX = rowStartX + col * (resourceWidth + colSpacing);
                            const actualY = nodeY + row * (resourceHeight + rowSpacing);

                            const containerId = options.showZones ? `zone_container_${zone}` : undefined;
                            const node: DiagramNode = {
                                id: nodeId,
                                type: resource.type,
                                name: resource.name,
                                x: nodeX,
                                y: actualY,
                                width: resourceWidth,
                                height: resourceHeight,
                                connections: dependencies.get(nodeId) || [],
                                networkInfo: resource.networkInfo,
                                securityRules: resource.securityRules,
                                category: resourceInfo.category,
                                tags: resource.tags,
                                environment: env,
                                module: resource.module,
                                level: 1,
                                parentGroup: containerId,
                                color: this.MICROSOFT_COLORS[resourceInfo.category],
                                zone: zone,
                                icon: resourceInfo.icon,
                                displayName: this.getDisplayName(resource)
                            };

                            if (options.showZones) {
                                const container = nodes.find(n => n.id === `zone_container_${zone}`);
                                if (container && container.children) {
                                    container.children.push(nodeId);
                                }
                            }

                            nodes.push(node);
                        }
                    }

                    // Advance Y past all rows for this type group
                    nodeY += rowCount * (resourceHeight + rowSpacing) + typeGroupSpacing;
                });

                // Finalize zone container height
                if (options.showZones) {
                    const container = nodes.find(n => n.id === `zone_container_${zone}`);
                    if (container) {
                        container.height = Math.max(nodeY - containerTop + 5, 70);
                    }
                }

                currentY = nodeY + zoneGap;
            });

            // Handle unknown resources at the bottom
            const unknownResources = resourcesByZone.get('Unknown') || [];
            if (unknownResources.length > 0) {
                // Group unknown resources by type
                const unknownByType = new Map<string, TerraformResource[]>();
                unknownResources.forEach(resource => {
                    if (!unknownByType.has(resource.type)) {
                        unknownByType.set(resource.type, []);
                    }
                    unknownByType.get(resource.type)!.push(resource);
                });

                // Calculate max row width for unknown resources
                let maxUnknownRowWidth = 0;
                unknownByType.forEach((typeResources) => {
                    const itemsInFirstRow = Math.min(typeResources.length, maxPerRow);
                    const rowWidth = itemsInFirstRow * resourceWidth + (itemsInFirstRow - 1) * colSpacing;
                    maxUnknownRowWidth = Math.max(maxUnknownRowWidth, rowWidth);
                });

                const unknownContainerWidth = maxUnknownRowWidth + containerPadding * 2;
                const unknownContainerX = padding + (availableWidth - unknownContainerWidth) / 2;
                const containerTop = currentY;

                if (options.showZones) {
                    const unknownContainer: DiagramNode = {
                        id: 'zone_container_other',
                        type: 'zone-container',
                        name: 'Other Services',
                        x: unknownContainerX,
                        y: containerTop,
                        width: unknownContainerWidth,
                        height: 70,
                        connections: [],
                        category: 'General',
                        level: 0,
                        isGroupContainer: true,
                        children: [],
                        color: '#F3F2F1',
                        zone: 'Other',
                        displayName: 'Other Services'
                    };
                    nodes.push(unknownContainer);
                }

                let nodeY = containerTop + (options.showZones ? headerHeight : 10);

                unknownByType.forEach((typeResources) => {
                    const totalItems = typeResources.length;
                    const rowCount = Math.ceil(totalItems / maxPerRow);

                    for (let row = 0; row < rowCount; row++) {
                        const rowStart = row * maxPerRow;
                        const rowEnd = Math.min(rowStart + maxPerRow, totalItems);
                        const itemsInRow = rowEnd - rowStart;

                        const totalRowWidth = itemsInRow * resourceWidth + (itemsInRow - 1) * colSpacing;
                        const rowStartX = unknownContainerX + (unknownContainerWidth - totalRowWidth) / 2;

                        for (let col = 0; col < itemsInRow; col++) {
                            const resource = typeResources[rowStart + col];
                            const nodeId = `${resource.type}_${resource.name}`;
                            const resourceInfo = AzureIconMapper.getResourceInfo(resource.type);
                            const env = this.extractEnvironment(resource);

                            const nodeX = rowStartX + col * (resourceWidth + colSpacing);
                            const actualY = nodeY + row * (resourceHeight + rowSpacing);

                            const node: DiagramNode = {
                                id: nodeId,
                                type: resource.type,
                                name: resource.name,
                                x: nodeX,
                                y: actualY,
                                width: resourceWidth,
                                height: resourceHeight,
                                connections: dependencies.get(nodeId) || [],
                                networkInfo: resource.networkInfo,
                                securityRules: resource.securityRules,
                                category: resourceInfo.category,
                                tags: resource.tags,
                                environment: env,
                                module: resource.module,
                                level: 1,
                                parentGroup: options.showZones ? 'zone_container_other' : undefined,
                                color: this.MICROSOFT_COLORS[resourceInfo.category],
                                zone: 'Other',
                                icon: resourceInfo.icon,
                                displayName: this.getDisplayName(resource)
                            };

                            if (options.showZones) {
                                const container = nodes.find(n => n.id === 'zone_container_other');
                                if (container && container.children) {
                                    container.children.push(nodeId);
                                }
                            }

                            nodes.push(node);
                        }
                    }

                    nodeY += rowCount * (resourceHeight + rowSpacing) + typeGroupSpacing;
                });

                if (options.showZones) {
                    const container = nodes.find(n => n.id === 'zone_container_other');
                    if (container) {
                        container.height = Math.max(nodeY - containerTop + 5, 70);
                    }
                }
            }
        }
        
        return nodes;
    }
    
    private static createLayeredLayout(
        resources: TerraformResource[],
        dependencies: Map<string, string[]>,
        options: DiagramOptions
    ): DiagramNode[] {
        const nodes: DiagramNode[] = [];
        const width = options.width || this.DEFAULT_WIDTH;
        const padding = options.padding || this.DEFAULT_PADDING;
        
        const layers = [
            { name: 'Client', order: 0, resources: [] as TerraformResource[] },
            { name: 'Delivery', order: 1, resources: [] as TerraformResource[] },
            { name: 'Security', order: 2, resources: [] as TerraformResource[] },
            { name: 'Presentation', order: 3, resources: [] as TerraformResource[] },
            { name: 'Application', order: 4, resources: [] as TerraformResource[] },
            { name: 'Data', order: 5, resources: [] as TerraformResource[] },
            { name: 'Management', order: 6, resources: [] as TerraformResource[] }
        ];
        
        resources.forEach(resource => {
            const layer = this.determineResourceLayer(resource);
            const layerIndex = layers.findIndex(l => l.name === layer);
            if (layerIndex !== -1) {
                layers[layerIndex].resources.push(resource);
            } else {
                layers[6].resources.push(resource);
            }
        });
        
        const populatedLayers = layers.filter(layer => layer.resources.length > 0);
        const layerWidth = (width - 2 * padding) / Math.max(populatedLayers.length, 1);
        const centerY = (options.height || this.DEFAULT_HEIGHT) / 2;
        
        populatedLayers.forEach((layer, layerIndex) => {
            const layerX = padding + layerIndex * layerWidth;

            const resources = layer.resources;
            const resourceWidth = options.compactMode ? 140 : 180;
            const resourceHeight = options.compactMode ? 52 : 64;
            const spacing = 8;
            const totalHeight = resources.length * (resourceHeight + spacing) - spacing;
            const startY = centerY - totalHeight / 2;

            // Create layer group container
            const containerTop = Math.min(startY - 30, padding);
            const containerBottom = startY + totalHeight + 20;
            const layerContainer: DiagramNode = {
                id: `layer_${layer.name}`,
                type: 'zone-container',
                name: layer.name,
                x: layerX + 10,
                y: containerTop,
                width: layerWidth - 20,
                height: containerBottom - containerTop,
                connections: [],
                category: 'General',
                level: 0,
                isGroupContainer: true,
                children: [],
                color: '#F3F2F1',
                zone: layer.name,
                displayName: layer.name
            };
            nodes.push(layerContainer);

            resources.forEach((resource, resourceIndex) => {
                const nodeId = `${resource.type}_${resource.name}`;
                const resourceInfo = AzureIconMapper.getResourceInfo(resource.type);
                const env = this.extractEnvironment(resource);

                const node: DiagramNode = {
                    id: nodeId,
                    type: resource.type,
                    name: resource.name,
                    x: layerX + (layerWidth - resourceWidth) / 2,
                    y: startY + resourceIndex * (resourceHeight + spacing),
                    width: resourceWidth,
                    height: resourceHeight,
                    connections: dependencies.get(nodeId) || [],
                    networkInfo: resource.networkInfo,
                    securityRules: resource.securityRules,
                    category: resourceInfo.category,
                    tags: resource.tags,
                    environment: env,
                    module: resource.module,
                    level: 1,
                    parentGroup: layerContainer.id,
                    color: this.MICROSOFT_COLORS[resourceInfo.category],
                    zone: layer.name,
                    icon: resourceInfo.icon,
                    displayName: this.getDisplayName(resource)
                };
                layerContainer.children!.push(nodeId);
                nodes.push(node);
            });
        });
        
        return nodes;
    }
    
    private static createZoneBasedLayout(
        resources: TerraformResource[],
        dependencies: Map<string, string[]>,
        options: DiagramOptions
    ): DiagramNode[] {
        const nodes: DiagramNode[] = [];
        const width = options.width || this.DEFAULT_WIDTH;
        const height = options.height || this.DEFAULT_HEIGHT;
        const padding = options.padding || this.DEFAULT_PADDING;
        
        const resourcesByZone = this.groupResourcesByZone(resources);
        const primaryZones = ['Internet', 'Edge', 'DMZ', 'Presentation', 'Application', 'Data'];
        const zones = primaryZones.filter(zone => resourcesByZone.has(zone));
        
        if (zones.length === 0) {
            return this.createFlowLayout(resources, dependencies, options);
        }
        
        const zoneWidth = (width - 2 * padding) / zones.length;
        const zoneHeight = height - 2 * padding - 100;
        
        zones.forEach((zone, zoneIndex) => {
            const zoneX = padding + zoneIndex * zoneWidth;
            const zoneY = padding + 80;
            
            const zoneContainer: DiagramNode = {
                id: `zone_container_${zone}`,
                type: 'zone-container',
                name: zone,
                x: zoneX + 10,
                y: zoneY,
                width: zoneWidth - 20,
                height: zoneHeight,
                connections: [],
                category: 'General',
                level: 0,
                isGroupContainer: true,
                children: [],
                color: this.ZONES[zone]?.color || '#FFFFFF',
                zone: zone,
                displayName: zone
            };
            nodes.push(zoneContainer);
            
            const zoneTitle: DiagramNode = {
                id: `zone_title_${zone}`,
                type: 'zone-title',
                name: zone,
                x: zoneX + (zoneWidth - 200) / 2,
                y: padding + 20,
                width: 200,
                height: 30,
                connections: [],
                category: 'General',
                level: 0,
                color: '#000000',
                zone: zone,
                displayName: zone
            };
            nodes.push(zoneTitle);
            
            const zoneResources = resourcesByZone.get(zone) || [];
            const resourcesPerRow = Math.ceil(Math.sqrt(zoneResources.length));
            const resourceWidth = options.compactMode ? 140 : 180;
            const resourceHeight = options.compactMode ? 52 : 64;
            const rowSpacing = 6;
            const colSpacing = 12;
            
            const totalContentWidth = resourcesPerRow * (resourceWidth + colSpacing) - colSpacing;
            const startX = zoneX + (zoneWidth - totalContentWidth) / 2;
            const startY = zoneY + 40;
            
            zoneResources.forEach((resource, resourceIndex) => {
                const row = Math.floor(resourceIndex / resourcesPerRow);
                const col = resourceIndex % resourcesPerRow;
                
                const nodeId = `${resource.type}_${resource.name}`;
                const resourceInfo = AzureIconMapper.getResourceInfo(resource.type);
                const env = this.extractEnvironment(resource);
                
                const node: DiagramNode = {
                    id: nodeId,
                    type: resource.type,
                    name: resource.name,
                    x: startX + col * (resourceWidth + colSpacing),
                    y: startY + row * (resourceHeight + rowSpacing),
                    width: resourceWidth,
                    height: resourceHeight,
                    connections: dependencies.get(nodeId) || [],
                    networkInfo: resource.networkInfo,
                    securityRules: resource.securityRules,
                    category: resourceInfo.category,
                    tags: resource.tags,
                    environment: env,
                    module: resource.module,
                    level: 1,
                    parentGroup: zoneContainer.id,
                    color: this.MICROSOFT_COLORS[resourceInfo.category],
                    zone: zone,
                    icon: resourceInfo.icon,
                    displayName: this.getDisplayName(resource)
                };
                
                zoneContainer.children!.push(nodeId);
                nodes.push(node);
            });
        });
        
        return nodes;
    }
    
    private static createMicroservicesLayout(
        resources: TerraformResource[],
        dependencies: Map<string, string[]>,
        options: DiagramOptions
    ): DiagramNode[] {
        const nodes: DiagramNode[] = [];
        const width = options.width || this.DEFAULT_WIDTH;
        const height = options.height || this.DEFAULT_HEIGHT;
        const padding = options.padding || this.DEFAULT_PADDING;
        
        const computeResources = resources.filter(resource => 
            resource.type.includes('app_service') || 
            resource.type.includes('function_app') ||
            resource.type.includes('container') ||
            resource.type.includes('kubernetes')
        );
        
        const otherResources = resources.filter(resource => 
            !computeResources.includes(resource)
        );
        
        const centerX = width / 2;
        const centerY = height / 2;
        const microservicesRadius = Math.min(width, height) / 4;

        const nodeWidth = options.compactMode ? 100 : 120;
        const nodeHeight = options.compactMode ? 42 : 48;

        computeResources.forEach((resource, index) => {
            const angle = (index / computeResources.length) * 2 * Math.PI;
            const x = centerX + microservicesRadius * Math.cos(angle) - nodeWidth / 2;
            const y = centerY + microservicesRadius * Math.sin(angle) - nodeHeight / 2;

            const nodeId = `${resource.type}_${resource.name}`;
            const resourceInfo = AzureIconMapper.getResourceInfo(resource.type);
            const env = this.extractEnvironment(resource);

            const node: DiagramNode = {
                id: nodeId,
                type: resource.type,
                name: resource.name,
                x: x,
                y: y,
                width: nodeWidth,
                height: nodeHeight,
                connections: dependencies.get(nodeId) || [],
                networkInfo: resource.networkInfo,
                securityRules: resource.securityRules,
                category: resourceInfo.category,
                tags: resource.tags,
                environment: env,
                module: resource.module,
                level: 1,
                color: this.MICROSOFT_COLORS[resourceInfo.category],
                zone: 'Application',
                icon: resourceInfo.icon,
                displayName: this.getDisplayName(resource)
            };
            nodes.push(node);
        });
        
        const sharedServicesRadius = microservicesRadius + 250;
        let currentAngle = 0;
        const angleIncrement = (2 * Math.PI) / Math.max(otherResources.length, 1);
        
        otherResources.forEach(resource => {
            const x = centerX + sharedServicesRadius * Math.cos(currentAngle) - nodeWidth / 2;
            const y = centerY + sharedServicesRadius * Math.sin(currentAngle) - nodeHeight / 2;
            currentAngle += angleIncrement;

            const nodeId = `${resource.type}_${resource.name}`;
            const resourceInfo = AzureIconMapper.getResourceInfo(resource.type);
            const env = this.extractEnvironment(resource);

            const node: DiagramNode = {
                id: nodeId,
                type: resource.type,
                name: resource.name,
                x: x,
                y: y,
                width: nodeWidth,
                height: nodeHeight,
                connections: dependencies.get(nodeId) || [],
                networkInfo: resource.networkInfo,
                securityRules: resource.securityRules,
                category: resourceInfo.category,
                tags: resource.tags,
                environment: env,
                module: resource.module,
                level: 2,
                color: this.MICROSOFT_COLORS[resourceInfo.category],
                zone: this.determineResourceZone(resource),
                icon: resourceInfo.icon,
                displayName: this.getDisplayName(resource)
            };
            nodes.push(node);
        });
        
        return nodes;
    }
    
    // ====================
    // HELPER METHODS
    // ====================
    
    private static groupResourcesByZone(resources: TerraformResource[]): Map<string, TerraformResource[]> {
        const map = new Map<string, TerraformResource[]>();

        resources.forEach(resource => {
            const zone = this.determineResourceZone(resource);
            if (!map.has(zone)) {
                map.set(zone, []);
            }
            map.get(zone)!.push(resource);
        });

        return map;
    }

    /**
     * Create layout grouped by resource group
     * Resources are organized into resource group containers, with resources inside grouped by type
     */
    private static createResourceGroupLayout(
        resources: TerraformResource[],
        dependencies: Map<string, string[]>,
        options: DiagramOptions
    ): DiagramNode[] {
        const nodes: DiagramNode[] = [];
        const padding = options.padding || this.DEFAULT_PADDING;
        const availableWidth = (options.width || this.DEFAULT_WIDTH) - 2 * padding;

        const resourceWidth = options.compactMode ? 140 : 180;
        const resourceHeight = options.compactMode ? 52 : 64;
        const colSpacing = 12;
        const rowSpacing = 8;
        const maxPerRow = 4;
        const rgGap = 25;
        const headerHeight = 32;
        const containerPadding = 15;

        // Group resources by resource group
        const resourcesByRG = this.groupResourcesByResourceGroup(resources);

        // Sort resource groups: put 'default' last
        const rgNames = Array.from(resourcesByRG.keys()).sort((a, b) => {
            if (a === 'default') return 1;
            if (b === 'default') return -1;
            return a.localeCompare(b);
        });

        let currentY = padding;

        rgNames.forEach((rgName) => {
            const rgResources = resourcesByRG.get(rgName) || [];
            if (rgResources.length === 0) return;

            // Separate resource group resource from other resources
            const rgResource = rgResources.find(r => r.type === 'azurerm_resource_group');
            const otherResources = rgResources.filter(r => r.type !== 'azurerm_resource_group');

            // Group other resources by type
            const resourcesByType = new Map<string, TerraformResource[]>();
            otherResources.forEach(resource => {
                if (!resourcesByType.has(resource.type)) {
                    resourcesByType.set(resource.type, []);
                }
                resourcesByType.get(resource.type)!.push(resource);
            });

            // Calculate container dimensions
            let totalRows = 0;
            let maxRowWidth = 0;
            resourcesByType.forEach((typeResources) => {
                const rows = Math.ceil(typeResources.length / maxPerRow);
                totalRows += rows;
                const itemsInRow = Math.min(typeResources.length, maxPerRow);
                const rowWidth = itemsInRow * resourceWidth + (itemsInRow - 1) * colSpacing;
                maxRowWidth = Math.max(maxRowWidth, rowWidth);
            });

            // Add row for the resource group resource itself if it exists
            if (rgResource) {
                totalRows += 1;
                maxRowWidth = Math.max(maxRowWidth, resourceWidth);
            }

            const containerWidth = Math.max(maxRowWidth + containerPadding * 2, 250);
            const containerHeight = headerHeight + totalRows * (resourceHeight + rowSpacing) + containerPadding;
            const containerX = padding + (availableWidth - containerWidth) / 2;

            // Create resource group container
            const containerId = `rg_container_${rgName}`;
            const rgContainer: DiagramNode = {
                id: containerId,
                type: 'resource-group-container',
                name: rgName,
                x: containerX,
                y: currentY,
                width: containerWidth,
                height: containerHeight,
                connections: [],
                category: 'General',
                level: 0,
                isGroupContainer: true,
                children: [],
                color: '#E6F2FF',
                zone: rgName,
                displayName: `Resource Group: ${rgName}`
            };
            nodes.push(rgContainer);

            let nodeY = currentY + headerHeight;

            // First, render the resource group resource itself (if exists)
            if (rgResource) {
                const nodeId = `${rgResource.type}_${rgResource.name}`;
                const resourceInfo = AzureIconMapper.getResourceInfo(rgResource.type);
                const nodeX = containerX + (containerWidth - resourceWidth) / 2;

                const rgNode: DiagramNode = {
                    id: nodeId,
                    type: rgResource.type,
                    name: rgResource.name,
                    x: nodeX,
                    y: nodeY,
                    width: resourceWidth,
                    height: resourceHeight,
                    connections: dependencies.get(nodeId) || [],
                    networkInfo: rgResource.networkInfo,
                    securityRules: rgResource.securityRules,
                    category: resourceInfo.category,
                    tags: rgResource.tags,
                    environment: this.extractEnvironment(rgResource),
                    module: rgResource.module,
                    level: 1,
                    parentGroup: containerId,
                    color: this.MICROSOFT_COLORS[resourceInfo.category],
                    zone: rgName,
                    icon: resourceInfo.icon,
                    displayName: this.getDisplayName(rgResource)
                };
                nodes.push(rgNode);
                rgContainer.children!.push(nodeId);

                nodeY += resourceHeight + rowSpacing + 5; // Extra gap after RG resource
            }

            // Then render other resources grouped by type
            // Sort types to show important ones first (networking, compute, storage, etc.)
            const sortedTypes = Array.from(resourcesByType.keys()).sort((a, b) => {
                const order: Record<string, number> = {
                    'azurerm_virtual_network': 1,
                    'azurerm_subnet': 2,
                    'azurerm_network_security_group': 3,
                    'azurerm_public_ip': 4,
                    'azurerm_network_interface': 5,
                    'azurerm_linux_virtual_machine': 10,
                    'azurerm_windows_virtual_machine': 10,
                    'azurerm_virtual_machine': 10,
                    'azurerm_storage_account': 20,
                    'azurerm_key_vault': 30
                };
                const orderA = order[a] || 100;
                const orderB = order[b] || 100;
                return orderA - orderB;
            });

            sortedTypes.forEach((type) => {
                const typeResources = resourcesByType.get(type) || [];
                const totalItems = typeResources.length;
                const rowCount = Math.ceil(totalItems / maxPerRow);

                for (let row = 0; row < rowCount; row++) {
                    const rowStart = row * maxPerRow;
                    const rowEnd = Math.min(rowStart + maxPerRow, totalItems);
                    const itemsInRow = rowEnd - rowStart;

                    // Center this row within the container
                    const totalRowWidth = itemsInRow * resourceWidth + (itemsInRow - 1) * colSpacing;
                    const rowStartX = containerX + (containerWidth - totalRowWidth) / 2;

                    for (let col = 0; col < itemsInRow; col++) {
                        const resource = typeResources[rowStart + col];
                        const nodeId = `${resource.type}_${resource.name}`;
                        const resourceInfo = AzureIconMapper.getResourceInfo(resource.type);

                        const nodeX = rowStartX + col * (resourceWidth + colSpacing);
                        const actualY = nodeY + row * (resourceHeight + rowSpacing);

                        const node: DiagramNode = {
                            id: nodeId,
                            type: resource.type,
                            name: resource.name,
                            x: nodeX,
                            y: actualY,
                            width: resourceWidth,
                            height: resourceHeight,
                            connections: dependencies.get(nodeId) || [],
                            networkInfo: resource.networkInfo,
                            securityRules: resource.securityRules,
                            category: resourceInfo.category,
                            tags: resource.tags,
                            environment: this.extractEnvironment(resource),
                            module: resource.module,
                            level: 1,
                            parentGroup: containerId,
                            color: this.MICROSOFT_COLORS[resourceInfo.category],
                            zone: rgName,
                            icon: resourceInfo.icon,
                            displayName: this.getDisplayName(resource)
                        };
                        nodes.push(node);
                        rgContainer.children!.push(nodeId);
                    }
                }

                nodeY += rowCount * (resourceHeight + rowSpacing);
            });

            // Update container height based on actual content
            rgContainer.height = nodeY - currentY + containerPadding;

            currentY = nodeY + rgGap;
        });

        return nodes;
    }

    /**
     * Extract resource group name from a resource
     */
    private static extractResourceGroupName(resource: TerraformResource): string {
        // Check direct attribute
        if (resource.attributes?.resource_group_name) {
            const rgName = resource.attributes.resource_group_name;
            // Handle variable references like azurerm_resource_group.main.name
            if (typeof rgName === 'string') {
                const match = rgName.match(/azurerm_resource_group\.([^.]+)/);
                if (match) return match[1];
                // Handle var references
                if (rgName.startsWith('var.')) return rgName.replace('var.', '');
                // Handle local references
                if (rgName.startsWith('local.')) return rgName.replace('local.', '');
                return rgName;
            }
        }

        // If this IS a resource group, return its name
        if (resource.type === 'azurerm_resource_group') {
            return resource.name;
        }

        return 'default';
    }

    /**
     * Group resources by their resource group
     */
    private static groupResourcesByResourceGroup(resources: TerraformResource[]): Map<string, TerraformResource[]> {
        const map = new Map<string, TerraformResource[]>();

        // First, find all resource groups
        const resourceGroups = resources.filter(r => r.type === 'azurerm_resource_group');
        resourceGroups.forEach(rg => {
            map.set(rg.name, [rg]);
        });

        // Then assign other resources to their resource groups
        resources.forEach(resource => {
            if (resource.type === 'azurerm_resource_group') return; // Already added

            const rgName = this.extractResourceGroupName(resource);
            if (!map.has(rgName)) {
                map.set(rgName, []);
            }
            map.get(rgName)!.push(resource);
        });

        return map;
    }
    
    private static determineResourceZone(resource: TerraformResource): string {
        const predefinedZone = this.RESOURCE_ZONES[resource.type];
        if (predefinedZone) {
            return predefinedZone;
        }
        
        const resourceInfo = AzureIconMapper.getResourceInfo(resource.type);
        
        switch (resourceInfo.category) {
            case 'Compute':
                return resource.type.includes('container') ? 'Application' : 'Application';
            case 'Networking':
                return resource.type.includes('firewall') ? 'DMZ' : 'Edge';
            case 'Storage':
            case 'Databases':
                return 'Data';
            case 'Security':
                return resource.type.includes('key_vault') ? 'Identity' : 'Security';
            case 'Monitoring + Management':
                return 'Management';
            default:
                return 'Unknown';
        }
    }
    
    private static determineResourceLayer(resource: TerraformResource): string {
        const zone = this.determineResourceZone(resource);
        
        switch (zone) {
            case 'Internet':
                return 'Client';
            case 'Edge':
            case 'DMZ':
                return 'Delivery';
            case 'Security':
                return 'Security';
            case 'Presentation':
                return 'Presentation';
            case 'Application':
                return 'Application';
            case 'Data':
                return 'Data';
            case 'Identity':
            case 'Management':
                return 'Management';
            default:
                return 'Management';
        }
    }
    
    private static extractEnvironment(resource: TerraformResource): string | undefined {
        return resource.tags?.environment || 
               resource.tags?.env || 
               resource.attributes?.environment ||
               this.extractEnvironmentFromName(resource.name);
    }
    
    private static extractEnvironmentFromName(name: string): string | undefined {
        const lowerName = name.toLowerCase();
        if (lowerName.includes('prod') || lowerName.includes('production')) return 'production';
        if (lowerName.includes('staging')) return 'staging';
        if (lowerName.includes('dev') || lowerName.includes('development')) return 'development';
        if (lowerName.includes('test')) return 'test';
        if (lowerName.includes('qa')) return 'qa';
        return undefined;
    }
    
    private static getDisplayName(resource: TerraformResource): string {
        let displayName = resource.name
            .replace(/^azurerm_/, '')
            .replace(/^azure_/, '')
            .replace(/_/g, ' ')
            .replace(/\b(prod|dev|staging|test|qa)\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
        
        if (displayName.length > 0) {
            displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
        }
        
        if (displayName.length > 20) {
            displayName = displayName.substring(0, 17) + '...';
        }
        
        return displayName || resource.type.replace('azurerm_', '');
    }
    
    private static applyStyling(nodes: DiagramNode[], options: DiagramOptions): DiagramNode[] {
        return nodes.map(node => {
            if (!node.isGroupContainer && node.type !== 'zone' && node.type !== 'layer' && node.type !== 'zone-container' && node.type !== 'zone-title') {
                node.width = options.compactMode ? 140 : 180;
                node.height = options.compactMode ? 52 : 64;
                
                if (!node.displayName && node.name) {
                    node.displayName = this.getDisplayName({
                        type: node.type,
                        name: node.name
                    } as TerraformResource);
                }
            }
            
            if (options.theme === 'dark') {
                if (node.color && node.color.startsWith('#')) {
                    const hex = node.color.substring(1);
                    const rgb = parseInt(hex, 16);
                    const r = (rgb >> 16) & 0xff;
                    const g = (rgb >> 8) & 0xff;
                    const b = rgb & 0xff;
                    
                    const darkenedR = Math.max(0, r - 51);
                    const darkenedG = Math.max(0, g - 51);
                    const darkenedB = Math.max(0, b - 51);
                    
                    node.color = `#${darkenedR.toString(16).padStart(2, '0')}${darkenedG.toString(16).padStart(2, '0')}${darkenedB.toString(16).padStart(2, '0')}`;
                }
            } else if (options.theme === 'blueprint') {
                if (node.type === 'zone-container' || node.type === 'zone') {
                    node.color = '#E6F2FF';
                }
            }
            
            return node;
        });
    }
    
    private static ensureWithinBounds(nodes: DiagramNode[], options: DiagramOptions): void {
        if (nodes.length === 0) return;
        
        const width = options.width || this.DEFAULT_WIDTH;
        const height = options.height || this.DEFAULT_HEIGHT;
        const padding = options.padding || this.DEFAULT_PADDING;
        
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        nodes.forEach(node => {
            minX = Math.min(minX, node.x);
            maxX = Math.max(maxX, node.x + node.width);
            minY = Math.min(minY, node.y);
            maxY = Math.max(maxY, node.y + node.height);
        });
        
        const currentWidth = maxX - minX;
        const currentHeight = maxY - minY;
        
        const targetWidth = width - 2 * padding;
        const targetHeight = height - 2 * padding;
        
        const scaleX = targetWidth / currentWidth;
        const scaleY = targetHeight / currentHeight;
        const scale = Math.min(scaleX, scaleY, 1);
        
        const offsetX = padding + (targetWidth - currentWidth * scale) / 2;
        const offsetY = padding + (targetHeight - currentHeight * scale) / 2;
        
        nodes.forEach(node => {
            node.x = (node.x - minX) * scale + offsetX;
            node.y = (node.y - minY) * scale + offsetY;
            node.width *= scale;
            node.height *= scale;
        });
    }
    
    // ====================
    // DEPENDENCY EXTRACTION
    // ====================
    
    static extractDependencies(
        resources: TerraformResource[],
        options: DiagramOptions = {}
    ): Map<string, string[]> {
        const dependencies = new Map<string, string[]>();
        const resourceMap = new Map<string, TerraformResource>();
        
        resources.forEach(resource => {
            const resourceId = `${resource.type}_${resource.name}`;
            resourceMap.set(resourceId, resource);
        });
        
        resources.forEach(resource => {
            const resourceId = `${resource.type}_${resource.name}`;
            const deps: string[] = [];

            if (resource.dependencies) {
                resource.dependencies.forEach(dep => {
                    // Skip dependencies to non-resource entities (var, local, data)
                    if (dep.startsWith('var_') || dep.startsWith('local_') || dep.startsWith('data.')) {
                        return;
                    }
                    // Skip self-references
                    if (dep === resourceId) {
                        return;
                    }
                    // Only include dependencies to resources that actually exist in the diagram
                    if (!resourceMap.has(dep)) {
                        return;
                    }
                    if (options.hideCrossEnvironment) {
                        const sourceEnv = this.extractEnvironment(resource);
                        const targetResource = resourceMap.get(dep);
                        if (targetResource) {
                            const targetEnv = this.extractEnvironment(targetResource);
                            if (sourceEnv && targetEnv && sourceEnv !== targetEnv) {
                                return;
                            }
                        }
                    }
                    deps.push(dep);
                });
            }

            if (!options.hideImplicitDependencies) {
                this.extractImplicitDependencies(resource, deps, resourceMap);
            }
            
            if (options.maxConnectionsPerResource && 
                deps.length > options.maxConnectionsPerResource) {
                deps.sort((a, b) => {
                    const aIsImportant = a.includes('azurerm_resource_group') || a.includes('azurerm_virtual_network');
                    const bIsImportant = b.includes('azurerm_resource_group') || b.includes('azurerm_virtual_network');
                    if (aIsImportant && !bIsImportant) return -1;
                    if (!aIsImportant && bIsImportant) return 1;
                    return 0;
                });
                deps.splice(options.maxConnectionsPerResource);
            }
            
            if (deps.length > 0) {
                dependencies.set(resourceId, deps);
            }
        });
        
        return dependencies;
    }
    
    private static extractImplicitDependencies(
        resource: TerraformResource, 
        deps: string[], 
        resourceMap: Map<string, TerraformResource>
    ): void {
        const extractFromValue = (value: any): void => {
            if (typeof value === 'string') {
                const matches = value.match(/(azurerm_[a-zA-Z0-9_]+)\.([a-zA-Z0-9_-]+)/g);
                if (matches) {
                    matches.forEach(match => {
                        const baseRef = match.split('.')[0] + '.' + match.split('.')[1];
                        if (!deps.includes(baseRef)) {
                            deps.push(baseRef);
                        }
                    });
                }
                
                const moduleMatches = value.match(/module\.([a-zA-Z0-9_-]+)/g);
                if (moduleMatches) {
                    moduleMatches.forEach(match => {
                        if (!deps.includes(match)) {
                            deps.push(match);
                        }
                    });
                }
            } else if (Array.isArray(value)) {
                value.forEach(item => extractFromValue(item));
            } else if (typeof value === 'object' && value !== null) {
                Object.values(value).forEach(item => extractFromValue(item));
            }
        };
        
        Object.values(resource.attributes).forEach(value => {
            extractFromValue(value);
        });
    }
    
    // ====================
    // CONNECTION EXTRACTION
    // ====================
    
    static extractConnections(
        nodes: DiagramNode[], 
        options: DiagramOptions = {}
    ): DiagramConnection[] {
        const connections: DiagramConnection[] = [];
        const nodeMap = new Map<string, DiagramNode>();
        nodes.forEach(node => nodeMap.set(node.id, node));
        
        nodes.forEach(sourceNode => {
            if (sourceNode.type === 'zone' || sourceNode.type === 'layer' || 
                sourceNode.type === 'zone-container' || sourceNode.type === 'zone-title') {
                return;
            }
            
            const relevantConnections = this.filterConnections(
                sourceNode.connections,
                sourceNode,
                nodeMap,
                options
            );
            
            relevantConnections.forEach(targetId => {
                const targetNode = nodeMap.get(targetId);
                if (targetNode && 
                    targetNode.type !== 'zone' && 
                    targetNode.type !== 'layer' &&
                    targetNode.type !== 'zone-container' &&
                    targetNode.type !== 'zone-title') {
                    
                    const connectionType = this.determineConnectionType(sourceNode, targetNode);
                    
                    // Calculate arrow direction
                    const sourceCenterX = sourceNode.x + sourceNode.width / 2;
                    const sourceCenterY = sourceNode.y + sourceNode.height / 2;
                    const targetCenterX = targetNode.x + targetNode.width / 2;
                    const targetCenterY = targetNode.y + targetNode.height / 2;
                    
                    // Determine arrow style based on connection type
                    let arrow: 'forward' | 'backward' | 'both' | 'none';
                    switch (connectionType) {
                        case 'data':
                            arrow = 'forward';
                            break;
                        case 'control':
                            arrow = 'forward';
                            break;
                        case 'security':
                            arrow = 'both';
                            break;
                        case 'dependency':
                        default:
                            arrow = 'none';
                    }
                    
                    const connection: DiagramConnection = {
                        source: sourceNode.id,
                        target: targetId,
                        type: connectionType,
                        label: this.getConnectionLabel(sourceNode, targetNode),
                        style: connectionType === 'dependency' ? 'dashed' : 'solid',
                        color: this.getConnectionColor(connectionType),
                        weight: 1,
                        arrow: arrow,
                        // Add rotation info for the renderer
                        details: JSON.stringify({
                            rotation: this.calculateArrowRotation(
                                sourceCenterX, sourceCenterY, 
                                targetCenterX, targetCenterY
                            )
                        })
                    };
                    
                    connections.push(connection);
                }
            });
        });
        
        return connections;
    }
    
    private static filterConnections(
        connections: string[],
        sourceNode: DiagramNode,
        nodeMap: Map<string, DiagramNode>,
        options: DiagramOptions
    ): string[] {
        if (connections.length === 0) return [];
        
        const filtered: string[] = [];
        const maxConnections = options.maxConnectionsPerResource || 3;
        
        const scoredConnections = connections.map(targetId => {
            const targetNode = nodeMap.get(targetId);
            let score = 0;
            
            if (targetNode) {
                if (sourceNode.zone !== targetNode.zone) score += 10;
                if (this.isCriticalDependency(sourceNode, targetNode)) score += 20;
                if (this.isDataFlow(sourceNode, targetNode)) score += 15;
                if (this.isSecurityRelated(sourceNode, targetNode)) score += 10;
                
                if (targetNode.type.includes('sql') || 
                    targetNode.type.includes('cosmosdb') || 
                    targetNode.type.includes('storage_account')) {
                    score += 5;
                }
            }
            
            return { targetId, score };
        });
        
        scoredConnections.sort((a, b) => b.score - a.score);
        return scoredConnections
            .slice(0, maxConnections)
            .map(item => item.targetId)
            .filter(targetId => {
                const targetNode = nodeMap.get(targetId);
                return targetNode && targetNode !== sourceNode;
            });
    }
    
    private static isCriticalDependency(source: DiagramNode, target: DiagramNode): boolean {
        const criticalPairs = [
            ['azurerm_virtual_machine', 'azurerm_network_interface'],
            ['azurerm_network_interface', 'azurerm_public_ip'],
            ['azurerm_network_interface', 'azurerm_subnet'],
            ['azurerm_subnet', 'azurerm_virtual_network'],
            ['azurerm_app_service', 'azurerm_app_service_plan'],
            ['azurerm_sql_database', 'azurerm_sql_server'],
            ['azurerm_kubernetes_cluster', 'azurerm_network_interface']
        ];
        
        return criticalPairs.some(pair => 
            (source.type.includes(pair[0]) && target.type.includes(pair[1])) ||
            (source.type.includes(pair[1]) && target.type.includes(pair[0]))
        );
    }
    
    private static isDataFlow(source: DiagramNode, target: DiagramNode): boolean {
        const sourceIsDataConsumer = source.type.includes('app_service') || 
                                    source.type.includes('function_app') ||
                                    source.type.includes('virtual_machine') ||
                                    source.type.includes('container');
        
        const targetIsDataSource = target.type.includes('sql') ||
                                  target.type.includes('cosmosdb') ||
                                  target.type.includes('storage_account') ||
                                  target.type.includes('redis');
        
        return sourceIsDataConsumer && targetIsDataSource;
    }
    
    private static isSecurityRelated(source: DiagramNode, target: DiagramNode): boolean {
        const securityResources = ['firewall', 'network_security_group', 'key_vault', 'bastion'];
        return securityResources.some(resource => 
            source.type.includes(resource) || target.type.includes(resource)
        );
    }
    
    private static determineConnectionType(source: DiagramNode, target: DiagramNode): DiagramConnection['type'] {
        if (this.isDataFlow(source, target)) return 'data';
        if (this.isSecurityRelated(source, target)) return 'security';
        if (source.zone !== target.zone) return 'control';
        return 'dependency';
    }
    
    private static getConnectionLabel(source: DiagramNode, target: DiagramNode): string {
        if (this.isDataFlow(source, target)) return 'data';
        if (source.type.includes('network_security_group') && target.type.includes('network_interface')) {
            return 'secures';
        }
        if (source.type.includes('application_gateway') && target.type.includes('app_service')) {
            return 'routes to';
        }
        return '';
    }
    
    private static getConnectionColor(type: DiagramConnection['type']): string {
        switch (type) {
            case 'data': return '#107C10';
            case 'control': return '#0078D4';
            case 'security': return '#FF8C00';
            case 'dependency': return '#666666';
            default: return '#666666';
        }
    }
    
    // ====================
    // UTILITY METHODS
    // ====================
    
    static calculateArrowRotation(sourceX: number, sourceY: number, targetX: number, targetY: number): number {
        // Calculate angle in radians
        const dx = targetX - sourceX;
        const dy = targetY - sourceY;
        
        // Calculate angle in radians (0° points to the right, positive is clockwise)
        let angleRad = Math.atan2(dy, dx);
        
        // Convert to degrees
        let angleDeg = angleRad * (180 / Math.PI);
        
        // SVG arrows typically point to the right (0°), so we need to adjust
        // Subtract 90° to account for the default downward-pointing arrow
        angleDeg -= 90;
        
        // Normalize to 0-360 range
        if (angleDeg < 0) {
            angleDeg += 360;
        }
        
        return angleDeg;
    }
    
    static getMicrosoftColor(category: AzureResourceCategory): string {
        return this.MICROSOFT_COLORS[category] || '#666666';
    }
    
    static getZoneColor(zone: string): string {
        return this.ZONES[zone]?.color || '#E1E1E1';
    }
    
    static getRecommendedLayout(resourceCount: number, resourceTypes: string[]): DiagramOptions {
        const hasMicroservices = resourceTypes.some(type => 
            type.includes('app_service') || 
            type.includes('function_app') ||
            type.includes('container')
        );
        
        const hasNetworkSecurity = resourceTypes.some(type => 
            type.includes('firewall') || 
            type.includes('application_gateway') ||
            type.includes('network_security_group')
        );
        
        if (hasMicroservices && resourceCount <= 20) {
            return {
                layout: 'microservices',
                flowDirection: 'left-right',
                showZones: false,
                showIcons: true,
                compactMode: false
            };
        } else if (hasNetworkSecurity || resourceCount > 15) {
            return {
                layout: 'zones',
                flowDirection: 'left-right',
                showZones: true,
                showIcons: true,
                compactMode: false,
                groupBy: 'zone'
            };
        } else if (resourceCount <= 10) {
            return {
                layout: 'flow',
                flowDirection: 'left-right',
                showZones: true,
                showIcons: true,
                compactMode: true
            };
        } else {
            return {
                layout: 'layered',
                flowDirection: 'top-bottom',
                showZones: true,
                showIcons: true,
                compactMode: false,
                groupBy: 'layer'
            };
        }
    }
}

// Arrow Helper class for SVG rendering
export class ArrowHelper {
    static createArrowMarker(
        markerId: string, 
        color: string, 
        strokeWidth: number = 2
    ): string {
        // Create a marker that points to the right (0°)
        const markerSize = 10;
        const refX = markerSize; // Reference point at the tip
        const refY = markerSize / 2;
        
        return `
            <marker 
                id="${markerId}"
                viewBox="0 0 10 10" 
                refX="${refX}" 
                refY="${refY}"
                markerWidth="${markerSize}" 
                markerHeight="${markerSize}"
                orient="auto"
            >
                <path 
                    d="M 0 0 L 10 5 L 0 10 z" 
                    fill="${color}"
                />
            </marker>
        `;
    }
    
    static createArrowPath(
        sourceX: number, 
        sourceY: number, 
        targetX: number, 
        targetY: number,
        curvature: number = 0
    ): string {
        if (curvature === 0) {
            // Straight line
            return `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
        } else {
            // Bezier curve for better visualization
            const midX = (sourceX + targetX) / 2;
            const midY = (sourceY + targetY) / 2;
            
            // Calculate control point for curvature
            const dx = targetX - sourceX;
            const dy = targetY - sourceY;
            const normalX = -dy;
            const normalY = dx;
            const length = Math.sqrt(normalX * normalX + normalY * normalY);
            
            const controlX = midX + (normalX / length) * curvature;
            const controlY = midY + (normalY / length) * curvature;
            
            return `M ${sourceX} ${sourceY} Q ${controlX} ${controlY} ${targetX} ${targetY}`;
        }
    }
    
    static getArrowStyle(connectionType: DiagramConnection['type']): {
        stroke: string;
        strokeWidth: number;
        strokeDasharray: string;
    } {
        switch (connectionType) {
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
}