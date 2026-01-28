// Simple test to verify our extension logic works
const fs = require('fs');
const path = require('path');

function findTerraformFiles(dir) {
    const files = [];
    
    function scanDirectory(currentDir) {
        try {
            const items = fs.readdirSync(currentDir, { withFileTypes: true });
            
            for (const item of items) {
                const fullPath = path.join(currentDir, item.name);
                
                if (item.isDirectory()) {
                    if (!item.name.startsWith('.') && 
                        item.name !== 'node_modules' && 
                        item.name !== '.terraform') {
                        scanDirectory(fullPath);
                    }
                } else if (item.isFile() && item.name.endsWith('.tf')) {
                    files.push(fullPath);
                }
            }
        } catch (error) {
            console.error(`Error scanning directory ${currentDir}:`, error);
        }
    }
    
    scanDirectory(dir);
    return files;
}

// Test with our sample Terraform directory
const testDir = './test-terraform';
if (fs.existsSync(testDir)) {
    const tfFiles = findTerraformFiles(testDir);
    console.log(`Found ${tfFiles.length} Terraform files:`);
    tfFiles.forEach(file => console.log(`  - ${file}`));
    
    // Analyze resources
    let resourceCount = 0;
    tfFiles.forEach(file => {
        try {
            const content = fs.readFileSync(file, 'utf8');
            const lines = content.split('\n');
            lines.forEach(line => {
                const trimmed = line.trim();
                const resourceMatch = trimmed.match(/resource\s+"(azurerm_[^"]+)"\s+"([^"]+)"/);
                if (resourceMatch) {
                    resourceCount++;
                    console.log(`    Resource: ${resourceMatch[1]} -> ${resourceMatch[2]}`);
                }
            });
        } catch (error) {
            console.error(`Error reading ${file}:`, error);
        }
    });
    console.log(`Total resources found: ${resourceCount}`);
} else {
    console.log(`Test directory ${testDir} not found. Run the previous commands to create it.`);
}
