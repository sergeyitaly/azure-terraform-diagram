# Azure Terraform Diagram

Generate beautiful Microsoft Azure-style infrastructure diagrams from your Terraform projects automatically.

## Features

- **Auto-generate diagrams on save** - Automatically creates `architecture.png` when you save any `.tf` file
- **Resource Group Grouping** - Resources are visually grouped inside their resource groups for clear organization
- **Rich DevOps Details** - Displays CIDR ranges, SKUs, VM sizes, TLS versions, scaling configs, backup policies, and more
- **Multi-project Support** - Each Terraform project folder gets its own separate diagram
- **Interactive webview** - Explore your infrastructure with pan, zoom, and click-to-navigate
- **Azure-style visuals** - Uses official Microsoft Azure icons and color schemes
- **Dependency visualization** - Shows connections between resources with smart orthogonal routing
- **Resource tooltips** - Hover for full details, click to jump to source code

## Installation

### From VS Code Marketplace

Search for "Azure Terraform Diagram" in VS Code Extensions, or install from:
https://marketplace.visualstudio.com/items?itemName=SerhiiVoinolovych.azure-terraform-diagram

### From VSIX

1. Download the `.vsix` file
2. In VS Code, open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
3. Run "Extensions: Install from VSIX..."
4. Select the downloaded file

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
| `azureTerraformDiagram.scopeToFolder` | `true` | When true, generates diagram only for the folder containing the saved .tf file |
| `azureTerraformDiagram.theme` | `auto` | Diagram color theme (auto, light, dark) |
| `azureTerraformDiagram.showModuleDetails` | `true` | Show detailed module information |
| `azureTerraformDiagram.excludeResourceTypes` | `[]` | Resource types to exclude (e.g., `azurerm_role_assignment`) |

## DevOps-Relevant Details

The diagram displays comprehensive technical details that DevOps engineers need:

### Network & Connectivity
| Resource | Details Shown |
|----------|---------------|
| Virtual Network | CIDR address space, DNS servers, location |
| Subnet | CIDR prefix, service endpoints, delegations |
| Network Interface | Private IP, allocation method, accelerated networking |
| Public IP | Allocation method, SKU, tier, zones, DNS label |
| NSG | Rule count, ports (allow/deny), direction |
| VNet Peering | VNet access, forwarding, gateway transit |

### Compute & Scaling
| Resource | Details Shown |
|----------|---------------|
| Virtual Machine | Size, OS image, disk type/size, zone, admin user |
| VM Scale Set | SKU, instance count, zones, upgrade policy |
| AKS | K8s version, node pool VM size, node count, autoscale range, CNI plugin, network policy |
| AKS Node Pool | VM size, node count, autoscale, zones, taints, labels |
| App Service | Runtime, TLS version, always on, HTTPS, VNet integration |
| Function App | Runtime version, OS type, scaling settings |
| Container Group | OS type, CPU, memory, ports, restart policy |

### Storage & Data
| Resource | Details Shown |
|----------|---------------|
| Storage Account | Tier + replication (e.g., `Standard_LRS`), kind, access tier, TLS version, HTTPS only |
| SQL Server | Version, admin login, TLS version, public/private access |
| SQL Database | SKU, max size, zone redundant, geo backup, PITR retention |
| PostgreSQL/MySQL | SKU, version, storage size, SSL enforcement, backup retention |
| Cosmos DB | Offer type, kind, consistency level, regions, multi-write |
| Redis Cache | SKU, family, capacity, TLS, shards, replicas, eviction policy |

### Security & Identity
| Resource | Details Shown |
|----------|---------------|
| Key Vault | SKU, retention days, purge protection, RBAC, deployment flags |
| Firewall | SKU, tier, threat intel mode, zones, policy |
| Application Gateway | SKU, tier, capacity, autoscale, WAF, HTTP/2 |
| Bastion | SKU, copy/paste, file copy, tunneling, scale units |
| Private Endpoint | Subresource type, manual approval, DNS zone |
| Role Assignment | Role name, principal type |

### Monitoring & Management
| Resource | Details Shown |
|----------|---------------|
| Log Analytics | SKU, retention days, daily quota |
| Application Insights | App type, retention, sampling %, daily cap |
| Action Group | Email/SMS/webhook receivers |
| Recovery Vault | SKU, soft delete, storage mode, cross-region |
| Backup Policy | Frequency, daily/weekly/monthly retention |

### Integration & Messaging
| Resource | Details Shown |
|----------|---------------|
| Event Hub | SKU, capacity, auto-inflate, max throughput units |
| Service Bus | SKU, capacity, zone redundant, partitions |
| API Management | SKU, publisher, VNet type, zones |

## Layout

Resources are automatically grouped by **Resource Group** for clear organization:

```
┌─────────────── Resource Group: rg-production ───────────────┐
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Virtual Net  │  │   Subnet     │  │     NSG      │       │
│  │ 10.0.0.0/16  │  │ 10.0.1.0/24  │  │  5 rules     │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐                         │
│  │  Linux VM    │  │   Storage    │                         │
│  │ Standard_D2s │  │ Standard_LRS │                         │
│  └──────────────┘  └──────────────┘                         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

Within each resource group, resources are organized by type with multiple instances displayed horizontally.

## Supported Azure Resources (100+)

**Compute**: Virtual Machines, VM Scale Sets, App Services, Function Apps, AKS, Container Instances, Container Registry, Batch

**Networking**: Virtual Networks, Subnets, NSGs, Load Balancers, Application Gateway, Azure Firewall, Bastion, VPN Gateway, Express Route, NAT Gateway, Private Endpoints, DNS Zones, Front Door, CDN

**Storage & Databases**: Storage Accounts, Blob Containers, File Shares, Managed Disks, SQL Server/Database, PostgreSQL, MySQL, Cosmos DB, Redis Cache

**Security & Identity**: Key Vault, Managed Identities, Role Assignments, Firewall Policies

**Monitoring**: Log Analytics, Application Insights, Action Groups, Metric Alerts, Diagnostic Settings

**Integration**: Event Hub, Service Bus, API Management, Logic Apps

**Backup & Recovery**: Recovery Services Vault, Backup Policies

## Requirements

- VS Code 1.80.0 or higher
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

### Resources from multiple folders mixed together

- Enable `scopeToFolder` setting (enabled by default)
- Right-click on specific folder to generate diagram for just that folder

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
│   ├── diagramLayout.ts    # Layout algorithms (zone & resource group grouping)
│   ├── diagramRenderer.ts  # SVG/PNG generation with DevOps details
│   └── azureIconMapper.ts  # Resource to icon mapping
├── resources/
│   └── azure-icons/        # Azure service icons
├── media/
│   └── icon.png           # Extension icon
├── package.json
└── tsconfig.json
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

GitHub: https://github.com/sergeyitaly/azure-terraform-diagram

---

**Tip:** Add `architecture.png` to your git repository to share infrastructure diagrams with your team!
