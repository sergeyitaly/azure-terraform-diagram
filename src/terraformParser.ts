import * as fs from 'fs';
import * as path from 'path';

// Export the interfaces that the diagram layout code expects
export interface TerraformResource {
    type: string;
    name: string;
    file: string;
    line?: number;
    attributes: Record<string, any>;
    module?: string;
    modulePath?: string;
    dependencies: string[];
    securityRules?: SecurityRule[];
    networkInfo?: NetworkInfo;
    tags?: Record<string, string>;
    resourceGroup?: string;
    hierarchyLevel?: number;
    parentResource?: string;
    childResources?: TerraformResource[];
}

export interface SecurityRule {
    name: string;
    priority?: number;
    direction?: string;
    access?: string;
    protocol?: string;
    sourcePortRange?: string;
    destinationPortRange?: string;
    sourceAddressPrefix?: string;
    destinationAddressPrefix?: string;
    description?: string;
}

export interface NetworkInfo {
    ipAddress?: string;
    addressPrefix?: string;
    subnetAddressPrefix?: string;
    publicIpAddress?: string;
    privateIpAddress?: string;
    ports?: string[];
    endpoints?: string[];
}

// Azure resource type categories (matching what the diagram expects)
export type AzureResourceCategory = 
    | 'Compute'
    | 'Networking'
    | 'Storage'
    | 'Databases'
    | 'Security'
    | 'Monitoring + Management'
    | 'General'
    | 'Analytics'
    | 'AI + Machine Learning'
    | 'Integration'
    | 'Identity'
    | 'Web'
    | 'Containers'
    | 'DevOps';

// Resource hierarchy types
export interface ResourceHierarchy {
    rootResources: TerraformResource[];
    groupedResources: Map<number, TerraformResource[]>; 
    parentChildMap: Map<string, string[]>;
    hierarchyLevels: Map<string, number>;
}

// Icon mapper for Azure resources
export class AzureIconMapper {
    private static readonly RESOURCE_MAP: Record<string, { category: AzureResourceCategory; icon: string; hierarchyLevel: number }> = {
        // Level 1: Foundation resources
        'azurerm_resource_group': { category: 'General', icon: 'resource-group', hierarchyLevel: 1 },
        'azurerm_virtual_network': { category: 'Networking', icon: 'vnet', hierarchyLevel: 1 },
        
        // Level 2: Network infrastructure
        'azurerm_subnet': { category: 'Networking', icon: 'subnet', hierarchyLevel: 2 },
        'azurerm_route_table': { category: 'Networking', icon: 'route-table', hierarchyLevel: 2 },
        'azurerm_network_security_group': { category: 'Security', icon: 'nsg', hierarchyLevel: 2 },
        'azurerm_public_ip': { category: 'Networking', icon: 'public-ip', hierarchyLevel: 2 },
        
        // Level 3: Compute resources and dependencies
        'azurerm_network_interface': { category: 'Networking', icon: 'nic', hierarchyLevel: 3 },
        'azurerm_linux_virtual_machine': { category: 'Compute', icon: 'vm', hierarchyLevel: 3 },
        'azurerm_windows_virtual_machine': { category: 'Compute', icon: 'vm', hierarchyLevel: 3 },
        'azurerm_virtual_machine': { category: 'Compute', icon: 'vm', hierarchyLevel: 3 },
        'azurerm_app_service_plan': { category: 'Web', icon: 'app-service-plan', hierarchyLevel: 3 },
        'azurerm_kubernetes_cluster': { category: 'Containers', icon: 'aks', hierarchyLevel: 3 },
        
        // Level 4: Application/services
        'azurerm_app_service': { category: 'Web', icon: 'app-service', hierarchyLevel: 4 },
        'azurerm_function_app': { category: 'Compute', icon: 'function-app', hierarchyLevel: 4 },
        'azurerm_container_group': { category: 'Containers', icon: 'container', hierarchyLevel: 4 },
        
        // Level 5: Data storage
        'azurerm_storage_account': { category: 'Storage', icon: 'storage-account', hierarchyLevel: 5 },
        'azurerm_sql_server': { category: 'Databases', icon: 'sql-server', hierarchyLevel: 5 },
        'azurerm_cosmosdb_account': { category: 'Databases', icon: 'cosmosdb', hierarchyLevel: 5 },
        'azurerm_key_vault': { category: 'Security', icon: 'key-vault', hierarchyLevel: 5 },
        
        // Level 6: Advanced services
        'azurerm_application_gateway': { category: 'Networking', icon: 'app-gateway', hierarchyLevel: 6 },
        'azurerm_firewall': { category: 'Security', icon: 'firewall', hierarchyLevel: 6 },
        'azurerm_bastion_host': { category: 'Security', icon: 'bastion', hierarchyLevel: 6 },
        'azurerm_redis_cache': { category: 'Databases', icon: 'redis', hierarchyLevel: 6 },
        
        // Monitoring & Management
        'azurerm_monitor_action_group': { category: 'Monitoring + Management', icon: 'action-group', hierarchyLevel: 7 },
        'azurerm_log_analytics_workspace': { category: 'Monitoring + Management', icon: 'log-analytics', hierarchyLevel: 7 },
        'azurerm_application_insights': { category: 'Monitoring + Management', icon: 'app-insights', hierarchyLevel: 7 },
        
        // Default fallback
        'default': { category: 'General', icon: 'resource', hierarchyLevel: 99 }
    };
    
    static getResourceInfo(resourceType: string): { category: AzureResourceCategory; icon: string; hierarchyLevel: number } {
        return this.RESOURCE_MAP[resourceType] || this.RESOURCE_MAP.default;
    }
    
    static getResourceCategory(resourceType: string): AzureResourceCategory {
        return this.getResourceInfo(resourceType).category;
    }
    
    static getResourceHierarchyLevel(resourceType: string): number {
        return this.getResourceInfo(resourceType).hierarchyLevel;
    }
}

export class TerraformParser {
    /**
     * Parse Terraform files in a workspace/folder and organize by hierarchy
     * @param workspacePath The path to scan for Terraform files
     * @param recursive Whether to scan subdirectories
     * @param organizeHierarchy Whether to organize resources by hierarchy (default: true)
     */
    async parseWorkspace(workspacePath: string, recursive: boolean = false, organizeHierarchy: boolean = true): Promise<TerraformResource[]> {
        const tfFiles = this.findTerraformFiles(workspacePath, recursive);
        const resources: TerraformResource[] = [];

        console.log(`[TerraformParser] Scanning path: ${workspacePath} (recursive: ${recursive})`);
        console.log(`[TerraformParser] Found ${tfFiles.length} Terraform files`);
        tfFiles.forEach(f => console.log(`  - ${path.relative(workspacePath, f) || f}`));

        for (const file of tfFiles) {
            try {
                const fileResources = await this.parseTerraformFile(file, workspacePath);
                resources.push(...fileResources);
                console.log(`[TerraformParser] Parsed ${fileResources.length} resources from ${path.relative(workspacePath, file)}`);
            } catch (error) {
                console.error(`Error parsing file ${file}:`, error);
            }
        }

        this.extractDependencies(resources);
        this.extractTagsAndModuleInfo(resources);
        this.extractResourceGroups(resources);

        if (organizeHierarchy) {
            this.organizeResourceHierarchy(resources);
        }

        console.log(`[TerraformParser] Total resources parsed: ${resources.length}`);
        return resources;
    }

    /**
     * Organize resources by hierarchy level and parent-child relationships
     */
    private organizeResourceHierarchy(resources: TerraformResource[]): void {
        // First, set hierarchy level based on resource type
        resources.forEach(resource => {
            resource.hierarchyLevel = AzureIconMapper.getResourceHierarchyLevel(resource.type);
        });

        // Sort resources by hierarchy level
        resources.sort((a, b) => (a.hierarchyLevel || 99) - (b.hierarchyLevel || 99));

        // Build parent-child relationships based on dependencies
        resources.forEach(resource => {
            resource.childResources = [];
        });

        // Find parent resources for each resource
        resources.forEach(resource => {
            const parent = this.findParentResource(resource, resources);
            if (parent) {
                resource.parentResource = `${parent.type}_${parent.name}`;
                if (!parent.childResources) {
                    parent.childResources = [];
                }
                parent.childResources.push(resource);
            }
        });
    }

    /**
     * Find parent resource based on dependencies and hierarchy
     */
    private findParentResource(resource: TerraformResource, allResources: TerraformResource[]): TerraformResource | undefined {
        // Resource Group is always a parent if referenced
        const rgDependency = resource.dependencies.find(dep => 
            dep.startsWith('azurerm_resource_group_')
        );
        if (rgDependency) {
            const rgName = rgDependency.replace('azurerm_resource_group_', '');
            return allResources.find(r => 
                r.type === 'azurerm_resource_group' && r.name === rgName
            );
        }

        // Check for subnet -> vnet relationship
        if (resource.type === 'azurerm_subnet') {
            const vnetMatch = resource.attributes?.virtual_network_name?.toString().match(/azurerm_virtual_network\.([^.]+)/);
            if (vnetMatch) {
                const vnetName = vnetMatch[1];
                return allResources.find(r => 
                    r.type === 'azurerm_virtual_network' && r.name === vnetName
                );
            }
        }

        // Check for NIC -> subnet relationship
        if (resource.type === 'azurerm_network_interface') {
            const subnetMatch = resource.attributes?.ip_configuration?.[0]?.subnet_id?.toString().match(/azurerm_subnet\.([^.]+)/);
            if (subnetMatch) {
                const subnetName = subnetMatch[1];
                return allResources.find(r => 
                    r.type === 'azurerm_subnet' && r.name === subnetName
                );
            }
        }

        // Check for VM -> NIC relationship
        if (resource.type.includes('virtual_machine')) {
            const nicMatch = resource.attributes?.network_interface_ids?.[0]?.toString().match(/azurerm_network_interface\.([^.]+)/);
            if (nicMatch) {
                const nicName = nicMatch[1];
                return allResources.find(r => 
                    r.type === 'azurerm_network_interface' && r.name === nicName
                );
            }
        }

        // App Service -> App Service Plan
        if (resource.type === 'azurerm_app_service') {
            const aspMatch = resource.attributes?.app_service_plan_id?.toString().match(/azurerm_app_service_plan\.([^.]+)/);
            if (aspMatch) {
                const aspName = aspMatch[1];
                return allResources.find(r => 
                    r.type === 'azurerm_app_service_plan' && r.name === aspName
                );
            }
        }

        // SQL Database -> SQL Server
        if (resource.type === 'azurerm_sql_database') {
            const serverMatch = resource.attributes?.server_name?.toString().match(/azurerm_sql_server\.([^.]+)/);
            if (serverMatch) {
                const serverName = serverMatch[1];
                return allResources.find(r => 
                    r.type === 'azurerm_sql_server' && r.name === serverName
                );
            }
        }

        return undefined;
    }

    /**
     * Extract resource group information for each resource
     */
    private extractResourceGroups(resources: TerraformResource[]): void {
        // First, find all resource groups
        const resourceGroups = new Map<string, TerraformResource>();
        resources.forEach(resource => {
            if (resource.type === 'azurerm_resource_group') {
                resourceGroups.set(resource.name, resource);
            }
        });

        // Assign resource groups to other resources
        resources.forEach(resource => {
            if (resource.type === 'azurerm_resource_group') {
                resource.resourceGroup = resource.name;
            } else {
                // Try to extract from attributes
                const rgName = this.extractResourceGroupFromAttributes(resource);
                if (rgName && resourceGroups.has(rgName)) {
                    resource.resourceGroup = rgName;
                }
            }
        });
    }

    /**
     * Extract resource group name from resource attributes
     */
    private extractResourceGroupFromAttributes(resource: TerraformResource): string | undefined {
        const attrs = resource.attributes || {};
        
        // Check direct attribute
        if (attrs.resource_group_name) {
            const rgName = attrs.resource_group_name;
            
            // Handle references like azurerm_resource_group.main.name
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

        // Check location for resource group hints
        if (attrs.location) {
            // Some resources might infer resource group from location pattern
            const location = attrs.location.toString();
            if (location.includes('-rg-')) {
                return location.split('-rg-')[1];
            }
        }

        return undefined;
    }

    /**
     * Group resources by hierarchy level
     */
    groupResourcesByHierarchy(resources: TerraformResource[]): Map<number, TerraformResource[]> {
        const grouped = new Map<number, TerraformResource[]>();
        
        resources.forEach(resource => {
            const level = resource.hierarchyLevel || 99;
            if (!grouped.has(level)) {
                grouped.set(level, []);
            }
            grouped.get(level)!.push(resource);
        });
        
        return grouped;
    }

    /**
     * Get resource hierarchy tree
     */
    getResourceHierarchy(resources: TerraformResource[]): ResourceHierarchy {
        const rootResources = resources.filter(r => !r.parentResource);
        const groupedResources = this.groupResourcesByHierarchy(resources); // This returns Map<number, TerraformResource[]>
        const parentChildMap = new Map<string, string[]>();
        const hierarchyLevels = new Map<string, number>();

        // Build parent-child map
        resources.forEach(resource => {
            const resourceId = `${resource.type}_${resource.name}`;
            hierarchyLevels.set(resourceId, resource.hierarchyLevel || 99);
            
            if (resource.parentResource) {
                if (!parentChildMap.has(resource.parentResource)) {
                    parentChildMap.set(resource.parentResource, []);
                }
                parentChildMap.get(resource.parentResource)!.push(resourceId);
            }
        });

        return {
            rootResources,
            groupedResources,
            parentChildMap,
            hierarchyLevels
        };
    }


    /**
     * Find Terraform files in a directory
     */
    private findTerraformFiles(dir: string, recursive: boolean = false): string[] {
        const files: string[] = [];
        const ignoredDirs = ['.terraform', '.git', 'node_modules', 'dist', 'build', 'target', 'k8s-manifests', 'application'];

        const isInsideModules = (dirPath: string): boolean => {
            const parts = dirPath.split(path.sep);
            return parts.includes('modules');
        };

        const scanDirectory = (currentDir: string, isModulesDir: boolean = false) => {
            try {
                const items = fs.readdirSync(currentDir, { withFileTypes: true });

                for (const item of items) {
                    if (item.name.startsWith('.')) {
                        continue;
                    }

                    const fullPath = path.join(currentDir, item.name);

                    if (item.isDirectory()) {
                        if (ignoredDirs.includes(item.name)) {
                            continue;
                        }

                        if (item.name === 'modules') {
                            scanDirectory(fullPath, true);
                        } else if (isModulesDir || isInsideModules(currentDir)) {
                            scanDirectory(fullPath, true);
                        } else if (recursive) {
                            scanDirectory(fullPath, false);
                        }
                    } else if (item.isFile()) {
                        const isTerraformFile =
                            item.name.endsWith('.tf') ||
                            item.name.endsWith('.tf.json');

                        const isTfVars = item.name === 'terraform.tfvars' || item.name.endsWith('.tfvars');

                        if (isTerraformFile) {
                            files.push(fullPath);
                        } else if (isTfVars && !isModulesDir && !isInsideModules(currentDir)) {
                            files.push(fullPath);
                        }
                    }
                }
            } catch (error) {
                console.error(`Error scanning directory ${currentDir}:`, error);
            }
        };

        scanDirectory(dir, false);
        return files;
    }
    
    private async parseTerraformFile(filePath: string, workspacePath: string): Promise<TerraformResource[]> {
        const resources: TerraformResource[] = [];
        
        try {
            const content = await fs.promises.readFile(filePath, 'utf8');
            const lines = content.split('\n');
            
            const moduleStack: string[] = [];
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmed = line.trim();
                
                // Check for module block start
                const moduleStartMatch = trimmed.match(/^\s*module\s+"([^"]+)"\s*{/);
                if (moduleStartMatch) {
                    moduleStack.push(moduleStartMatch[1]);
                    continue;
                }
                
                // Check for closing brace that might end a module
                if (trimmed === '}' && moduleStack.length > 0) {
                    moduleStack.pop();
                    continue;
                }
                
                // Match Azure resource definitions
                const resourceMatch = trimmed.match(/^\s*resource\s+"(azurerm_[^"]+)"\s+"([^"]+)"\s*{/);
                if (resourceMatch) {
                    const [, type, name] = resourceMatch;
                    
                    // Parse the entire resource block
                    const parseResult = await this.parseResourceBlock(lines, i, type);
                    
                    const resource: TerraformResource = {
                        type,
                        name,
                        file: path.relative(workspacePath, filePath),
                        line: i + 1,
                        attributes: parseResult.attributes,
                        module: moduleStack.length > 0 ? moduleStack[moduleStack.length - 1] : undefined,
                        modulePath: moduleStack.length > 0 ? moduleStack.join('.') : undefined,
                        dependencies: [],
                        securityRules: parseResult.securityRules,
                        networkInfo: parseResult.networkInfo,
                        tags: parseResult.tags,
                        resourceGroup: undefined,
                        hierarchyLevel: AzureIconMapper.getResourceHierarchyLevel(type),
                        parentResource: undefined,
                        childResources: []
                    };
                    
                    resources.push(resource);
                    
                    i = parseResult.endLine;
                    continue;
                }
                
                // Match module calls (without block)
                const moduleCallMatch = trimmed.match(/^\s*module\s+"([^"]+)"/);
                if (moduleCallMatch && !trimmed.includes('{') && !trimmed.includes('=')) {
                    const moduleResource: TerraformResource = {
                        type: 'module',
                        name: moduleCallMatch[1],
                        file: path.relative(workspacePath, filePath),
                        line: i + 1,
                        attributes: {},
                        module: moduleStack.length > 0 ? moduleStack[moduleStack.length - 1] : undefined,
                        modulePath: moduleStack.length > 0 ? moduleStack.join('.') : undefined,
                        dependencies: [],
                        securityRules: [],
                        networkInfo: {},
                        tags: {}
                    };
                    resources.push(moduleResource);
                }
                
                // Match data sources
                const dataMatch = trimmed.match(/^\s*data\s+"([^"]+)"\s+"([^"]+)"\s*{/);
                if (dataMatch) {
                    const [, type, name] = dataMatch;
                    
                    const parseResult = await this.parseResourceBlock(lines, i, type);
                    
                    const resource: TerraformResource = {
                        type: `data.${type}`,
                        name,
                        file: path.relative(workspacePath, filePath),
                        line: i + 1,
                        attributes: parseResult.attributes,
                        module: moduleStack.length > 0 ? moduleStack[moduleStack.length - 1] : undefined,
                        modulePath: moduleStack.length > 0 ? moduleStack.join('.') : undefined,
                        dependencies: [],
                        securityRules: [],
                        networkInfo: {},
                        tags: parseResult.tags
                    };
                    
                    resources.push(resource);
                    
                    i = parseResult.endLine;
                }
            }
        } catch (error) {
            console.error(`Error parsing file ${filePath}:`, error);
        }
        
        return resources;
    }
    
    private async parseResourceBlock(lines: string[], startLine: number, resourceType: string): Promise<any> {
        const attributes: Record<string, any> = {};
        let securityRules: SecurityRule[] = [];
        let networkInfo: NetworkInfo = {};
        let tags: Record<string, string> = {};
        let braceCount = 0;
        let inBlock = false;
        let endLine = startLine;
        
        for (let i = startLine; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            
            if (!inBlock) {
                if (trimmed.includes('{')) {
                    inBlock = true;
                    braceCount = 1;
                    continue;
                }
                continue;
            }
            
            const openBraces = (line.match(/{/g) || []).length;
            const closeBraces = (line.match(/}/g) || []).length;
            braceCount += openBraces - closeBraces;
            
            if (braceCount > 0) {
                const attrMatch = trimmed.match(/^\s*([a-zA-Z0-9_-]+)\s*=\s*(.+)$/);
                if (attrMatch) {
                    const key = attrMatch[1];
                    let value = attrMatch[2].trim();
                    
                    value = value.replace(/#.*$/, '').trim();
                    
                    // Handle tags attribute specially
                    if (key === 'tags' && resourceType.includes('azurerm_')) {
                        const parsedTags = this.parseTagsValue(value, lines, i);
                        if (parsedTags) {
                            tags = parsedTags;
                        }
                    }
                    
                    if (value === '<<EOF' || value === '<<-EOF' || value === '<<EOT' || value === '<<-EOT') {
                        const heredocResult = this.parseHeredoc(lines, i, value);
                        attributes[key] = heredocResult.value;
                        i = heredocResult.endLine;
                    } else {
                        attributes[key] = this.parseAttributeValue(value, lines, i);
                    }
                    
                    if (resourceType === 'azurerm_network_security_group' && key === 'security_rule') {
                        securityRules = await this.extractSecurityRules(lines, i);
                    }
                    
                    networkInfo = this.extractResourceSpecificInfo(resourceType, attributes);
                }
            }
            
            if (braceCount === 0) {
                endLine = i;
                break;
            }
        }
        
        return { attributes, securityRules, networkInfo, tags, endLine };
    }
    
    private parseTagsValue(value: string, lines: string[], currentLine: number): Record<string, string> | undefined {
        const tags: Record<string, string> = {};
        
        try {
            // Handle simple map format: tags = { key = "value", key2 = "value2" }
            if (value.startsWith('{') && value.includes('=')) {
                const mapContent = value.slice(1).trim();
                // Simple parser for tag maps
                const pairs = mapContent.split(',').map(pair => pair.trim());
                pairs.forEach(pair => {
                    const [key, ...rest] = pair.split('=').map(s => s.trim().replace(/["']/g, ''));
                    if (key && rest.length > 0) {
                        tags[key] = rest.join('=').replace(/["']/g, '').replace(/}$/, '').trim();
                    }
                });
            }
            // Handle variable references: tags = var.tags
            else if (value.startsWith('var.')) {
                tags['_source'] = value;
            }
            // Handle local references: tags = local.tags
            else if (value.startsWith('local.')) {
                tags['_source'] = value;
            }
        } catch (error) {
            console.warn(`Failed to parse tags: ${value}`, error);
        }
        
        return Object.keys(tags).length > 0 ? tags : undefined;
    }
    
    private extractTagsAndModuleInfo(resources: TerraformResource[]): void {
        resources.forEach(resource => {
            // If tags weren't extracted during parsing, try to extract them from attributes
            if (!resource.tags && resource.attributes?.tags) {
                resource.tags = this.extractTagsFromAttributes(resource.attributes.tags);
            }
            
            // Ensure module property is set from file path
            if (!resource.module && resource.file) {
                const normalizedPath = resource.file.replace(/\\/g, '/');
                if (normalizedPath.includes('/modules/') || normalizedPath.startsWith('modules/')) {
                    const parts = normalizedPath.split('/');
                    const moduleIndex = parts.indexOf('modules');
                    if (moduleIndex > -1 && parts.length > moduleIndex + 1) {
                        resource.module = parts[moduleIndex + 1];
                    }
                }
            }
            
            // Extract environment from tags if available
            if (resource.tags?.environment) {
                // Environment is already in tags
            } else if (resource.attributes?.environment) {
                if (!resource.tags) resource.tags = {};
                resource.tags.environment = resource.attributes.environment.toString();
            }
        });
    }
    
    private extractTagsFromAttributes(tagsAttr: any): Record<string, string> | undefined {
        const tags: Record<string, string> = {};
        
        if (typeof tagsAttr === 'object' && tagsAttr !== null) {
            Object.entries(tagsAttr).forEach(([key, value]) => {
                if (typeof value === 'string') {
                    tags[key] = value;
                } else if (value !== null && value !== undefined) {
                    tags[key] = String(value);
                }
            });
        }
        
        return Object.keys(tags).length > 0 ? tags : undefined;
    }
    
    private parseAttributeValue(value: string, lines: string[], currentLine: number): any {
        if (!value || value === '') {
            return '';
        }
        
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
            return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'");
        }
        
        if (value === '<<EOF' || value === '<<-EOF' || value === '<<EOT' || value === '<<-EOT') {
            const heredocResult = this.parseHeredoc(lines, currentLine, value);
            return heredocResult.value;
        }
        
        if (value === 'true' || value === 'false') {
            return value === 'true';
        }
        
        if (value === 'null') {
            return null;
        }
        
        if (!isNaN(Number(value)) && value.trim() !== '') {
            return Number(value);
        }
        
        if (value.startsWith('[')) {
            try {
                if (value.endsWith(']')) {
                    const listContent = value.slice(1, -1).trim();
                    if (!listContent) {
                        return [];
                    }
                    const items = listContent.split(',').map(item => item.trim());
                    return items.map(item => this.parseAttributeValue(item, lines, currentLine));
                }
            } catch {
                return value;
            }
        }
        
        if (value.startsWith('{')) {
            try {
                if (value.endsWith('}')) {
                    const mapContent = value.slice(1, -1).trim();
                    if (!mapContent) {
                        return {};
                    }
                    const map: Record<string, any> = {};
                    const pairs = mapContent.split(',').map(pair => pair.trim());
                    pairs.forEach(pair => {
                        const [key, ...rest] = pair.split('=').map(s => s.trim());
                        if (key && rest.length > 0) {
                            map[key] = this.parseAttributeValue(rest.join('='), lines, currentLine);
                        }
                    });
                    return map;
                }
            } catch {
                return value;
            }
        }
        
        const functionMatch = value.match(/^\s*(\$?\{[^}]+\})\s*$/);
        if (functionMatch) {
            return functionMatch[1];
        }
        
        return value;
    }
    
    private parseHeredoc(lines: string[], startLine: number, marker: string): { value: string; endLine: number } {
        const endMarker = marker.substring(2);
        let heredocContent = '';
        let endLine = startLine;
        
        for (let i = startLine + 1; i < lines.length; i++) {
            const line = lines[i];
            if (line.trim() === endMarker) {
                endLine = i;
                break;
            }
            heredocContent += line + '\n';
        }
        
        return { value: heredocContent.trim(), endLine };
    }
    
    private async extractSecurityRules(lines: string[], startLine: number): Promise<SecurityRule[]> {
        const rules: SecurityRule[] = [];
        let currentRule: Partial<SecurityRule> = {};
        let inRuleBlock = false;
        let ruleBraceCount = 0;
        
        for (let i = startLine; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            
            if (!inRuleBlock && trimmed.includes('{')) {
                inRuleBlock = true;
                ruleBraceCount = 1;
                continue;
            }
            
            if (inRuleBlock) {
                const openBraces = (line.match(/{/g) || []).length;
                const closeBraces = (line.match(/}/g) || []).length;
                ruleBraceCount += openBraces - closeBraces;
                
                if (ruleBraceCount > 0) {
                    const attrMatch = trimmed.match(/^\s*([a-zA-Z0-9_]+)\s*=\s*(.+)$/);
                    if (attrMatch) {
                        const key = attrMatch[1];
                        let value = attrMatch[2].trim();
                        value = value.replace(/#.*$/, '').trim();
                        
                        switch (key) {
                            case 'name': currentRule.name = this.parseAttributeValue(value, lines, i); break;
                            case 'priority': currentRule.priority = this.parseAttributeValue(value, lines, i); break;
                            case 'direction': currentRule.direction = this.parseAttributeValue(value, lines, i); break;
                            case 'access': currentRule.access = this.parseAttributeValue(value, lines, i); break;
                            case 'protocol': currentRule.protocol = this.parseAttributeValue(value, lines, i); break;
                            case 'source_port_range': currentRule.sourcePortRange = this.parseAttributeValue(value, lines, i); break;
                            case 'destination_port_range': currentRule.destinationPortRange = this.parseAttributeValue(value, lines, i); break;
                            case 'source_address_prefix': currentRule.sourceAddressPrefix = this.parseAttributeValue(value, lines, i); break;
                            case 'destination_address_prefix': currentRule.destinationAddressPrefix = this.parseAttributeValue(value, lines, i); break;
                        }
                    }
                }
                
                if (ruleBraceCount === 0) {
                    if (currentRule.name) {
                        rules.push(currentRule as SecurityRule);
                    }
                    currentRule = {};
                    inRuleBlock = false;
                }
            }
        }
        
        return rules;
    }
    
    private extractResourceSpecificInfo(resourceType: string, attributes: Record<string, any>): NetworkInfo {
        const info: NetworkInfo = {};
        
        switch (resourceType) {
            case 'azurerm_network_interface':
                return this.extractNetworkInterfaceInfo(attributes);
            case 'azurerm_public_ip':
                return this.extractPublicIpInfo(attributes);
            case 'azurerm_subnet':
                return this.extractSubnetInfo(attributes);
            case 'azurerm_virtual_machine':
                return this.extractVirtualMachineInfo(attributes);
            case 'azurerm_kubernetes_cluster':
                return this.extractKubernetesClusterInfo(attributes);
            case 'azurerm_container_group':
                return this.extractContainerGroupInfo(attributes);
            default:
                return info;
        }
    }
    
    private extractNetworkInterfaceInfo(attributes: Record<string, any>): NetworkInfo {
        const info: NetworkInfo = {};
        
        try {
            if (attributes.ip_configuration) {
                let ipConfigs = attributes.ip_configuration;
                if (!Array.isArray(ipConfigs)) {
                    ipConfigs = [ipConfigs];
                }
                
                const ipConfig = ipConfigs[0];
                if (ipConfig) {
                    if (ipConfig.private_ip_address) {
                        info.privateIpAddress = ipConfig.private_ip_address;
                    }
                    
                    if (ipConfig.public_ip_address_id) {
                        const match = ipConfig.public_ip_address_id.toString().match(/azurerm_public_ip\.([^.]+)/);
                        if (match) {
                            info.publicIpAddress = `ref:${match[1]}`;
                        }
                    }
                    
                    if (ipConfig.subnet_id) {
                        const subnetMatch = ipConfig.subnet_id.toString().match(/azurerm_subnet\.([^.]+)/);
                        if (subnetMatch) {
                            info.subnetAddressPrefix = `ref:${subnetMatch[1]}`;
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error extracting network interface info:', error);
        }
        
        return info;
    }
    
    private extractPublicIpInfo(attributes: Record<string, any>): NetworkInfo {
        const info: NetworkInfo = {};
        
        try {
            if (attributes.ip_address) {
                info.ipAddress = attributes.ip_address.toString();
            }
            
            if (attributes.allocation_method) {
                info.publicIpAddress = attributes.allocation_method.toString();
            }
            
            if (attributes.sku) {
                info.publicIpAddress = `${info.publicIpAddress || 'IP'} (${attributes.sku})`;
            }
        } catch (error) {
            console.error('Error extracting public IP info:', error);
        }
        
        return info;
    }
    
    private extractSubnetInfo(attributes: Record<string, any>): NetworkInfo {
        const info: NetworkInfo = {};
        
        try {
            if (attributes.address_prefixes) {
                const prefixes = Array.isArray(attributes.address_prefixes) 
                    ? attributes.address_prefixes 
                    : [attributes.address_prefixes];
                info.addressPrefix = prefixes.join(', ');
            } else if (attributes.address_prefix) {
                info.addressPrefix = attributes.address_prefix.toString();
            }
            
            if (attributes.virtual_network_name) {
                info.addressPrefix = `${info.addressPrefix || 'Subnet'} in ${attributes.virtual_network_name}`;
            }
        } catch (error) {
            console.error('Error extracting subnet info:', error);
        }
        
        return info;
    }
    
    private extractVirtualMachineInfo(attributes: Record<string, any>): NetworkInfo {
        const info: NetworkInfo = {};
        
        try {
            if (attributes.network_interface_ids) {
                const interfaces = Array.isArray(attributes.network_interface_ids)
                    ? attributes.network_interface_ids
                    : [attributes.network_interface_ids];
                
                info.endpoints = interfaces.map((iface: string) => {
                    const match = iface.toString().match(/azurerm_network_interface\.([^.]+)/);
                    return match ? `ref:${match[1]}` : iface;
                });
            }
            
            if (attributes.size) {
                info.ports = [`VM Size: ${attributes.size}`];
            }
        } catch (error) {
            console.error('Error extracting VM info:', error);
        }
        
        return info;
    }
    
    private extractKubernetesClusterInfo(attributes: Record<string, any>): NetworkInfo {
        const info: NetworkInfo = {};
        
        try {
            if (attributes.network_profile && attributes.network_profile.network_plugin) {
                info.addressPrefix = `Network: ${attributes.network_profile.network_plugin}`;
            }
            
            if (attributes.private_cluster_enabled === true) {
                info.endpoints = ['Private Cluster'];
            }
            
            if (attributes.api_server_authorized_ip_ranges) {
                info.endpoints = [
                    ...(info.endpoints || []),
                    `Authorized IPs: ${Array.isArray(attributes.api_server_authorized_ip_ranges) 
                        ? attributes.api_server_authorized_ip_ranges.length 
                        : 'N/A'}`
                ];
            }
        } catch (error) {
            console.error('Error extracting AKS cluster info:', error);
        }
        
        return info;
    }
    
    private extractContainerGroupInfo(attributes: Record<string, any>): NetworkInfo {
        const info: NetworkInfo = {};
        
        try {
            if (attributes.ip_address_type) {
                info.publicIpAddress = attributes.ip_address_type;
            }
            
            if (attributes.ip_address) {
                info.ipAddress = attributes.ip_address.toString();
            }
            
            if (attributes.exposed_port) {
                const ports = Array.isArray(attributes.exposed_port)
                    ? attributes.exposed_port.map((p: any) => p.port?.toString() || 'N/A')
                    : [attributes.exposed_port.port?.toString() || 'N/A'];
                info.ports = ports;
            } else if (attributes.ports) {
                info.ports = attributes.ports.map((p: any) => p.port?.toString() || 'N/A');
            }
        } catch (error) {
            console.error('Error extracting container group info:', error);
        }
        
        return info;
    }
    
    private extractDependencies(resources: TerraformResource[]) {
        const resourceMap = new Map<string, TerraformResource>();
        resources.forEach(resource => {
            resourceMap.set(`${resource.type}_${resource.name}`, resource);
        });
        
        resources.forEach(resource => {
            const deps: string[] = [];
            
            const extractRefsFromValue = (value: any): string[] => {
                const refs: string[] = [];
                
                if (typeof value === 'string') {
                    const resourceRefs = value.matchAll(/(azurerm_\w+)\.([^.]+)(?:\.[^.]+)*/g);
                    for (const match of resourceRefs) {
                        const [, refType, refName] = match;
                        refs.push(`${refType}_${refName}`);
                    }
                    
                    const moduleRefs = value.matchAll(/module\.([^.]+)(?:\.[^.]+)*/g);
                    for (const match of moduleRefs) {
                        const [, moduleName] = match;
                        refs.push(`module_${moduleName}`);
                    }
                    
                    const dataRefs = value.matchAll(/data\.([^.]+)\.([^.]+)(?:\.[^.]+)*/g);
                    for (const match of dataRefs) {
                        const [, dataType, dataName] = match;
                        refs.push(`data.${dataType}_${dataName}`);
                    }
                    
                    const varRefs = value.matchAll(/var\.([^.]+)/g);
                    for (const match of varRefs) {
                        const [, varName] = match;
                        refs.push(`var_${varName}`);
                    }
                    
                    const localRefs = value.matchAll(/local\.([^.]+)/g);
                    for (const match of localRefs) {
                        const [, localName] = match;
                        refs.push(`local_${localName}`);
                    }
                } else if (Array.isArray(value)) {
                    value.forEach(item => {
                        refs.push(...extractRefsFromValue(item));
                    });
                } else if (value && typeof value === 'object') {
                    Object.values(value).forEach(item => {
                        refs.push(...extractRefsFromValue(item));
                    });
                }
                
                return refs;
            };
            
            Object.values(resource.attributes).forEach(value => {
                deps.push(...extractRefsFromValue(value));
            });
            
            resource.dependencies = [...new Set(deps)].filter(dep => 
                dep !== `${resource.type}_${resource.name}`
            );
        });
        
        this.extractImplicitDependencies(resources);
    }
    
    private extractImplicitDependencies(resources: TerraformResource[]) {
        const resourcesByFile = new Map<string, TerraformResource[]>();
        resources.forEach(resource => {
            if (!resourcesByFile.has(resource.file)) {
                resourcesByFile.set(resource.file, []);
            }
            resourcesByFile.get(resource.file)!.push(resource);
        });
        
        resourcesByFile.forEach(fileResources => {
            fileResources.sort((a, b) => (a.line || 0) - (b.line || 0));
            
            for (let i = 0; i < fileResources.length; i++) {
                for (let j = i + 1; j < fileResources.length; j++) {
                    if (fileResources[j].name.includes(fileResources[i].name)) {
                        const depId = `${fileResources[i].type}_${fileResources[i].name}`;
                        if (!fileResources[j].dependencies.includes(depId)) {
                            fileResources[j].dependencies.push(depId);
                        }
                    }
                }
            }
        });
    }

    async parseTerraformState(stateFilePath: string): Promise<TerraformResource[]> {
        try {
            const content = await fs.promises.readFile(stateFilePath, 'utf8');
            const state = JSON.parse(content);
            const resources: TerraformResource[] = [];
            
            if (state.resources) {
                state.resources.forEach((stateResource: any) => {
                    if (stateResource.type.startsWith('azurerm_')) {
                        stateResource.instances?.forEach((instance: any) => {
                            const resource: TerraformResource = {
                                type: stateResource.type,
                                name: stateResource.name,
                                file: stateFilePath,
                                attributes: instance.attributes || {},
                                module: stateResource.module || undefined,
                                modulePath: stateResource.module || undefined,
                                dependencies: [],
                                securityRules: [],
                                networkInfo: {},
                                tags: instance.attributes?.tags || {},
                                resourceGroup: this.extractResourceGroupFromState(instance.attributes),
                                hierarchyLevel: AzureIconMapper.getResourceHierarchyLevel(stateResource.type),
                                parentResource: undefined,
                                childResources: []
                            };
                            
                            resources.push(resource);
                        });
                    }
                });
            }
            
            return resources;
        } catch (error) {
            console.error(`Error parsing state file ${stateFilePath}:`, error);
            return [];
        }
    }

    private extractResourceGroupFromState(attributes: any): string | undefined {
        if (attributes?.resource_group_name) {
            return attributes.resource_group_name;
        }
        
        // Extract from ID if available
        if (attributes?.id) {
            const id = attributes.id.toString();
            const match = id.match(/resourceGroups\/([^\/]+)\//);
            if (match) {
                return match[1];
            }
        }
        
        return undefined;
    }
    
    getResourceTypes(resources: TerraformResource[]): Set<string> {
        return new Set(resources.map(r => r.type));
    }
    
    getResourcesByType(resources: TerraformResource[]): Map<string, TerraformResource[]> {
        const map = new Map<string, TerraformResource[]>();
        
        resources.forEach(resource => {
            if (!map.has(resource.type)) {
                map.set(resource.type, []);
            }
            map.get(resource.type)!.push(resource);
        });
        
        return map;
    }
    
    getResourcesByModule(resources: TerraformResource[]): Map<string, TerraformResource[]> {
        const map = new Map<string, TerraformResource[]>();
        
        resources.forEach(resource => {
            const moduleKey = resource.module || 'root';
            if (!map.has(moduleKey)) {
                map.set(moduleKey, []);
            }
            map.get(moduleKey)!.push(resource);
        });
        
        return map;
    }
    
    getResourcesByEnvironment(resources: TerraformResource[]): Map<string, TerraformResource[]> {
        const map = new Map<string, TerraformResource[]>();
        
        resources.forEach(resource => {
            const env = resource.tags?.environment || resource.tags?.env || 'unknown';
            if (!map.has(env)) {
                map.set(env, []);
            }
            map.get(env)!.push(resource);
        });
        
        return map;
    }
    
    getResourcesByResourceGroup(resources: TerraformResource[]): Map<string, TerraformResource[]> {
        const map = new Map<string, TerraformResource[]>();
        
        resources.forEach(resource => {
            const rg = resource.resourceGroup || 'default';
            if (!map.has(rg)) {
                map.set(rg, []);
            }
            map.get(rg)!.push(resource);
        });
        
        return map;
    }
    
    getResourcesByHierarchyLevel(resources: TerraformResource[]): Map<number, TerraformResource[]> {
        const map = new Map<number, TerraformResource[]>();
        
        resources.forEach(resource => {
            const level = resource.hierarchyLevel || 99;
            if (!map.has(level)) {
                map.set(level, []);
            }
            map.get(level)!.push(resource);
        });
        
        return map;
    }

    /**
     * Get hierarchical tree of resources
     */
    getHierarchicalTree(resources: TerraformResource[]): {
        rootResources: TerraformResource[];
        nestedTree: Map<string, TerraformResource[]>;
    } {
        const rootResources = resources.filter(r => !r.parentResource);
        const nestedTree = new Map<string, TerraformResource[]>();

        resources.forEach(resource => {
            if (resource.parentResource) {
                if (!nestedTree.has(resource.parentResource)) {
                    nestedTree.set(resource.parentResource, []);
                }
                nestedTree.get(resource.parentResource)!.push(resource);
            }
        });

        return { rootResources, nestedTree };
    }

    /**
     * Generate hierarchy summary for reporting
     */
    generateHierarchySummary(resources: TerraformResource[]): {
        levels: Map<number, { count: number; types: string[] }>;
        resourceGroups: Map<string, number>;
        rootResources: number;
        leafResources: number;
        maxDepth: number;
    } {
        const levels = new Map<number, { count: number; types: string[] }>();
        const resourceGroups = new Map<string, number>();
        let rootResources = 0;
        let leafResources = 0;
        let maxDepth = 0;

        // Count resources by hierarchy level
        resources.forEach(resource => {
            const level = resource.hierarchyLevel || 99;
            if (!levels.has(level)) {
                levels.set(level, { count: 0, types: [] });
            }
            const levelInfo = levels.get(level)!;
            levelInfo.count++;
            if (!levelInfo.types.includes(resource.type)) {
                levelInfo.types.push(resource.type);
            }

            // Count by resource group
            const rg = resource.resourceGroup || 'default';
            resourceGroups.set(rg, (resourceGroups.get(rg) || 0) + 1);

            // Count root and leaf resources
            if (!resource.parentResource) rootResources++;
            if (!resource.childResources || resource.childResources.length === 0) leafResources++;

            // Track max depth
            maxDepth = Math.max(maxDepth, level);
        });

        return { levels, resourceGroups, rootResources, leafResources, maxDepth };
    }
}