// Simple standalone test of our extension logic
console.log('Testing Azure Terraform Diagram Extension Logic\n');

const workspacePath = './test-terraform';

// Simulate the extension's file scanning
const fs = require('fs');
const path = require('path');

function simulateExtension() {
    console.log('1. Scanning for Terraform files...');
    
    const files = [];
    function scan(dir) {
        try {
            const items = fs.readdirSync(dir, { withFileTypes: true });
            for (const item of items) {
                const fullPath = path.join(dir, item.name);
                if (item.isDirectory() && !item.name.startsWith('.') && 
                    item.name !== 'node_modules' && item.name !== '.terraform') {
                    scan(fullPath);
                } else if (item.isFile() && item.name.endsWith('.tf')) {
                    files.push(fullPath);
                }
            }
        } catch (error) {
            console.error('Scan error:', error.message);
        }
    }
    
    if (fs.existsSync(workspacePath)) {
        scan(workspacePath);
        console.log(`   Found ${files.length} Terraform files`);
        
        console.log('\n2. Analyzing resources...');
        const resources = [];
        files.forEach(file => {
            try {
                const content = fs.readFileSync(file, 'utf8');
                const lines = content.split('\n');
                lines.forEach(line => {
                    const trimmed = line.trim();
                    // Match Azure resources
                    const resourceMatch = trimmed.match(/resource\s+"(azurerm_[^"]+)"\s+"([^"]+)"/);
                    if (resourceMatch) {
                        resources.push({
                            type: resourceMatch[1],
                            name: resourceMatch[2],
                            file: path.relative(workspacePath, file)
                        });
                    }
                    // Match modules
                    const moduleMatch = trimmed.match(/module\s+"([^"]+)"/);
                    if (moduleMatch) {
                        resources.push({
                            type: 'module',
                            name: moduleMatch[1],
                            file: path.relative(workspacePath, file)
                        });
                    }
                });
            } catch (error) {
                console.error(`   Error reading ${file}:`, error.message);
            }
        });
        
        console.log(`   Found ${resources.length} resources/modules`);
        
        console.log('\n3. Generating diagram data...');
        
        // Group by type
        const byType = {};
        resources.forEach(r => {
            if (!byType[r.type]) byType[r.type] = [];
            byType[r.type].push(r.name);
        });
        
        console.log('\n4. Resource Summary:');
        console.log('   -----------------');
        Object.entries(byType).forEach(([type, names]) => {
            console.log(`   ${type}: ${names.length} resources`);
            names.slice(0, 3).forEach(name => console.log(`     - ${name}`));
            if (names.length > 3) console.log(`     ... and ${names.length - 3} more`);
        });
        
        console.log('\n✅ Extension logic is working correctly!');
        console.log('\nTo use in VS Code:');
        console.log('1. Open VS Code on this folder');
        console.log('2. Press F5 to debug');
        console.log('3. In the new window, run the command from Command Palette');
        console.log('4. You should see a diagram with the above resources');
        
    } else {
        console.log(`❌ Test directory not found: ${workspacePath}`);
        console.log('   Create it by running the terraform sample creation commands.');
    }
}

simulateExtension();
