import * as vscode from 'vscode';
import * as path from 'path';
import { TerraformParser, TerraformResource } from './terraformParser';
import { AzureIconMapper } from './azureIconMapper';
import { DiagramLayout, DiagramNode, DiagramOptions, SecurityBadgeInfo, CostBadgeInfo, TagBadgeInfo } from './diagramLayout';
import { DiagramRenderer } from './diagramRenderer';
import { SecurityAnalyzer } from './analyzers/securityAnalyzer';
import { CostEstimator } from './analyzers/costEstimator';
import { NetworkAnalyzer } from './analyzers/networkAnalyzer';
import { SecurityPosture, SecuritySeverity } from './types/security';
import { CostEstimate, TagCompliance, SKUInfo } from './types/cost';

// Debounce timer for save events
let saveDebounceTimer: NodeJS.Timeout | undefined;

// DevOps feature configuration interface
interface DevOpsConfig {
    showSecurityBadges: boolean;
    severityThreshold: SecuritySeverity;
    showCostEstimates: boolean;
    currency: string;
    showSKULabels: boolean;
    showTagCompliance: boolean;
    requiredTags: string[];
    showCIDR: boolean;
    showPrivateEndpoints: boolean;
    showDataFlows: boolean;
    layoutMode: string;
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Azure Terraform Diagram extension activated!');

    // Register the generate command
    const disposable = vscode.commands.registerCommand('azure-terraform-diagram.generate', async () => {
        try {
            await generateDiagram(context);
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to generate diagram: ${error.message}`);
            console.error('Extension error:', error);
        }
    });

    context.subscriptions.push(disposable);

    // Register the generate from folder command (context menu)
    const generateFromFolderCommand = vscode.commands.registerCommand(
        'azure-terraform-diagram.generateFromFolder',
        async (folderUri: vscode.Uri) => {
            try {
                if (!folderUri) {
                    vscode.window.showErrorMessage('Please right-click on a folder to generate a diagram.');
                    return;
                }
                await generateDiagram(context, folderUri.fsPath);
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to generate diagram: ${error.message}`);
                console.error('Extension error:', error);
            }
        }
    );

    context.subscriptions.push(generateFromFolderCommand);

    // Register export PNG command
    const exportPNGCommand = vscode.commands.registerCommand('azure-terraform-diagram.exportPNG', async () => {
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Exporting diagram...',
                cancellable: false
            }, async () => {
                await generatePNGDiagram(context);
            });

            const config = vscode.workspace.getConfiguration('azureTerraformDiagram');
            const outputFileName = config.get<string>('outputFileName', 'architecture.png');
            vscode.window.showInformationMessage(`Exported diagram to ${outputFileName}`);
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to export diagram: ${error.message}`);
        }
    });

    context.subscriptions.push(exportPNGCommand);

    // Register save listener for .tf files
    const saveListener = vscode.workspace.onDidSaveTextDocument(async (document) => {
        // Check if it's a Terraform file
        if (!document.fileName.endsWith('.tf') && 
            !document.fileName.endsWith('.tfvars') && 
            !document.fileName.endsWith('.tf.json')) {
            return;
        }

        // Check if auto-generate is enabled
        const config = vscode.workspace.getConfiguration('azureTerraformDiagram');
        const autoGenerate = config.get<boolean>('autoGenerateOnSave', true);

        if (!autoGenerate) {
            return;
        }

        // Get the folder containing the saved .tf file
        const savedFilePath = document.fileName;
        const savedFileFolder = path.dirname(savedFilePath);

        // Check if we should scope to folder or use workspace root
        const scopeToFolder = config.get<boolean>('scopeToFolder', true);
        
        // Determine target folder based on scope setting
        let targetFolder: string | undefined;
        if (scopeToFolder) {
            targetFolder = savedFileFolder;
        } else {
            // Use workspace root
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
                targetFolder = workspaceFolders[0].uri.fsPath;
            }
        }

        if (!targetFolder) {
            return;
        }

        // Debounce multiple saves
        if (saveDebounceTimer) {
            clearTimeout(saveDebounceTimer);
        }

        saveDebounceTimer = setTimeout(async () => {
            try {
                // Generate PNG for the target folder (either file's folder or workspace root)
                await generatePNGDiagram(context, targetFolder);
            } catch (error: any) {
                console.error('Auto-generate diagram error:', error);
                // Don't show error messages for auto-generation to avoid annoyance
            }
        }, 1000); // Wait 1 second after last save
    });

    context.subscriptions.push(saveListener);
}

/**
 * Get DevOps configuration from VS Code settings
 */
function getDevOpsConfig(): DevOpsConfig {
    const config = vscode.workspace.getConfiguration('azureTerraformDiagram');
    return {
        showSecurityBadges: config.get<boolean>('security.showBadges', true),
        severityThreshold: config.get<SecuritySeverity>('security.severityThreshold', 'medium'),
        showCostEstimates: config.get<boolean>('cost.showEstimates', false),
        currency: config.get<string>('cost.currency', 'USD'),
        showSKULabels: config.get<boolean>('showSKULabels', true),
        showTagCompliance: config.get<boolean>('compliance.showTagBadges', true),
        requiredTags: config.get<string[]>('compliance.requiredTags', ['environment', 'owner']),
        showCIDR: config.get<boolean>('network.showCIDR', true),
        showPrivateEndpoints: config.get<boolean>('network.showPrivateEndpoints', true),
        showDataFlows: config.get<boolean>('network.showDataFlows', false),
        layoutMode: config.get<string>('layout.mode', 'auto')
    };
}

/**
 * Enhance diagram nodes with DevOps features (security badges, costs, etc.)
 */
function enhanceNodesWithDevOpsFeatures(
    nodes: DiagramNode[],
    resources: TerraformResource[],
    devOpsConfig: DevOpsConfig
): DiagramNode[] {
    const resourceMap = new Map<string, TerraformResource>();
    resources.forEach(r => resourceMap.set(`${r.type}_${r.name}`, r));

    // Analyze security if enabled
    let securityPostures: Map<string, SecurityPosture> | undefined;
    if (devOpsConfig.showSecurityBadges) {
        const securityAnalyzer = new SecurityAnalyzer(resources);
        securityPostures = securityAnalyzer.analyzeAll();
    }

    // Analyze costs if enabled
    let costEstimates: Map<string, CostEstimate> | undefined;
    let skuInfoMap: Map<string, SKUInfo> | undefined;
    if (devOpsConfig.showCostEstimates || devOpsConfig.showSKULabels) {
        const costEstimator = new CostEstimator(resources, devOpsConfig.currency);
        if (devOpsConfig.showCostEstimates) {
            costEstimates = costEstimator.estimateAll();
        }
        if (devOpsConfig.showSKULabels) {
            skuInfoMap = costEstimator.extractAllSKUInfo();
        }
    }

    // Analyze tag compliance if enabled
    let tagCompliance: Map<string, TagCompliance> | undefined;
    if (devOpsConfig.showTagCompliance) {
        const costEstimator = new CostEstimator(resources);
        tagCompliance = costEstimator.analyzeTagCompliance(devOpsConfig.requiredTags);
    }

    // Analyze network topology
    let networkAnalyzer: NetworkAnalyzer | undefined;
    if (devOpsConfig.showCIDR || devOpsConfig.showPrivateEndpoints || devOpsConfig.showDataFlows) {
        networkAnalyzer = new NetworkAnalyzer(resources);
    }

    // Get data flows if enabled
    let dataFlows: Map<string, { targetId: string; flowType: string; label?: string }[]> | undefined;
    if (devOpsConfig.showDataFlows && networkAnalyzer) {
        const flows = networkAnalyzer.analyzeDataFlows();
        dataFlows = new Map();
        for (const flow of flows) {
            const existing = dataFlows.get(flow.sourceId) || [];
            existing.push({
                targetId: flow.targetId,
                flowType: flow.flowType,
                label: flow.label
            });
            dataFlows.set(flow.sourceId, existing);
        }
    }

    // Enhance each node
    return nodes.map(node => {
        const enhanced = { ...node };
        const resource = resourceMap.get(node.id);

        // Add security badges
        if (securityPostures && devOpsConfig.showSecurityBadges) {
            const posture = securityPostures.get(node.id);
            if (posture && posture.indicators.length > 0) {
                // Filter by severity threshold
                const severityOrder: SecuritySeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
                const thresholdIndex = severityOrder.indexOf(devOpsConfig.severityThreshold);
                const filteredIndicators = posture.indicators.filter(ind => {
                    const indIndex = severityOrder.indexOf(ind.severity);
                    return indIndex <= thresholdIndex;
                });

                if (filteredIndicators.length > 0) {
                    enhanced.securityBadges = filteredIndicators.map(ind => ({
                        severity: ind.severity,
                        icon: getSecurityIconChar(ind.severity),
                        title: ind.title,
                        tooltip: `${ind.title}: ${ind.description}`
                    }));
                    enhanced.overallSecurityScore = posture.overallScore;
                }
            }
        }

        // Add cost badge
        if (costEstimates && devOpsConfig.showCostEstimates) {
            const estimate = costEstimates.get(node.id);
            if (estimate && estimate.monthlyCost > 0) {
                enhanced.costBadge = {
                    monthlyCost: estimate.monthlyCost,
                    currency: estimate.currency,
                    formattedCost: formatCost(estimate.monthlyCost, estimate.currency),
                    tier: estimate.tier,
                    isHighCost: estimate.monthlyCost > 500 // Mark as high cost if > $500/month
                };
            }
        }

        // Add SKU label
        if (skuInfoMap && devOpsConfig.showSKULabels) {
            const skuInfo = skuInfoMap.get(node.id);
            if (skuInfo && skuInfo.sku && skuInfo.sku !== 'Standard' && skuInfo.sku !== 'N/A') {
                enhanced.skuLabel = skuInfo.sku;
            }
        }

        // Add tag compliance badge
        if (tagCompliance && devOpsConfig.showTagCompliance) {
            const compliance = tagCompliance.get(node.id);
            if (compliance && !compliance.hasRequiredTags) {
                enhanced.tagBadge = {
                    hasRequiredTags: false,
                    missingCount: compliance.missingTags.length,
                    missingTags: compliance.missingTags,
                    tooltip: `Missing tags: ${compliance.missingTags.join(', ')}`
                };
            }
        }

        // Add CIDR range for network resources
        if (devOpsConfig.showCIDR && resource) {
            const attrs = resource.attributes || {};
            if (resource.type === 'azurerm_virtual_network' && attrs.address_space) {
                const space = Array.isArray(attrs.address_space) ? attrs.address_space[0] : attrs.address_space;
                enhanced.cidrRange = space;
            } else if (resource.type === 'azurerm_subnet') {
                const prefix = attrs.address_prefixes || attrs.address_prefix;
                enhanced.cidrRange = Array.isArray(prefix) ? prefix[0] : prefix;
            }
        }

        // Check for private endpoint
        if (devOpsConfig.showPrivateEndpoints && networkAnalyzer) {
            const topology = networkAnalyzer.analyzeTopology();
            const hasPrivateEndpoint = topology.privateEndpoints.some(
                pe => pe.targetResourceId.includes(node.name)
            );
            enhanced.hasPrivateEndpoint = hasPrivateEndpoint;
        }

        // Add data flows
        if (dataFlows && devOpsConfig.showDataFlows) {
            const nodeFlows = dataFlows.get(node.id);
            if (nodeFlows) {
                enhanced.dataFlows = nodeFlows;
            }
        }

        return enhanced;
    });
}

/**
 * Get security icon character for severity
 */
function getSecurityIconChar(severity: SecuritySeverity): string {
    switch (severity) {
        case 'critical': return '!!';
        case 'high': return '!';
        case 'medium': return '⚠';
        case 'low': return 'i';
        case 'info': return 'ℹ';
        default: return '?';
    }
}

/**
 * Format cost for display
 */
function formatCost(cost: number, currency: string): string {
    if (cost < 1) {
        return `~${currency === 'USD' ? '$' : currency}${cost.toFixed(2)}/mo`;
    } else if (cost < 100) {
        return `~${currency === 'USD' ? '$' : currency}${Math.round(cost)}/mo`;
    } else {
        return `~${currency === 'USD' ? '$' : currency}${(cost / 1000).toFixed(1)}k/mo`;
    }
}

/**
 * Generate PNG diagram and save to workspace
 * @param context Extension context
 * @param targetFolder Optional specific folder to generate diagram for
 */
async function generatePNGDiagram(context: vscode.ExtensionContext, targetFolder?: string): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return;
    }

    // Use target folder if provided, otherwise use workspace root
    const workspacePath = targetFolder || workspaceFolders[0].uri.fsPath;

    // Parse Terraform files - use non-recursive scan for folder-specific generation
    const parser = new TerraformParser();

    // IMPORTANT: When targetFolder is specified (folder-scoped), use non-recursive
    // When no targetFolder (full workspace), use recursive
    const useRecursive = !targetFolder;
    const resources = await parser.parseWorkspace(workspacePath, useRecursive);

    if (resources.length === 0) {
        console.log(`No Terraform resources found in ${workspacePath}`);
        return; // No resources, skip generation
    }

    // Create layout
    const dependencies = DiagramLayout.extractDependencies(resources);
    let diagramNodes = DiagramLayout.createLayout(resources, dependencies);

    // Enhance with DevOps features
    const devOpsConfig = getDevOpsConfig();
    diagramNodes = enhanceNodesWithDevOpsFeatures(diagramNodes, resources, devOpsConfig);

    // Get output file name from config
    const config = vscode.workspace.getConfiguration('azureTerraformDiagram');
    const outputFileName = config.get<string>('outputFileName', 'architecture.png');
    const outputPath = path.join(workspacePath, outputFileName);

    // Generate PNG
    const renderer = new DiagramRenderer(context.extensionPath);

    try {
        await renderer.generatePNG(diagramNodes, outputPath, resources);
        console.log(`Generated ${outputFileName} in ${workspacePath}`);

        // Show status bar message briefly
        vscode.window.setStatusBarMessage(`$(check) Updated ${path.basename(outputFileName)}`, 3000);
    } catch (error: any) {
        console.error('PNG generation failed, falling back to SVG:', error.message);
        // If PNG fails, try SVG
        const svgPath = outputPath.replace('.png', '.svg');
        renderer.generateSVGFile(diagramNodes, svgPath, resources);
        console.log(`Generated SVG fallback: ${svgPath}`);
        vscode.window.setStatusBarMessage(`$(check) Updated ${path.basename(svgPath)}`, 3000);
    }
}

/**
 * Generate interactive diagram in webview
 * @param context Extension context
 * @param targetFolder Optional specific folder to generate diagram for
 */
async function generateDiagram(context: vscode.ExtensionContext, targetFolder?: string) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('Please open a folder with Terraform files first.');
        return;
    }

    const workspaceUri = workspaceFolders[0].uri;
    // Use target folder if provided, otherwise use workspace root
    const initialWorkspacePath = targetFolder || workspaceUri.fsPath;
    
    const result = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Azure Terraform Diagram',
        cancellable: true
    }, async (progress, token) => {
        progress.report({ message: 'Scanning for Terraform files...' });

        const parser = new TerraformParser();
        // Use non-recursive scan when a specific folder is targeted
        // Use recursive scan when generating for entire workspace
        const useRecursive = !targetFolder;
        const resources = await parser.parseWorkspace(initialWorkspacePath, useRecursive);
        
        if (token.isCancellationRequested) {
            return null;
        }

        if (resources.length === 0) {
            throw new Error('No Azure resources found in Terraform files.');
        }

        progress.report({ message: `Found ${resources.length} resources, creating diagram...` });
        
        // Extract dependencies and create layout
        const dependencies = DiagramLayout.extractDependencies(resources);
        let diagramNodes = DiagramLayout.createLayout(resources,dependencies);     
        const devOpsConfig = getDevOpsConfig();          
        diagramNodes = enhanceNodesWithDevOpsFeatures(diagramNodes, resources, devOpsConfig);                            
                                      
        // Debug output
        console.log(`Resources: ${resources.length}`);
        console.log(`Diagram nodes: ${diagramNodes.length}`);
        console.log(`Dependencies map entries: ${dependencies.size}`);
        
        // Check node properties
        diagramNodes.forEach((node, index) => {
            console.log(`Node ${index}: ${node.name}, type: ${node.type}, x=${node.x}, y=${node.y}, width=${node.width}, height=${node.height}`);
            console.log(`  Category: ${node.category}, Level: ${node.level}, IsGroup: ${node.isGroupContainer}, Parent: ${node.parentGroup}`);
            console.log(`  Connections: ${node.connections.length}`);
            // Debug cost badges
            if (node.costBadge) {
                console.log(`  Cost: ${node.costBadge.formattedCost}`);
            }
            if (node.securityBadges && node.securityBadges.length > 0) {
                console.log(`  Security: ${node.securityBadges.length} issues`);
            }
        });
        
        return { resources, diagramNodes, workspacePath: initialWorkspacePath };
    });

    if (!result) {
        return; // Cancelled
    }

    const { resources, diagramNodes, workspacePath } = result;

    // Create webview panel
    const panel = vscode.window.createWebviewPanel(
        'azureTerraformDiagram',
        'Azure Infrastructure Diagram',
        vscode.ViewColumn.Two,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                workspaceUri,
                vscode.Uri.file(context.extensionPath)
            ]
        }
    );

    // Set webview content
    panel.webview.html = getWebviewContent(panel, context, resources, diagramNodes, workspacePath);

    // Handle messages from webview
    panel.webview.onDidReceiveMessage(
        message => {
            switch (message.command) {
                case 'openFile':
                    if (message.filePath && message.line) {
                        const fullPath = vscode.Uri.file(path.join(workspacePath, message.filePath));
                        vscode.workspace.openTextDocument(fullPath).then(doc => {
                            vscode.window.showTextDocument(doc, {
                                selection: new vscode.Range(
                                    new vscode.Position(message.line - 1, 0),
                                    new vscode.Position(message.line - 1, 0)
                                )
                            });
                        });
                    }
                    return;
                case 'alert':
                    vscode.window.showInformationMessage(message.text);
                    return;
                case 'webviewReady':
                    console.log('Webview ready:', message.data);
                    return;
            }
        },
        undefined,
        context.subscriptions
    );

    vscode.window.showInformationMessage(
        `Generated Azure infrastructure diagram with ${resources.length} resources.`
    );
}

function getWebviewContent(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    resources: TerraformResource[],
    diagramNodes: DiagramNode[],
    workspacePath: string
): string {
    // Group resources by type for statistics
    const resourcesByType: { [key: string]: TerraformResource[] } = {};
    resources.forEach(resource => {
        if (!resourcesByType[resource.type]) {
            resourcesByType[resource.type] = [];
        }
        resourcesByType[resource.type].push(resource);
    });

    // Get unique files
    const uniqueFiles = Array.from(new Set(resources.map(r => r.file)));

    // Create SVG icons mapping
    const iconMap: { [key: string]: string } = {};
    const categories = new Set<string>();
    
    diagramNodes.forEach(node => {
        const resourceInfo = AzureIconMapper.getResourceInfo(node.type);
        const iconFileUri = AzureIconMapper.getIconUriForWebview(context.extensionUri, resourceInfo.iconFileName);
        iconMap[node.id] = panel.webview.asWebviewUri(iconFileUri).toString();
        categories.add(resourceInfo.category);
    });

    // Create a type-safe way to handle categories
    type ValidCategory = string;
    
    // Filter valid categories for the legend
    const validCategories = Array.from(categories).filter(category => {
        // Try to get the color - if it returns a valid color, it's a valid category
        const color = AzureIconMapper.getCategoryColor(category as any);
        return color && color !== '#505050';
    });

    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Azure Infrastructure Diagram</title>
            <style>
                    :root {
                        --azure-blue: #0078D4;
                        --azure-green: #107C10;
                        --azure-purple: #68217A;
                        --azure-orange: #FF8C00;
                        --azure-red: #F25022;
                    }

                    body {
                        font-family: 'Segoe UI', var(--vscode-font-family), sans-serif;
                        margin: 0;
                        padding: 0;
                        background: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                        overflow: hidden;
                    }

                    .app-container {
                        display: flex;
                        flex-direction: column;
                        height: 100vh;
                    }

                    .header {
                        background: linear-gradient(135deg, var(--azure-blue), #005A9E);
                        color: white;
                        padding: 15px 25px;
                        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                    }

                    .header-content {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }

                    .header h1 {
                        margin: 0;
                        font-size: 20px;
                        display: flex;
                        align-items: center;
                        gap: 10px;
                    }

                    .stats {
                        display: flex;
                        gap: 15px;
                        font-size: 12px;
                    }

                    .stat-item {
                        background: rgba(255, 255, 255, 0.1);
                        padding: 5px 12px;
                        border-radius: 15px;
                        display: flex;
                        align-items: center;
                        gap: 5px;
                    }

                    .main-content {
                        display: flex;
                        flex: 1;
                        overflow: hidden;
                    }

                    .sidebar {
                        width: 200px;
                        background: var(--vscode-sideBar-background);
                        border-right: 1px solid var(--vscode-panel-border);
                        overflow-y: auto;
                        padding: 12px;
                    }

                    .sidebar-section {
                        margin-bottom: 15px;
                    }

                    .sidebar h2 {
                        color: var(--azure-blue);
                        font-size: 11px;
                        margin: 0 0 8px 0;
                        padding-bottom: 5px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }

                    .resource-type-list {
                        display: flex;
                        flex-direction: column;
                        gap: 4px;
                    }

                    .resource-type-item {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        padding: 5px 8px;
                        background: var(--vscode-list-inactiveSelectionBackground);
                        border-radius: 4px;
                        cursor: pointer;
                        transition: background 0.2s;
                    }

                    .resource-type-item:hover {
                        background: var(--vscode-list-hoverBackground);
                    }

                    .resource-type-icon {
                        width: 16px;
                        height: 16px;
                        min-width: 16px;
                    }

                    .resource-type-info {
                        flex: 1;
                    }

                    .resource-type-name {
                        font-size: 10px;
                        font-weight: 500;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    }

                    .resource-type-count {
                        font-size: 9px;
                        color: var(--vscode-descriptionForeground);
                    }

                    .diagram-container {
                        flex: 1;
                        position: relative;
                        overflow: auto;
                        background: #FFFFFF;
                    }

                    .diagram-canvas {
                        position: relative;
                        min-width: 3000px;
                        min-height: 2000px;
                    }

                    .diagram-node {
                        position: absolute;
                        background: #FFFFFF;
                        border: 1px solid #E1DFDD;
                        border-radius: 5px;
                        border-left: 3px solid #A19F9D;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.06);
                        cursor: pointer;
                        transition: box-shadow 0.15s, border-color 0.15s;
                        display: flex;
                        flex-direction: row;
                        align-items: center;
                        justify-content: flex-start;
                        overflow: visible; /* Changed from hidden to visible for badges */
                        box-sizing: border-box;
                        padding: 4px 6px;
                        gap: 5px;
                    }

                    .diagram-node:hover {
                        box-shadow: 0 2px 8px rgba(0,120,212,0.18);
                        border-color: #0078D4;
                        z-index: 1000;
                    }

                    .node-icon {
                        width: 24px;
                        height: 24px;
                        min-width: 24px;
                        object-fit: contain;
                        flex-shrink: 0;
                    }

                    .node-label {
                        text-align: left;
                        min-width: 0;
                        flex: 1;
                    }

                    .node-name {
                        font-weight: 600;
                        font-size: 9px;
                        margin-bottom: 0;
                        color: #201F1E;
                        line-height: 1.2;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    }

                    .node-type {
                        display: none;
                    }

                    .node-detail {
                        font-size: 8px;
                        font-family: 'Monaco', 'Consolas', 'Courier New', monospace;
                        color: #0078D4;
                        margin-top: 1px;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        line-height: 1.1;
                    }

                    /* Cost badge styles */
                    .cost-badge {
                        background: #f0f8ff;
                        border: 1px solid #0078d4;
                        border-radius: 3px;
                        padding: 1px 3px;
                        font-size: 5px;
                        font-weight: bold;
                        color: #0078d4;
                        white-space: nowrap;
                        line-height: 1;
                        display: inline-block;
                        position: relative;
                        z-index: 10;
                    }

                    .cost-badge.high-cost {
                        background: #fff0f0;
                        border-color: #e81123;
                        color: #e81123;
                    }

                    /* SKU label styles */
                    .sku-label {
                        background: #f3f2f1;
                        border: 1px solid #a19f9d;
                        border-radius: 2px;
                        padding: 1px 2px;
                        font-size: 5px;
                        color: #605e5c;
                        font-family: 'Monaco', 'Consolas', monospace;
                        margin-top: 0;
                        line-height: 1;
                        display: inline-block;
                    }

                    /* Tag compliance badge */
                    .tag-badge {
                        background: #fff4ce;
                        border: 1px solid #ffb900;
                        border-radius: 2px;
                        padding: 1px 2px;
                        font-size: 5px;
                        color: #8a6d3b;
                        line-height: 1;
                        display: inline-block;
                    }

                    /* Security badge styles */
                    .security-badge {
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        width: 10px;
                        height: 10px;
                        border-radius: 50%;
                        font-size: 4px;
                        font-weight: bold;
                        line-height: 1;
                        position: relative;
                        z-index: 10;
                    }

                    .security-badge.critical {
                        background: #e81123;
                        color: white;
                    }

                    .security-badge.high {
                        background: #ff8c00;
                        color: white;
                    }

                    .security-badge.medium {
                        background: #ffb900;
                        color: black;
                    }

                    .security-badge.low {
                        background: #107c10;
                        color: white;
                    }

                    .security-badge.info {
                        background: #0078d4;
                        color: white;
                    }

                    /* Badges container - FIXED POSITIONING */
                    .node-badges {
                        position: absolute;
                        top: -5px;
                        right: -5px;
                        display: flex;
                        flex-direction: column;
                        align-items: flex-end;
                        gap: 1px;
                        pointer-events: none;
                        z-index: 20;
                        max-width: 60px; /* Limit width to prevent overflow */
                    }

                    /* Compact badges layout */
                    .badge-row {
                        display: flex;
                        gap: 1px;
                        align-items: center;
                        justify-content: flex-end;
                    }

                    /* Inline badges (inside node) */
                    .inline-badges {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 2px;
                        margin-top: 1px;
                        max-width: 100%;
                    }

                    /* Total cost display */
                    .total-cost-display {
                        position: fixed;
                        bottom: 70px;
                        right: 20px;
                        background: rgba(0, 120, 212, 0.9);
                        color: white;
                        padding: 8px 12px;
                        border-radius: 6px;
                        font-size: 12px;
                        font-weight: bold;
                        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
                        z-index: 1000;
                        display: flex;
                        flex-direction: column;
                        gap: 2px;
                        min-width: 120px;
                    }

                    .total-cost-display .total-label {
                        font-size: 9px;
                        opacity: 0.9;
                    }

                    .total-cost-display .total-amount {
                        font-size: 14px;
                        font-weight: bold;
                    }

                    /* Category left-border accents */
                    .diagram-node[data-category="Compute"] { border-left-color: #107C10; }
                    .diagram-node[data-category="Networking"] { border-left-color: #00485B; }
                    .diagram-node[data-category="Storage"] { border-left-color: #0078D4; }
                    .diagram-node[data-category="Databases"] { border-left-color: #E81123; }
                    .diagram-node[data-category="Security"] { border-left-color: #FF8C00; }
                    .diagram-node[data-category="Monitoring + Management"] { border-left-color: #8661C5; }
                    .diagram-node[data-category="Containers"] { border-left-color: #00BCF2; }
                    .diagram-node[data-category="Web"] { border-left-color: #FFB900; }
                    .diagram-node[data-category="Identity"] { border-left-color: #5C2D91; }
                    .diagram-node[data-category="Analytics"] { border-left-color: #0099BC; }
                    .diagram-node[data-category="AI + Machine Learning"] { border-left-color: #7719AA; }
                    .diagram-node[data-category="Integration"] { border-left-color: #CA5010; }
                    .diagram-node[data-category="DevOps"] { border-left-color: #038387; }
                    .diagram-node[data-category="General"] { border-left-color: #69797E; }

                    .connection {
                        position: absolute;
                        pointer-events: none;
                    }

                    .connection-line {
                        stroke-width: 1;
                        stroke: #A19F9D;
                        stroke-opacity: 0.5;
                        stroke-dasharray: none;
                        fill: none;
                    }

                    .connection-line.dashed {
                        stroke-dasharray: 6, 4;
                    }

                    .connection-line.dotted {
                        stroke-dasharray: 2, 4;
                    }

                    .connection-line.containment {
                        stroke: #C8C6C4;
                        stroke-dasharray: 6, 4;
                        stroke-width: 1;
                        stroke-opacity: 0.4;
                    }

                    .connection-arrow {
                        fill: #A19F9D;
                        fill-opacity: 0.4;
                    }

                    .legend {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 6px;
                        margin-top: 8px;
                    }

                    .legend-item {
                        display: flex;
                        align-items: center;
                        gap: 4px;
                        font-size: 9px;
                    }

                    .legend-color {
                        width: 10px;
                        height: 10px;
                        border-radius: 2px;
                    }

                    .controls {
                        position: fixed;
                        bottom: 20px;
                        right: 20px;
                        display: flex;
                        flex-direction: column;
                        gap: 10px;
                    }

                    .control-btn {
                        width: 40px;
                        height: 40px;
                        border-radius: 50%;
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
                        transition: background 0.2s;
                    }

                    .control-btn:hover {
                        background: var(--vscode-button-hoverBackground);
                    }

                    .tooltip {
                        position: absolute;
                        background: var(--vscode-editorWidget-background);
                        border: 1px solid var(--vscode-widget-border);
                        border-radius: 6px;
                        padding: 12px;
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                        max-width: 300px;
                        z-index: 10000;
                        pointer-events: none;
                        opacity: 0;
                        transition: opacity 0.2s;
                    }

                    .tooltip-title {
                        font-weight: bold;
                        margin-bottom: 5px;
                        color: var(--azure-blue);
                    }

                    .tooltip-detail {
                        font-size: 11px;
                        margin: 3px 0;
                        display: flex;
                        justify-content: space-between;
                    }

                    .tooltip-label {
                        color: var(--vscode-descriptionForeground);
                    }

                    .tooltip-value {
                        font-family: 'Monaco', 'Courier New', monospace;
                    }

                    .search-box {
                        margin-bottom: 10px;
                    }

                    .search-input {
                        width: 100%;
                        padding: 5px 8px;
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border: 1px solid var(--vscode-input-border);
                        border-radius: 3px;
                        font-size: 10px;
                        box-sizing: border-box;
                    }

                    /* Group container styles */
                    .diagram-node.group-container {
                        border: 1.5px solid rgba(0, 0, 0, 0.10);
                        border-left: 3px solid rgba(0, 120, 212, 0.5);
                        border-radius: 8px;
                        background: rgba(243, 242, 241, 0.30);
                        box-shadow: none;
                        padding: 0;
                        flex-direction: column;
                        align-items: flex-start;
                        justify-content: flex-start;
                    }

                    .diagram-node.group-container:hover {
                        box-shadow: none;
                        border-color: rgba(0, 0, 0, 0.15);
                    }

                    .diagram-node.group-container .node-label {
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        background: rgba(0, 120, 212, 0.06);
                        border-radius: 7px 7px 0 0;
                        padding: 4px 12px;
                        margin: 0;
                        width: auto;
                        border-bottom: 1px solid rgba(0, 0, 0, 0.06);
                    }

                    /* Zone-specific tint classes */
                    .zone-networking {
                        background: rgba(0, 72, 91, 0.06) !important;
                        border-color: rgba(0, 72, 91, 0.18) !important;
                    }
                    .zone-data {
                        background: rgba(0, 120, 212, 0.06) !important;
                        border-color: rgba(0, 120, 212, 0.18) !important;
                    }
                    .zone-application {
                        background: rgba(16, 124, 16, 0.06) !important;
                        border-color: rgba(16, 124, 16, 0.18) !important;
                    }
                    .zone-security {
                        background: rgba(255, 140, 0, 0.06) !important;
                        border-color: rgba(255, 140, 0, 0.18) !important;
                    }
                    .zone-management {
                        background: rgba(134, 97, 197, 0.06) !important;
                        border-color: rgba(134, 97, 197, 0.18) !important;
                    }
                    .zone-identity {
                        background: rgba(92, 45, 145, 0.06) !important;
                        border-color: rgba(92, 45, 145, 0.18) !important;
                    }
                    .zone-edge {
                        background: rgba(0, 0, 0, 0.03) !important;
                        border-color: rgba(0, 0, 0, 0.10) !important;
                    }
                    .zone-dmz {
                        background: rgba(255, 0, 0, 0.04) !important;
                        border-color: rgba(255, 0, 0, 0.12) !important;
                    }
                    .zone-presentation {
                        background: rgba(104, 33, 122, 0.05) !important;
                        border-color: rgba(104, 33, 122, 0.14) !important;
                    }

                    .diagram-node.level-0 {
                        /* Top-level nodes */
                        z-index: 10;
                    }

                    .diagram-node.level-1 {
                        /* Nodes inside groups */
                        z-index: 20;
                        border-width: 1.5px;
                    }

                    .diagram-node.level-2 {
                        /* Nested nodes */
                        z-index: 30;
                        border-width: 1px;
                    }

                    /* Category / zone / layer headers */
                    .diagram-node.category-header {
                        background: transparent;
                        border: none;
                        border-left: none;
                        box-shadow: none;
                        height: 24px !important;
                        justify-content: flex-start;
                        padding-left: 4px;
                    }

                    .diagram-node.category-header:hover {
                        box-shadow: none;
                        border-color: transparent;
                    }

                    .diagram-node.category-header .node-name {
                        font-size: 11px;
                        font-weight: 600;
                        color: #605E5C;
                        letter-spacing: 0.3px;
                        text-transform: uppercase;
                    }

                    .diagram-node.category-header .node-icon {
                        display: none;
                    }

                    .diagram-node.category-header .node-type {
                        display: none;
                    }

                    /* Responsive badge positioning for small nodes */
                    .diagram-node.small-node .node-badges {
                        top: -3px;
                        right: -3px;
                    }

                    .diagram-node.small-node .security-badge {
                        width: 8px;
                        height: 8px;
                        font-size: 3px;
                    }

                    .diagram-node.small-node .cost-badge,
                    .diagram-node.small-node .tag-badge {
                        padding: 0 2px;
                        font-size: 4px;
                    }
                        </style>

        </head>
        <body>
            <div class="app-container">
                <div class="header">
                    <div class="header-content">
                        <h1>
                            <span>🔗</span>
                            Azure Infrastructure Diagram
                        </h1>
                        <div class="stats">
                            <div class="stat-item">
                                <span>📁</span>
                                <span>${uniqueFiles.length} Files</span>
                            </div>
                            <div class="stat-item">
                                <span>🔧</span>
                                <span>${resources.length} Resources</span>
                            </div>
                            <div class="stat-item">
                                <span>📊</span>
                                <span>${Object.keys(resourcesByType).length} Types</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="main-content">
                    <div class="sidebar">
                        <div class="search-box">
                            <input type="text" class="search-input" placeholder="Search resources..." id="searchInput">
                        </div>
                        
                        <div class="sidebar-section">
                            <h2>Resource Types</h2>
                            <div class="resource-type-list" id="resourceTypeList">
                                ${Object.entries(resourcesByType).map(([type, typeResources]) => {
                                    const resourceInfo = AzureIconMapper.getResourceInfo(type);
                                    const iconFileUri = AzureIconMapper.getIconUriForWebview(context.extensionUri, resourceInfo.iconFileName);
                                    const iconUri = panel.webview.asWebviewUri(iconFileUri).toString();
                                    return `
                                        <div class="resource-type-item" data-type="${type}">
                                            <img src="${iconUri}" class="resource-type-icon" alt="${type}">
                                            <div class="resource-type-info">
                                                <div class="resource-type-name">${resourceInfo.displayName}</div>
                                                <div class="resource-type-count">${typeResources.length} resources</div>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                        </div>
                    </div>
                    
                    <div class="sidebar-section">
                        <h2>Legend</h2>
                        <div class="legend" id="legend">
                            ${validCategories.map(category => {
                                const color = AzureIconMapper.getCategoryColor(category as any);
                                return `
                                    <div class="legend-item">
                                        <div class="legend-color" style="background: ${color};"></div>
                                        <span>${category}</span>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </div>
                
                <div class="diagram-container" id="diagramContainer">
                    <div class="diagram-canvas" id="diagramCanvas">
                        <!-- Nodes will be rendered here by JavaScript -->
                    </div>
                    
                    <div class="tooltip" id="tooltip"></div>
                </div>
            </div>
            
            <div class="controls">
                <button class="control-btn" id="zoomIn" title="Zoom In">➕</button>
                <button class="control-btn" id="zoomOut" title="Zoom Out">➖</button>
                <button class="control-btn" id="resetView" title="Reset View">🔄</button>
                <button class="control-btn" id="fitToScreen" title="Fit to Screen">📐</button>
            </div>
        </div>
        
        <script>
            const vscode = acquireVsCodeApi();
            
            // Data from extension
            const resources = ${JSON.stringify(resources)};
            const diagramNodes = ${JSON.stringify(diagramNodes)};
            const iconMap = ${JSON.stringify(iconMap)};
            const workspacePath = '${workspacePath}';
            
            // Pass resource info from server-side to avoid duplicate logic
            const resourceInfos = ${JSON.stringify(
                Object.fromEntries(
                    Object.keys(resourcesByType).map(type => [
                        type, 
                        AzureIconMapper.getResourceInfo(type)
                    ])
                )
            )};
            
            // Application state
            let zoom = 1;
            let offsetX = 0;
            let offsetY = 0;
            let isDragging = false;
            let lastX = 0;
            let lastY = 0;
            let selectedNode = null;
            
            // Initialize
            document.addEventListener('DOMContentLoaded', () => {
                renderDiagram();
                setupEventListeners();
                setupSearch();
                fitToScreen();
            });
            
            function renderDiagram() {
                const canvas = document.getElementById('diagramCanvas');
                canvas.innerHTML = '';

                // Track drawn connections to avoid duplicates (A→B and B→A)
                const drawnConnections = new Set();

                // First render all connections
                diagramNodes.forEach(node => {
                    if (node.connections && node.connections.length > 0) {
                        node.connections.forEach(connectionId => {
                            // Create a unique key for this connection pair (order-independent)
                            const connKey = [node.id, connectionId].sort().join('::');
                            if (drawnConnections.has(connKey)) {
                                return; // Skip duplicate connection
                            }
                            drawnConnections.add(connKey);

                            const targetNode = diagramNodes.find(n => n.id === connectionId);
                            if (targetNode) {
                                // Determine connection type
                                let connectionType = 'dependency';
                                let style = 'solid';
                                let color = '#C8C6C4';

                                // Check for containment
                                if (node.parentGroup === targetNode.id ||
                                    (node.isGroupContainer && node.children && node.children.includes(targetNode.id))) {
                                    connectionType = 'containment';
                                    style = 'dashed';
                                    color = '#D2D0CE';
                                }

                                createConnection(node, targetNode, connectionType, style, color);
                            }
                        });
                    }
                });
                
                // Then render nodes (on top of connections)
                diagramNodes.forEach(node => {
                    createNode(node);
                });
                
                updateTransform();
            }
            
            function getNodeDetail(node, resource) {
                if (!resource) return '';
                const ni = resource.networkInfo || {};
                const attr = resource.attributes || {};

                // Skip CIDR for VNet and Subnet when node already has cidrRange
                // (CIDR will be shown separately as cidrHtml)
                if ((node.type === 'azurerm_virtual_network' || node.type === 'azurerm_subnet') && node.cidrRange) {
                    // Return other information instead of CIDR
                    if (node.type === 'azurerm_virtual_network') {
                        // For VNet, you could show location or other details
                        if (attr.location) return attr.location;
                        if (attr.resource_group_name) return 'RG: ' + attr.resource_group_name;
                        return '';
                    }
                    if (node.type === 'azurerm_subnet') {
                        // For Subnet, you could show other attributes
                        if (attr.service_endpoints) {
                            const endpoints = Array.isArray(attr.service_endpoints) ? 
                                attr.service_endpoints.join(', ') : attr.service_endpoints;
                            return 'Endpoints: ' + endpoints;
                        }
                        if (attr.enforce_private_link_endpoint_network_policies) return 'Private Link';
                        return '';
                    }
                    return '';
                }

                // VNet: address space (only if not already in node.cidrRange)
                if (node.type === 'azurerm_virtual_network') {
                    if (attr.address_space) {
                        const space = Array.isArray(attr.address_space) ? attr.address_space.join(', ') : attr.address_space;
                        return space;
                    }
                }
                // Subnet: CIDR prefix (only if not already in node.cidrRange)
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
                    const parts = [];
                    if (ni.privateIpAddress) parts.push(ni.privateIpAddress);
                    if (ni.subnetAddressPrefix) parts.push(ni.subnetAddressPrefix);
                    return parts.join(' | ') || '';
                }
                // Public IP
                if (node.type === 'azurerm_public_ip') {
                    const parts = [];
                    if (ni.ipAddress) parts.push(ni.ipAddress);
                    if (ni.publicIpAddress) parts.push(ni.publicIpAddress);
                    if (!parts.length && attr.allocation_method) parts.push(attr.allocation_method);
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
                    const parts = [];
                    if (attr.account_tier) parts.push(attr.account_tier);
                    if (attr.account_replication_type) parts.push(attr.account_replication_type);
                    return parts.join('_') || '';
                }
                // SQL Server / DB
                if (node.type === 'azurerm_sql_server' || node.type === 'azurerm_sql_database') {
                    if (attr.version) return 'v' + attr.version;
                }
                // AKS
                if (node.type === 'azurerm_kubernetes_cluster') {
                    if (ni.addressPrefix) return ni.addressPrefix;
                    if (attr.kubernetes_version) return 'k8s ' + attr.kubernetes_version;
                }
                // Firewall / App Gateway / NAT Gateway
                if (node.type === 'azurerm_firewall' || node.type === 'azurerm_application_gateway') {
                    if (attr.sku_name) return attr.sku_name;
                    if (attr.sku) return typeof attr.sku === 'object' ? (attr.sku.name || '') : attr.sku;
                }
                // Key Vault
                if (node.type === 'azurerm_key_vault') {
                    if (attr.sku_name) return attr.sku_name;
                }
                // Container group: ports
                if (node.type === 'azurerm_container_group') {
                    const parts = [];
                    if (ni.ipAddress) parts.push(ni.ipAddress);
                    if (ni.ports && ni.ports.length) parts.push('ports: ' + ni.ports.join(','));
                    return parts.join(' ') || '';
                }
                // Route table
                if (node.type === 'azurerm_route_table') {
                    return 'UDR';
                }
                // Generic: check for sku, location
                if (attr.sku_name) return attr.sku_name;
                if (attr.sku && typeof attr.sku === 'string') return attr.sku;
                if (attr.location) return attr.location;
                return '';
            }

            function createNode(node) {
                const canvas = document.getElementById('diagramCanvas');
                const resource = resources.find(r => \`\${r.type}_\${r.name}\` === node.id);
                const resourceInfo = getResourceInfo(node.type);

                // Build additional CSS classes based on node properties
                let additionalClasses = '';
                if (node.isGroupContainer) {
                    additionalClasses += ' group-container';
                    // Add zone-specific tint class
                    const zoneName = (node.zone || node.name || '').toLowerCase().replace(/[^a-z0-9]/g, '-');
                    additionalClasses += \` zone-\${zoneName}\`;
                }
                if (node.level !== undefined) {
                    additionalClasses += \` level-\${node.level}\`;
                }
                if (node.type === 'category') {
                    additionalClasses += ' category-header';
                }

                const nodeEl = document.createElement('div');
                nodeEl.className = \`diagram-node\${additionalClasses}\`;
                nodeEl.id = \`node-\${node.id}\`;
                nodeEl.dataset.type = node.type;
                nodeEl.dataset.category = resourceInfo.category;
                nodeEl.style.left = \`\${node.x}px\`;
                nodeEl.style.top = \`\${node.y}px\`;
                nodeEl.style.width = \`\${node.width}px\`;
                nodeEl.style.height = \`\${node.height}px\`;

                // Create badges container
                const badgesContainer = document.createElement('div');
                badgesContainer.className = 'node-badges';
                
                // Add security badges
                if (node.securityBadges && node.securityBadges.length > 0) {
                    // Sort by severity (critical first)
                    const severityOrder = { 'critical': 0, 'high': 1, 'medium': 2, 'low': 3, 'info': 4 };
                    const sortedBadges = [...node.securityBadges].sort((a, b) => 
                        severityOrder[a.severity] - severityOrder[b.severity]
                    );
                    
                    // Show only the highest severity badge on the node
                    const highestSeverityBadge = sortedBadges[0];
                    const badgeEl = document.createElement('div');
                    badgeEl.className = \`security-badge \${highestSeverityBadge.severity}\`;
                    badgeEl.title = highestSeverityBadge.tooltip || highestSeverityBadge.title;
                    badgeEl.textContent = highestSeverityBadge.icon || '!';
                    badgesContainer.appendChild(badgeEl);
                }
                
                // Add cost badge
                if (node.costBadge) {
                    const costBadge = document.createElement('div');
                    costBadge.className = \`cost-badge \${node.costBadge.isHighCost ? 'high-cost' : ''}\`;
                    costBadge.title = \`Monthly cost: \${node.costBadge.formattedCost} (\${node.costBadge.tier})\`;
                    costBadge.textContent = node.costBadge.formattedCost;
                    badgesContainer.appendChild(costBadge);
                }
                
                // Add tag compliance badge
                if (node.tagBadge && !node.tagBadge.hasRequiredTags) {
                    const tagBadge = document.createElement('div');
                    tagBadge.className = 'tag-badge';
                    tagBadge.title = node.tagBadge.tooltip || \`Missing \${node.tagBadge.missingCount} required tag(s)\`;
                    tagBadge.textContent = \`Tags: \${node.tagBadge.missingCount}\`;
                    badgesContainer.appendChild(tagBadge);
                }

                // Special rendering for different node types
                if (node.isGroupContainer) {
                    nodeEl.innerHTML = \`
                        <div class="node-label">
                            <div class="node-name" style="color: #605E5C; font-weight: 600; font-size: 11px; max-width: none;">\${node.name}</div>
                        </div>
                    \`;
                } else if (node.type === 'category' || node.type === 'zone' || node.type === 'layer' || node.type === 'zone-title') {
                    additionalClasses += ' category-header';
                    nodeEl.className = \`diagram-node\${additionalClasses}\`;
                    nodeEl.innerHTML = \`
                        <div class="node-name">\${node.name}</div>
                    \`;
                } else {
                    const displayName = node.displayName || node.name;
                    const detail = getNodeDetail(node, resource);
                    const detailHtml = detail ? \`<div class="node-detail" title="\${detail}">\${detail}</div>\` : '';
                    
                    // Check if we have SKU label
                    const skuHtml = node.skuLabel ? \`<div class="sku-label">\${node.skuLabel}</div>\` : '';
                    
                    // Check for CIDR range
                    const cidrHtml = node.cidrRange ? \`<div class="node-detail">\${node.cidrRange}</div>\` : '';
                    
                    // Check for private endpoint indicator
                    const privateEndpointHtml = node.hasPrivateEndpoint ? 
                        '<div style="font-size: 8px; color: #107c10; margin-top: 1px;">🔒 Private Endpoint</div>' : '';
                    
                    nodeEl.innerHTML = \`
                        <img src="\${iconMap[node.id]}" class="node-icon" alt="\${node.type}">
                        <div class="node-label">
                            <div class="node-name">\${displayName}</div>
                            \${detailHtml}
                            \${cidrHtml}
                            \${skuHtml}
                            \${privateEndpointHtml}
                        </div>
                    \`;
                }
                
                // Add badges container to node
                nodeEl.appendChild(badgesContainer);
                
                // Add event listeners
                nodeEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectNode(node, resource);
                });
                
                nodeEl.addEventListener('mouseenter', (e) => {
                    showTooltip(node, resource, resourceInfo, e);
                });
                
                nodeEl.addEventListener('mouseleave', () => {
                    hideTooltip();
                });
                
                canvas.appendChild(nodeEl);
            }
            
            function createConnection(sourceNode, targetNode, connectionType = 'dependency', style = 'solid', color = '#C8C6C4') {
                const canvas = document.getElementById('diagramCanvas');

                // Node center points
                const srcCx = sourceNode.x + sourceNode.width / 2;
                const srcCy = sourceNode.y + sourceNode.height / 2;
                const tgtCx = targetNode.x + targetNode.width / 2;
                const tgtCy = targetNode.y + targetNode.height / 2;
                const dx = tgtCx - srcCx;
                const dy = tgtCy - srcCy;

                // Orthogonal (Manhattan) routing: only horizontal and vertical segments
                const ALIGN_THRESHOLD = 15;
                let pathD;
                let arrowAngleDeg; // rotation for arrow polygon (points down at 0°)
                let endX, endY; // path endpoint for arrow placement

                if (Math.abs(dy) < ALIGN_THRESHOLD) {
                    // Nearly horizontal - straight H line from edge to edge
                    const sx = dx > 0 ? sourceNode.x + sourceNode.width : sourceNode.x;
                    const tx = dx > 0 ? targetNode.x : targetNode.x + targetNode.width;
                    pathD = \`M \${sx},\${srcCy} H \${tx}\`;
                    endX = tx; endY = srcCy;
                    arrowAngleDeg = dx > 0 ? -90 : 90;
                } else if (Math.abs(dx) < ALIGN_THRESHOLD) {
                    // Nearly vertical - straight V line from edge to edge
                    const sy = dy > 0 ? sourceNode.y + sourceNode.height : sourceNode.y;
                    const ty = dy > 0 ? targetNode.y : targetNode.y + targetNode.height;
                    pathD = \`M \${srcCx},\${sy} V \${ty}\`;
                    endX = srcCx; endY = ty;
                    arrowAngleDeg = dy > 0 ? 0 : 180;
                } else if (Math.abs(dx) >= Math.abs(dy)) {
                    // Primarily horizontal - step: H → V → H
                    const sx = dx > 0 ? sourceNode.x + sourceNode.width : sourceNode.x;
                    const tx = dx > 0 ? targetNode.x : targetNode.x + targetNode.width;
                    const midX = (sx + tx) / 2;
                    pathD = \`M \${sx},\${srcCy} H \${midX} V \${tgtCy} H \${tx}\`;
                    endX = tx; endY = tgtCy;
                    arrowAngleDeg = dx > 0 ? -90 : 90;
                } else {
                    // Primarily vertical - step: V → H → V
                    const sy = dy > 0 ? sourceNode.y + sourceNode.height : sourceNode.y;
                    const ty = dy > 0 ? targetNode.y : targetNode.y + targetNode.height;
                    const midY = (sy + ty) / 2;
                    pathD = \`M \${srcCx},\${sy} V \${midY} H \${tgtCx} V \${ty}\`;
                    endX = tgtCx; endY = ty;
                    arrowAngleDeg = dy > 0 ? 0 : 180;
                }

                // Create SVG
                const svgNS = "http://www.w3.org/2000/svg";
                const svg = document.createElementNS(svgNS, "svg");
                svg.setAttribute("class", "connection");
                svg.setAttribute("width", "100%");
                svg.setAttribute("height", "100%");
                svg.style.position = "absolute";
                svg.style.top = "0";
                svg.style.left = "0";
                svg.style.pointerEvents = "none";

                // Draw path
                const path = document.createElementNS(svgNS, "path");
                const lineColor = connectionType === 'containment' ? '#D2D0CE' : '#A19F9D';
                path.setAttribute("class", \`connection-line \${connectionType} \${style}\`);
                path.setAttribute("stroke", lineColor);
                path.setAttribute("stroke-opacity", connectionType === 'containment' ? "0.4" : "0.6");
                path.setAttribute("stroke-width", connectionType === 'containment' ? "1" : "1.5");
                path.setAttribute("d", pathD);
                svg.appendChild(path);

                if (connectionType !== 'containment') {
                    // Arrowhead at the path endpoint
                    const arrow = document.createElementNS(svgNS, "polygon");
                    arrow.setAttribute("class", "connection-arrow");
                    arrow.setAttribute("points", "0,0 -4,-8 4,-8");
                    arrow.setAttribute("fill", "#A19F9D");
                    arrow.setAttribute("fill-opacity", "0.6");
                    arrow.setAttribute("transform", \`translate(\${endX},\${endY}) rotate(\${arrowAngleDeg})\`);
                    svg.appendChild(arrow);
                }

                canvas.appendChild(svg);
            }
            
            function selectNode(node, resource) {
                // Remove previous selection
                if (selectedNode) {
                    const prevNode = document.getElementById(\`node-\${selectedNode.id}\`);
                    if (prevNode) {
                        prevNode.style.outline = '';
                        prevNode.style.outlineOffset = '';
                    }
                }

                // Highlight selected node
                const nodeEl = document.getElementById(\`node-\${node.id}\`);
                if (nodeEl) {
                    nodeEl.style.outline = '2px solid #0078D4';
                    nodeEl.style.outlineOffset = '4px';
                    selectedNode = node;
                    
                    // Open file in editor
                    if (resource && resource.file) {
                        vscode.postMessage({
                            command: 'openFile',
                            filePath: resource.file,
                            line: resource.line || 1
                        });
                    }
                }
            }
            
            function showTooltip(node, resource, resourceInfo, event) {
                const tooltip = document.getElementById('tooltip');
                if (!tooltip) return;
                
                let html = \`
                    <div class="tooltip-title">\${resourceInfo.displayName}</div>
                    <div class="tooltip-detail">
                        <span class="tooltip-label">Name:</span>
                        <span class="tooltip-value">\${node.name}</span>
                    </div>
                    <div class="tooltip-detail">
                        <span class="tooltip-label">Type:</span>
                        <span class="tooltip-value">\${node.type}</span>
                    </div>
                    <div class="tooltip-detail">
                        <span class="tooltip-label">Category:</span>
                        <span class="tooltip-value">\${resourceInfo.category}</span>
                    </div>
                \`;
                
                // Add cost information
                if (node.costBadge) {
                    html += \`
                        <div class="tooltip-detail">
                            <span class="tooltip-label">Monthly Cost:</span>
                            <span class="tooltip-value" style="color: \${node.costBadge.isHighCost ? '#e81123' : '#107c10'}; font-weight: bold;">
                                \${node.costBadge.formattedCost}
                            </span>
                        </div>
                        <div class="tooltip-detail">
                            <span class="tooltip-label">Pricing Tier:</span>
                            <span class="tooltip-value">\${node.costBadge.tier}</span>
                        </div>
                    \`;
                }
                
                // Add SKU information
                if (node.skuLabel) {
                    html += \`
                        <div class="tooltip-detail">
                            <span class="tooltip-label">SKU:</span>
                            <span class="tooltip-value">\${node.skuLabel}</span>
                        </div>
                    \`;
                }
                
                // Add tag compliance information
                if (node.tagBadge) {
                    html += \`
                        <div class="tooltip-detail">
                            <span class="tooltip-label">Tag Compliance:</span>
                            <span class="tooltip-value" style="color: \${node.tagBadge.hasRequiredTags ? '#107c10' : '#e81123'}">
                                \${node.tagBadge.hasRequiredTags ? 'Compliant' : \`\${node.tagBadge.missingCount} tags missing\`}
                            </span>
                        </div>
                    \`;
                    if (!node.tagBadge.hasRequiredTags && node.tagBadge.missingTags) {
                        html += \`
                            <div class="tooltip-detail">
                                <span class="tooltip-label">Missing Tags:</span>
                                <span class="tooltip-value">\${node.tagBadge.missingTags.join(', ')}</span>
                            </div>
                        \`;
                    }
                }
                
                // Add security information
                if (node.securityBadges && node.securityBadges.length > 0) {
                    const severityCounts = {};
                    node.securityBadges.forEach(badge => {
                        severityCounts[badge.severity] = (severityCounts[badge.severity] || 0) + 1;
                    });
                    
                    html += \`<div class="tooltip-detail" style="margin-top: 8px; border-top: 1px solid #eee; padding-top: 8px;">
                        <span class="tooltip-label">Security Issues:</span>
                        <span class="tooltip-value">\${node.securityBadges.length} total</span>
                    </div>\`;
                    
                    Object.entries(severityCounts).forEach(([severity, count]) => {
                        const severityColors = {
                            'critical': '#e81123',
                            'high': '#ff8c00',
                            'medium': '#ffb900',
                            'low': '#107c10',
                            'info': '#0078d4'
                        };
                        html += \`
                            <div class="tooltip-detail">
                                <span class="tooltip-label" style="color: \${severityColors[severity] || '#605e5c'}">\${severity}:</span>
                                <span class="tooltip-value">\${count} issues</span>
                            </div>
                        \`;
                    });
                    
                    // Add security score if available
                    if (node.overallSecurityScore !== undefined) {
                        html += \`
                            <div class="tooltip-detail">
                                <span class="tooltip-label">Security Score:</span>
                                <span class="tooltip-value">\${node.overallSecurityScore}/100</span>
                            </div>
                        \`;
                    }
                }
                
                // Add network information
                if (node.cidrRange) {
                    html += \`
                        <div class="tooltip-detail">
                            <span class="tooltip-label">CIDR Range:</span>
                            <span class="tooltip-value">\${node.cidrRange}</span>
                        </div>
                    \`;
                }
                
                if (node.hasPrivateEndpoint) {
                    html += \`
                        <div class="tooltip-detail">
                            <span class="tooltip-label">Private Endpoint:</span>
                            <span class="tooltip-value" style="color: #107c10">✓ Configured</span>
                        </div>
                    \`;
                }
                
                // Add data flows
                if (node.dataFlows && node.dataFlows.length > 0) {
                    html += \`<div class="tooltip-detail" style="margin-top: 8px; border-top: 1px solid #eee; padding-top: 8px;">
                        <span class="tooltip-label">Data Flows:</span>
                        <span class="tooltip-value">\${node.dataFlows.length} outgoing</span>
                    </div>\`;
                    
                    node.dataFlows.forEach(flow => {
                        const targetNode = diagramNodes.find(n => n.id === flow.targetId);
                        if (targetNode) {
                            html += \`
                                <div class="tooltip-detail">
                                    <span class="tooltip-label">→ \${flow.label || 'Flow'}:</span>
                                    <span class="tooltip-value">\${targetNode.name}</span>
                                </div>
                            \`;
                        }
                    });
                }
                
                // Add level information
                if (node.level !== undefined) {
                    html += \`
                        <div class="tooltip-detail">
                            <span class="tooltip-label">Level:</span>
                            <span class="tooltip-value">\${node.level}</span>
                        </div>
                    \`;
                }
                
                if (node.isGroupContainer) {
                    html += \`
                        <div class="tooltip-detail">
                            <span class="tooltip-label">Type:</span>
                            <span class="tooltip-value">Resource Group Container</span>
                        </div>
                        <div class="tooltip-detail">
                            <span class="tooltip-label">Contains:</span>
                            <span class="tooltip-value">\${node.children ? node.children.length : 0} resources</span>
                        </div>
                    \`;
                }
                
                if (resource && resource.file) {
                    html += \`
                        <div class="tooltip-detail">
                            <span class="tooltip-label">File:</span>
                            <span class="tooltip-value">\${resource.file}\${resource.line ? ':' + resource.line : ''}</span>
                        </div>
                    \`;
                }
                
                if (resource && resource.modulePath) {
                    html += \`
                        <div class="tooltip-detail">
                            <span class="tooltip-label">Module:</span>
                            <span class="tooltip-value">\${resource.modulePath}</span>
                        </div>
                    \`;
                }
                
                tooltip.innerHTML = html;
                tooltip.style.opacity = '1';
                
                // Position tooltip near mouse
                updateTooltipPosition(event);
                
                // Store reference to remove listener later
                const updatePosition = (e) => updateTooltipPosition(e);
                document.addEventListener('mousemove', updatePosition);
                
                // Store reference to remove listener later
                tooltip._updatePosition = updatePosition;
            }
            
            function updateTooltipPosition(event) {
                const tooltip = document.getElementById('tooltip');
                if (!tooltip) return;
                
                const padding = 15;
                const maxX = window.innerWidth - tooltip.offsetWidth - padding;
                const maxY = window.innerHeight - tooltip.offsetHeight - padding;
                
                let x = event.clientX + padding;
                let y = event.clientY + padding;
                
                // Ensure tooltip stays within viewport
                x = Math.min(x, maxX);
                y = Math.min(y, maxY);
                
                tooltip.style.left = x + 'px';
                tooltip.style.top = y + 'px';
            }
            
            function hideTooltip() {
                const tooltip = document.getElementById('tooltip');
                if (tooltip && tooltip._updatePosition) {
                    document.removeEventListener('mousemove', tooltip._updatePosition);
                    tooltip._updatePosition = null;
                }
                if (tooltip) {
                    tooltip.style.opacity = '0';
                }
            }
            
            function getResourceInfo(type) {
                // Use server-side data if available
                if (resourceInfos && resourceInfos[type]) {
                    return resourceInfos[type];
                }
                
                // Fallback to client-side mapping
                const categoryColors = {
                    'Compute': '#0078D4',
                    'Networking': '#107C10',
                    'Storage': '#0078D4',
                    'Databases': '#D13438',
                    'Analytics': '#8661C5',
                    'AI + Machine Learning': '#8661C5',
                    'Integration': '#CA5010',
                    'Security': '#FFB900',
                    'Identity': '#CA5010',
                    'Monitoring + Management': '#4F6BED',
                    'Web': '#68217A',
                    'Containers': '#0078D4',
                    'General': '#505050'
                };
                
                // Determine category
                let category = 'General';
                if (type.startsWith('azurerm_')) {
                    if (type.includes('network') || type.includes('subnet') || type.includes('ip') || type.includes('gateway') || type.includes('security_group')) {
                        category = 'Networking';
                    } else if (type.includes('storage')) {
                        category = 'Storage';
                    } else if (type.includes('sql') || type.includes('database') || type.includes('cosmos') || type.includes('redis') || type.includes('mysql') || type.includes('postgresql')) {
                        category = 'Databases';
                    } else if (type.includes('app') || type.includes('function') || type.includes('service')) {
                        category = 'Web';
                    } else if (type.includes('vm') || type.includes('machine') || type.includes('compute') || type.includes('kubernetes') || type.includes('container')) {
                        category = 'Compute';
                    } else if (type.includes('key') || type.includes('security') || type.includes('role')) {
                        category = 'Security';
                    } else if (type.includes('monitor') || type.includes('alert') || type.includes('log')) {
                        category = 'Monitoring + Management';
                    }
                } else if (type === 'module' || type === 'category') {
                    category = 'General';
                }
                
                return {
                    displayName: type === 'category' ? 'Category Header' : 
                               type.replace('azurerm_', '').split('_').map(word => 
                                   word.charAt(0).toUpperCase() + word.slice(1)
                               ).join(' '),
                    category: category,
                    color: categoryColors[category] || '#505050'
                };
            }
            
            function setupEventListeners() {
                const container = document.getElementById('diagramContainer');
                const canvas = document.getElementById('diagramCanvas');
                
                // Zoom controls
                document.getElementById('zoomIn').addEventListener('click', () => {
                    zoom *= 1.2;
                    updateTransform();
                });
                
                document.getElementById('zoomOut').addEventListener('click', () => {
                    zoom /= 1.2;
                    updateTransform();
                });
                
                document.getElementById('resetView').addEventListener('click', () => {
                    zoom = 1;
                    offsetX = 0;
                    offsetY = 0;
                    updateTransform();
                });
                
                document.getElementById('fitToScreen').addEventListener('click', fitToScreen);
                
                // Pan with mouse
                container.addEventListener('mousedown', (e) => {
                    if (e.button === 0) { // Left click only
                        isDragging = true;
                        lastX = e.clientX;
                        lastY = e.clientY;
                        container.style.cursor = 'grabbing';
                        e.preventDefault();
                    }
                });
                
                container.addEventListener('mousemove', (e) => {
                    if (isDragging) {
                        const dx = e.clientX - lastX;
                        const dy = e.clientY - lastY;
                        offsetX += dx / zoom;
                        offsetY += dy / zoom;
                        lastX = e.clientX;
                        lastY = e.clientY;
                        updateTransform();
                    }
                });
                
                document.addEventListener('mouseup', () => {
                    if (isDragging) {
                        isDragging = false;
                        container.style.cursor = 'default';
                    }
                });
                
                document.addEventListener('mouseleave', () => {
                    if (isDragging) {
                        isDragging = false;
                        container.style.cursor = 'default';
                    }
                });
                
                // Zoom with mouse wheel
                container.addEventListener('wheel', (e) => {
                    e.preventDefault();
                    const delta = e.deltaY > 0 ? 0.9 : 1.1;
                    const mouseX = e.clientX - container.getBoundingClientRect().left;
                    const mouseY = e.clientY - container.getBoundingClientRect().top;
                    
                    const worldX = (mouseX / zoom) - offsetX;
                    const worldY = (mouseY / zoom) - offsetY;
                    
                    zoom *= delta;
                    zoom = Math.max(0.1, Math.min(5, zoom)); // Clamp zoom
                    
                    offsetX = (mouseX / zoom) - worldX;
                    offsetY = (mouseY / zoom) - worldY;
                    
                    updateTransform();
                });
                
                // Click on background to deselect
                container.addEventListener('click', (e) => {
                    if (e.target === container || e.target === canvas) {
                        if (selectedNode) {
                            const prevNode = document.getElementById(\`node-\${selectedNode.id}\`);
                            if (prevNode) {
                                prevNode.style.outline = '';
                                prevNode.style.outlineOffset = '';
                            }
                            selectedNode = null;
                        }
                    }
                });
            }
            
            function setupSearch() {
                const searchInput = document.getElementById('searchInput');
                const resourceTypeItems = document.querySelectorAll('.resource-type-item');
                
                searchInput.addEventListener('input', (e) => {
                    const searchTerm = e.target.value.toLowerCase();
                    
                    resourceTypeItems.forEach(item => {
                        const type = item.getAttribute('data-type');
                        const displayName = item.querySelector('.resource-type-name').textContent.toLowerCase();
                        
                        if (displayName.includes(searchTerm) || type.toLowerCase().includes(searchTerm)) {
                            item.style.display = 'flex';
                        } else {
                            item.style.display = 'none';
                        }
                    });
                    
                    // Also filter nodes on diagram
                    diagramNodes.forEach(node => {
                        const nodeEl = document.getElementById(\`node-\${node.id}\`);
                        if (nodeEl) {
                            const resourceInfo = getResourceInfo(node.type);
                            const matchesSearch = 
                                node.name.toLowerCase().includes(searchTerm) ||
                                node.type.toLowerCase().includes(searchTerm) ||
                                resourceInfo.displayName.toLowerCase().includes(searchTerm) ||
                                resourceInfo.category.toLowerCase().includes(searchTerm);
                            
                            nodeEl.style.opacity = matchesSearch ? '1' : '0.3';
                            nodeEl.style.pointerEvents = matchesSearch ? 'auto' : 'none';
                        }
                    });
                });
                
                // Click on resource type to highlight those nodes
                resourceTypeItems.forEach(item => {
                    item.addEventListener('click', () => {
                        const type = item.getAttribute('data-type');

                        diagramNodes.forEach(node => {
                            const nodeEl = document.getElementById(\`node-\${node.id}\`);
                            if (nodeEl) {
                                if (node.type === type) {
                                    nodeEl.style.outline = '2px solid rgba(16, 124, 16, 0.5)';
                                    nodeEl.style.outlineOffset = '4px';
                                    nodeEl.style.opacity = '1';
                                    nodeEl.style.pointerEvents = 'auto';
                                } else {
                                    nodeEl.style.opacity = '0.3';
                                    nodeEl.style.pointerEvents = 'none';
                                    nodeEl.style.outline = '';
                                    nodeEl.style.outlineOffset = '';
                                }
                            }
                        });

                        // Reset after 5 seconds
                        setTimeout(() => {
                            diagramNodes.forEach(node => {
                                const nodeEl = document.getElementById(\`node-\${node.id}\`);
                                if (nodeEl) {
                                    nodeEl.style.opacity = '1';
                                    nodeEl.style.pointerEvents = 'auto';
                                    nodeEl.style.outline = '';
                                    nodeEl.style.outlineOffset = '';
                                }
                            });
                        }, 5000);
                    });
                });
            }
            
            function fitToScreen() {
                const container = document.getElementById('diagramContainer');
                const canvas = document.getElementById('diagramCanvas');
                
                if (diagramNodes.length === 0) return;
                
                // Find bounds of all nodes
                let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                diagramNodes.forEach(node => {
                    minX = Math.min(minX, node.x);
                    maxX = Math.max(maxX, node.x + (node.width || 200));
                    minY = Math.min(minY, node.y);
                    maxY = Math.max(maxY, node.y + (node.height || 120));
                });
                
                // Add padding
                const padding = 100;
                minX -= padding;
                maxX += padding;
                minY -= padding;
                maxY += padding;
                
                const diagramWidth = maxX - minX;
                const diagramHeight = maxY - minY;
                const containerWidth = container.clientWidth;
                const containerHeight = container.clientHeight;
                
                // Calculate zoom to fit
                const zoomX = containerWidth / diagramWidth;
                const zoomY = containerHeight / diagramHeight;
                zoom = Math.min(zoomX, zoomY, 1); // Don't zoom in more than 100%
                
                // Center the diagram
                offsetX = -minX + (containerWidth / zoom - diagramWidth) / 2;
                offsetY = -minY + (containerHeight / zoom - diagramHeight) / 2;
                
                updateTransform();
            }
            
            function updateTransform() {
                const canvas = document.getElementById('diagramCanvas');
                if (canvas) {
                    canvas.style.transform = \`scale(\${zoom}) translate(\${offsetX}px, \${offsetY}px)\`;
                    canvas.style.transformOrigin = '0 0';
                }
            }
            
            // Send loaded message
            vscode.postMessage({
                command: 'webviewReady',
                data: {
                    resourceCount: resources.length,
                    nodeCount: diagramNodes.length,
                    nodesWithConnections: diagramNodes.filter(n => n.connections && n.connections.length > 0).length,
                    groupNodes: diagramNodes.filter(n => n.isGroupContainer).length,
                    nodesWithCostBadges: diagramNodes.filter(n => n.costBadge).length,
                    nodesWithSecurityBadges: diagramNodes.filter(n => n.securityBadges && n.securityBadges.length > 0).length
                }
            });
        </script>
    </body>
    </html>
    `;
}

export function deactivate() {
    console.log('Azure Terraform Diagram extension deactivated');
}