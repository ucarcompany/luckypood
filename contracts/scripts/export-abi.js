const fs = require('fs');
const path = require('path');

const buildDir = path.join(__dirname, '..', 'build', 'contracts');
const outDir = path.join(__dirname, '..', '..', 'shared', 'abi');

function main() {
  if (!fs.existsSync(buildDir)) {
    console.error('Build dir not found:', buildDir);
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const files = fs.readdirSync(buildDir).filter(f => f.endsWith('.json'));
  for (const f of files) {
    const p = path.join(buildDir, f);
    const json = JSON.parse(fs.readFileSync(p, 'utf8'));
    const out = {
      contractName: json.contractName,
      abi: json.abi,
      networks: json.networks || {},
    };
    fs.writeFileSync(path.join(outDir, f), JSON.stringify(out, null, 2));
  }
  console.log('ABI exported to', outDir);
}

main();
