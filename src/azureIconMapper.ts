// AzureIconMapper.ts
import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from 'fs';

export interface AzureResourceInfo {
    displayName: string;
    category: AzureResourceCategory;
    iconFileName: string; // e.g., "10021-icon-service-Virtual-Machine.svg"
    color?: string; // Optional: for category-based coloring
    icon: string; 
}

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

    export class AzureIconMapper {
        private static readonly resourceMappings: Record<string, AzureResourceInfo> = {
            // Compute
            'azurerm_virtual_machine': { 
                displayName: 'Virtual Machine', 
                category: 'Compute', 
                iconFileName: '10021-icon-service-Virtual-Machine.svg',
                icon: 'virtual-machine'
            },
            'azurerm_linux_virtual_machine': { 
                displayName: 'Linux Virtual Machine', 
                category: 'Compute', 
                iconFileName: '10021-icon-service-Virtual-Machine.svg', // Same as VM
                icon: 'linux-vm'
            },
            'azurerm_windows_virtual_machine': { 
                displayName: 'Windows Virtual Machine', 
                category: 'Compute', 
                iconFileName: '10021-icon-service-Virtual-Machine.svg', // Same as VM
                icon: 'windows-vm'
            },
            'azurerm_virtual_machine_scale_set': { 
                displayName: 'Virtual Machine Scale Set', 
                category: 'Compute', 
                iconFileName: '10034-icon-service-VM-Scale-Sets.svg',
                icon: 'vm-scale-set'
            },
            'azurerm_app_service': { 
                displayName: 'App Service', 
                category: 'Compute', 
                iconFileName: '10035-icon-service-App-Services.svg',
                icon: 'app-service'
            },
            'azurerm_app_service_plan': { 
                displayName: 'App Service Plan', 
                category: 'Compute', 
                iconFileName: '00046-icon-service-App-Service-Plans.svg',
                icon: 'app-service-plan'
            },
            'azurerm_function_app': { 
                displayName: 'Function App', 
                category: 'Compute', 
                iconFileName: '10029-icon-service-Function-Apps.svg',
                icon: 'function-app'
            },
            'azurerm_static_site': { 
                displayName: 'Static Web App', 
                category: 'Compute', 
                iconFileName: '01007-icon-service-Static-Apps.svg',
                icon: 'static-web-app'
            },
            
            // Networking
            'azurerm_virtual_network': { 
                displayName: 'Virtual Network', 
                category: 'Networking', 
                iconFileName: '10061-icon-service-Virtual-Networks.svg',
                icon: 'virtual-network'
            },
            'azurerm_subnet': {
                displayName: 'Subnet',
                category: 'Networking',
                iconFileName: '02742-icon-service-Subnet.svg',
                icon: 'subnet'
            },
            'azurerm_network_interface': {
                displayName: 'Network Interface',
                category: 'Networking',
                iconFileName: '10080-icon-service-Network-Interfaces.svg',
                icon: 'network-interface'
            },
            'azurerm_public_ip': { 
                displayName: 'Public IP Address', 
                category: 'Networking', 
                iconFileName: '10069-icon-service-Public-IP-Addresses.svg',
                icon: 'public-ip'
            },
            'azurerm_network_security_group': { 
                displayName: 'Network Security Group', 
                category: 'Networking', 
                iconFileName: '10067-icon-service-Network-Security-Groups.svg',
                icon: 'nsg'
            },
            'azurerm_application_gateway': { 
                displayName: 'Application Gateway', 
                category: 'Networking', 
                iconFileName: '10076-icon-service-Application-Gateways.svg',
                icon: 'application-gateway'
            },
            'azurerm_frontdoor': { 
                displayName: 'Front Door', 
                category: 'Networking', 
                iconFileName: '10073-icon-service-Front-Door-and-CDN-Profiles.svg',
                icon: 'front-door'
            },
            'azurerm_firewall': { 
                displayName: 'Firewall', 
                category: 'Networking', 
                iconFileName: '10084-icon-service-Firewalls.svg',
                icon: 'firewall'
            },
            'azurerm_route_table': { 
                displayName: 'Route Table', 
                category: 'Networking', 
                iconFileName: '10082-icon-service-Route-Tables.svg',
                icon: 'route-table'
            },
            'azurerm_local_network_gateway': { 
                displayName: 'Local Network Gateway', 
                category: 'Networking', 
                iconFileName: '10077-icon-service-Local-Network-Gateways.svg',
                icon: 'local-network-gateway'
            },
            'azurerm_virtual_network_gateway': { 
                displayName: 'Virtual Network Gateway', 
                category: 'Networking', 
                iconFileName: '10063-icon-service-Virtual-Network-Gateways.svg',
                icon: 'vpn-gateway'
            },
            'azurerm_nat_gateway': { 
                displayName: 'NAT Gateway', 
                category: 'Networking', 
                iconFileName: '10310-icon-service-NAT.svg',
                icon: 'nat-gateway'
            },
            'azurerm_bastion_host': { 
                displayName: 'Bastion Host', 
                category: 'Networking', 
                iconFileName: '02422-icon-service-Bastions.svg',
                icon: 'bastion'
            },
            
            // Storage
            'azurerm_storage_account': { 
                displayName: 'Storage Account', 
                category: 'Storage', 
                iconFileName: '10086-icon-service-Storage-Accounts.svg',
                icon: 'storage-account'
            },
            'azurerm_storage_container': { 
                displayName: 'Blob Container', 
                category: 'Storage', 
                iconFileName: '10839-icon-service-Storage-Container.svg',
                icon: 'blob-storage'
            },
            'azurerm_storage_share': { 
                displayName: 'File Share', 
                category: 'Storage', 
                iconFileName: '10400-icon-service-Azure-Fileshares.svg',
                icon: 'file-share'
            },
            'azurerm_storage_queue': { 
                displayName: 'Queue Storage', 
                category: 'Storage', 
                iconFileName: '10840-icon-service-Storage-Queue.svg',
                icon: 'queue-storage'
            },
            'azurerm_storage_table': { 
                displayName: 'Table Storage', 
                category: 'Storage', 
                iconFileName: '10041-icon-service-Table-Storage.svg',
                icon: 'table-storage'
            },
            
            // Databases
            'azurerm_sql_server': { 
                displayName: 'SQL Server', 
                category: 'Databases', 
                iconFileName: '10132-icon-service-SQL-Server.svg',
                icon: 'sql-server'
            },
            'azurerm_sql_database': { 
                displayName: 'SQL Database', 
                category: 'Databases', 
                iconFileName: '10130-icon-service-SQL-Database.svg',
                icon: 'sql-database'
            },
            'azurerm_cosmosdb_account': { 
                displayName: 'Azure Cosmos DB', 
                category: 'Databases', 
                iconFileName: '10121-icon-service-Azure-Cosmos-DB.svg',
                icon: 'cosmos-db'
            },
            'azurerm_mysql_server': { 
                displayName: 'MySQL Server', 
                category: 'Databases', 
                iconFileName: '10122-icon-service-Azure-Database-MySQL-Server.svg',
                icon: 'mysql'
            },
            'azurerm_postgresql_server': { 
                displayName: 'PostgreSQL Server', 
                category: 'Databases', 
                iconFileName: '10131-icon-service-Azure-Database-PostgreSQL-Server.svg',
                icon: 'postgresql'
            },
            'azurerm_redis_cache': { 
                displayName: 'Redis Cache', 
                category: 'Databases', 
                iconFileName: '10137-icon-service-Cache-Redis.svg',
                icon: 'redis-cache'
            },
            
            // Security
            'azurerm_key_vault': { 
                displayName: 'Key Vault', 
                category: 'Security', 
                iconFileName: '10245-icon-service-Key-Vaults.svg',
                icon: 'key-vault'
            },
            'azurerm_security_center_subscription_pricing': { 
                displayName: 'Security Center', 
                category: 'Security', 
                iconFileName: '10241-icon-service-Microsoft-Defender-for-Cloud.svg',
                icon: 'security-center'
            },
            
            // Monitoring + Management
            'azurerm_monitor_action_group': { 
                displayName: 'Action Group', 
                category: 'Monitoring + Management', 
                iconFileName: '00002-icon-service-Alerts.svg',
                icon: 'action-group'
            },
            'azurerm_log_analytics_workspace': { 
                displayName: 'Log Analytics Workspace', 
                category: 'Monitoring + Management', 
                iconFileName: '00009-icon-service-Log-Analytics-Workspaces.svg',
                icon: 'log-analytics'
            },
            'azurerm_application_insights': { 
                displayName: 'Application Insights', 
                category: 'Monitoring + Management', 
                iconFileName: '00012-icon-service-Application-Insights.svg',
                icon: 'application-insights'
            },
            'azurerm_automation_account': { 
                displayName: 'Automation Account', 
                category: 'Monitoring + Management', 
                iconFileName: '00022-icon-service-Automation-Accounts.svg',
                icon: 'automation'
            },
            
            // Containers
            'azurerm_kubernetes_cluster': { 
                displayName: 'Azure Kubernetes Service', 
                category: 'Containers', 
                iconFileName: '10023-icon-service-Kubernetes-Services.svg',
                icon: 'aks'
            },
            'azurerm_container_registry': { 
                displayName: 'Container Registry', 
                category: 'Containers', 
                iconFileName: '10105-icon-service-Container-Registries.svg',
                icon: 'container-registry'
            },
            'azurerm_container_group': { 
                displayName: 'Container Instance', 
                category: 'Containers', 
                iconFileName: '10104-icon-service-Container-Instances.svg',
                icon: 'container-instance'
            },
            
            // Web
            'azurerm_cdn_endpoint': { 
                displayName: 'CDN Endpoint', 
                category: 'Web', 
                iconFileName: '00056-icon-service-CDN-Profiles.svg',
                icon: 'cdn'
            },
            'azurerm_cdn_profile': { 
                displayName: 'CDN Profile', 
                category: 'Web', 
                iconFileName: '00056-icon-service-CDN-Profiles.svg',
                icon: 'cdn-profile'
            },
            
            // Identity
            'azurerm_user_assigned_identity': { 
                displayName: 'Managed Identity', 
                category: 'Identity', 
                iconFileName: '10227-icon-service-Entra-Managed-Identities.svg',
                icon: 'managed-identity'
            },
            
            // Analytics
            'azurerm_stream_analytics_job': { 
                displayName: 'Stream Analytics Job', 
                category: 'Analytics', 
                iconFileName: '00042-icon-service-Stream-Analytics-Jobs.svg',
                icon: 'stream-analytics'
            },
            'azurerm_event_hubs_namespace': { 
                displayName: 'Event Hubs Namespace', 
                category: 'Analytics', 
                iconFileName: '00039-icon-service-Event-Hubs.svg',
                icon: 'event-hubs'
            },
            
            // AI + Machine Learning
            'azurerm_cognitive_account': { 
                displayName: 'Cognitive Services', 
                category: 'AI + Machine Learning', 
                iconFileName: '10162-icon-service-Cognitive-Services.svg',
                icon: 'cognitive-services'
            },
            'azurerm_machine_learning_workspace': { 
                displayName: 'Machine Learning Workspace', 
                category: 'AI + Machine Learning', 
                iconFileName: '10166-icon-service-Machine-Learning.svg',
                icon: 'machine-learning'
            },
            
            // Integration
            'azurerm_servicebus_namespace': { 
                displayName: 'Service Bus Namespace', 
                category: 'Integration', 
                iconFileName: '10836-icon-service-Azure-Service-Bus.svg',
                icon: 'service-bus'
            },
            'azurerm_eventgrid_topic': { 
                displayName: 'Event Grid Topic', 
                category: 'Integration', 
                iconFileName: '10206-icon-service-Event-Grid-Topics.svg',
                icon: 'event-grid'
            },
            'azurerm_eventgrid_domain': { 
                displayName: 'Event Grid Domain', 
                category: 'Integration', 
                iconFileName: '10215-icon-service-Event-Grid-Domains.svg',
                icon: 'event-grid-domain'
            },
            
            // DevOps
            'azurerm_dev_test_lab': { 
                displayName: 'DevTest Labs', 
                category: 'DevOps', 
                iconFileName: '10264-icon-service-DevTest-Labs.svg',
                icon: 'dev-test-lab'
            },
            
            // General
            'azurerm_resource_group': {
                displayName: 'Resource Group',
                category: 'General',
                iconFileName: '10007-icon-service-Resource-Groups.svg',
                icon: 'resource-group'
            },

            // Default/Unknown
            'unknown': {
                displayName: 'Unknown Resource',
                category: 'General',
                iconFileName: '10007-icon-service-Resource-Groups.svg',
                icon: 'resource'
            }
        };
    
        static getIconUriForWebview(extensionUri: vscode.Uri, iconFileName: string): vscode.Uri {
            return vscode.Uri.joinPath(extensionUri, 'resources', 'azure-icons', iconFileName);
        }
          
        static getCategoryColor(category: string): string {
            const categoryColors: Record<string, string> = {
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
            return categoryColors[category] || '#69797E';
        }
    
        static getResourceInfo(resourceType: string): AzureResourceInfo {
            return this.resourceMappings[resourceType] || this.resourceMappings['unknown'];
        }
    
        static getAllCategories(): AzureResourceCategory[] {
            return [
                'Compute',
                'Networking',
                'Storage',
                'Databases',
                'Security',
                'Monitoring + Management',
                'Analytics',
                'AI + Machine Learning',
                'Integration',
                'Identity',
                'Web',
                'Containers',
                'DevOps',
                'General'
            ];
        }
    
        // Helper method to get all resource types
        static getAllResourceTypes(): string[] {
            return Object.keys(this.resourceMappings);
        }
    
        // Helper method to get resources by category
        static getResourcesByCategory(category: AzureResourceCategory): AzureResourceInfo[] {
            return Object.values(this.resourceMappings)
                .filter(resource => resource.category === category);
        }
    }
