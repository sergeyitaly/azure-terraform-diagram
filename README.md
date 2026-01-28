# Azure Terraform Diagram

Generate beautiful Microsoft Azure-style infrastructure diagrams from your Terraform projects automatically.

## Features

- **Auto-generate diagrams on save** - Automatically creates `architecture.png` when you save any `.tf` file
- **Rich resource details** - Displays IP prefixes, SKUs, sizes, versions, and other crucial DevOps info directly on the diagram
- **Interactive webview** - Explore your infrastructure with pan, zoom, and click-to-navigate
- **Smart layout** - Vertical flow with resources grouped by Azure zones (Edge, DMZ, Application, Data, etc.)
- **Azure-style visuals** - Uses official Microsoft Azure icons and color schemes
- **Dependency visualization** - Shows connections between resources with smart orthogonal routing
- **Resource tooltips** - Hover for full details, click to jump to source code

## Installation

### From VSIX

1. Download the `.vsix` file
2. In VS Code, open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
3. Run "Extensions: Install from VSIX..."
4. Select the downloaded file

### From Source

```bash
git clone <repository-url>
cd azure-terraform-diagram
npm install
npm run compile
```

Then press `F5` in VS Code to launch the extension in development mode.

## Usage

### Automatic Diagram Generation

Simply save any `.tf` file in your workspace. The extension automatically:
1. Parses Terraform files in the **same folder** as the saved file
2. Generates an `architecture.png` in that folder
3. Shows a status bar confirmation

This allows you to have **multiple Terraform projects** in one workspace (e.g., `task01/`, `task02/`) and each will get its own separate `architecture.png`.

### Generate Diagram for Specific Folder

Right-click on any folder in the VS Code Explorer and select **"Generate Azure Infrastructure Diagram"** to generate a diagram for just that folder's Terraform resources.

### Manual Commands

Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and run:

| Command | Description |
|---------|-------------|
| `Azure Terraform: Generate Azure Infrastructure Diagram` | Opens interactive diagram in a new panel |
| `Azure Terraform: Export Architecture Diagram as PNG` | Manually exports diagram to PNG file |

### Interactive Diagram Controls

- **Pan** - Click and drag to move around
- **Zoom** - Mouse wheel or use the `+`/`-` buttons
- **Fit to Screen** - Click the fit button to see all resources
- **Search** - Filter resources by name or type
- **Click resource** - Opens the source `.tf` file at the resource definition

## Configuration

Configure the extension in VS Code Settings (`Cmd+,` / `Ctrl+,`):

| Setting | Default | Description |
|---------|---------|-------------|
| `azureTerraformDiagram.autoGenerateOnSave` | `true` | Automatically generate architecture.png when saving .tf files |
| `azureTerraformDiagram.outputFileName` | `architecture.png` | Output file name for the generated diagram |
| `azureTerraformDiagram.scopeToFolder` | `true` | When true, generates diagram only for the folder containing the saved .tf file. When false, generates for entire workspace. |
| `azureTerraformDiagram.theme` | `auto` | Diagram color theme (auto, light, dark) |
| `azureTerraformDiagram.showModuleDetails` | `true` | Show detailed module information |
| `azureTerraformDiagram.excludeResourceTypes` | `[]` | Resource types to exclude (e.g., `azurerm_role_assignment`) |

## Supported Azure Resources

The extension recognizes 100+ Azure resource types including:

**Compute**
- Virtual Machines, VM Scale Sets
- App Services, Function Apps
- Azure Kubernetes Service (AKS)
- Container Instances, Container Registry

**Networking**
- Virtual Networks, Subnets
- Network Security Groups
- Load Balancers, Application Gateway
- Azure Firewall, Bastion
- VPN Gateway, Express Route

**Storage & Databases**
- Storage Accounts
- SQL Database, SQL Server
- Cosmos DB, Redis Cache
- PostgreSQL, MySQL

**Security & Identity**
- Key Vault
- Managed Identities
- Role Assignments

**Monitoring**
- Log Analytics Workspace
- Application Insights
- Monitor Action Groups

And many more...

## Resource Details Shown

Each resource displays relevant technical details directly on the diagram:

| Resource Type | Details Shown |
|--------------|---------------|
| Virtual Network | Address space (e.g., `10.0.0.0/16`) |
| Subnet | Address prefix (e.g., `10.0.1.0/24`) |
| Network Interface | Private IP, subnet prefix |
| Public IP | IP address, allocation method, SKU |
| NSG | Number of security rules |
| Virtual Machine | VM size (e.g., `Standard_D2s_v3`) |
| Storage Account | Tier + replication (e.g., `Standard_LRS`) |
| SQL Database | SKU, max size |
| AKS | Kubernetes version, SKU tier |
| App Service | SKU, HTTPS setting |
| App Service Plan | SKU, OS type |
| Firewall | SKU name and tier |
| Application Gateway | SKU, tier, capacity |
| Key Vault | SKU, retention days |
| Redis Cache | SKU, family, capacity |
| Cosmos DB | Offer type, kind |
| Container Registry | SKU, admin status |
| Log Analytics | SKU, retention days |
| Application Insights | Application type, retention |
| Load Balancer | SKU |
| VPN Gateway | Type, SKU |

## Layout & Zones

Resources are automatically organized into architectural zones:

```
┌─────────────────────────────────────┐
│              Edge                   │  CDN, Front Door, Traffic Manager
├─────────────────────────────────────┤
│              DMZ                    │  Firewall, Bastion, NAT Gateway
├─────────────────────────────────────┤
│          Presentation               │  App Service, Static Sites
├─────────────────────────────────────┤
│          Application                │  VMs, AKS, Containers
├─────────────────────────────────────┤
│             Data                    │  SQL, Cosmos, Storage, Redis
├─────────────────────────────────────┤
│          Management                 │  Log Analytics, App Insights
├─────────────────────────────────────┤
│           Identity                  │  Key Vault, Managed Identity
└─────────────────────────────────────┘
```

Multiple resources of the same type are displayed **horizontally** within their zone.

## Example Output

Given a Terraform project with typical Azure resources, the extension generates:

```
┌──────────────────── Edge ────────────────────┐
│  [App Gateway]   [Front Door]                │
└──────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────── Application ──────────────┐
│  [App Service 1]  [App Service 2]  [AKS]     │
└──────────────────────────────────────────────┘
                      │
                      ▼
┌──────────────────── Data ────────────────────┐
│  [SQL Server]   [Storage]   [Redis Cache]    │
└──────────────────────────────────────────────┘
```

## Requirements

- VS Code 1.80.0 or higher
- Node.js 16+ (for development)
- Terraform files with Azure resources (`azurerm_*`)

### Optional Dependencies

- **sharp** - For PNG generation. If not available, the extension falls back to SVG output.

## Troubleshooting

### Diagram not generating on save

1. Check that `azureTerraformDiagram.autoGenerateOnSave` is enabled
2. Ensure your file has a `.tf` extension
3. Check the Output panel for errors

### PNG generation fails

The extension requires the `sharp` library for PNG output. If it fails:
- The extension automatically falls back to SVG format
- You can manually convert SVG to PNG using other tools

### No resources shown

- Ensure your Terraform files contain `azurerm_*` resources
- Check that files are valid Terraform syntax
- Look for parsing errors in the Output panel

## Development

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode
npm run watch

# Package extension
npm run package
```

## Project Structure

```
azure-terraform-diagram/
├── src/
│   ├── extension.ts        # Extension entry point
│   ├── terraformParser.ts  # Terraform HCL parser
│   ├── diagramLayout.ts    # Layout algorithms
│   ├── diagramRenderer.ts  # SVG/PNG generation
│   └── azureIconMapper.ts  # Resource to icon mapping
├── resources/
│   └── azure-icons/        # Azure service icons
├── package.json
└── tsconfig.json
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

---

**Tip:** Add `architecture.png` to your git repository to share infrastructure diagrams with your team!
