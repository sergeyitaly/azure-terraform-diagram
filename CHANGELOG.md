# Changelog

All notable changes to the Azure Infrastructure Diagram extension will be documented in this file.

## [0.1.0] - 2026-01-28

### Added
- Initial release
- Auto-generate `architecture.png` on saving `.tf` files
- Interactive webview with pan, zoom, and search
- Vertical layout with Azure zone grouping (Edge, DMZ, Application, Data, etc.)
- Resource details display (IP prefixes, SKUs, sizes, versions)
- Smart orthogonal connection routing
- Support for 100+ Azure resource types
- Official Microsoft Azure icons
- Click-to-navigate to source code
- Configurable output file name
- SVG fallback when PNG generation unavailable

### Supported Resource Details
- Virtual Networks: address space
- Subnets: CIDR prefixes
- NICs: private IPs
- Public IPs: allocation method, SKU
- NSGs: rule count
- VMs: size
- Storage Accounts: tier, replication
- SQL Databases: SKU, size
- AKS: Kubernetes version, SKU tier
- App Services: SKU, HTTPS
- Firewalls: SKU name/tier
- Key Vaults: SKU, retention
- And many more...
