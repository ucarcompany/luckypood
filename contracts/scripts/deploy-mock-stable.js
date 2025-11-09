require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const RPC = process.env.BSC_TESTNET_RPC_URL;
const MNEMONIC = process.env.MNEMONIC;
if (!RPC || !MNEMONIC) throw new Error('Set BSC_TESTNET_RPC_URL and MNEMONIC in contracts/.env');

const provider = new ethers.JsonRpcProvider(RPC);
const wallet = ethers.Wallet.fromPhrase(MNEMONIC).connect(provider);

function loadArtifact(name) {
  const p = path.resolve(__dirname, '..', 'build', 'contracts', `${name}.json`);
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function updateEnv(key, value) {
  const envPath = path.resolve(__dirname, '..', '.env');
  let content = '';
  try { content = fs.readFileSync(envPath, 'utf-8'); } catch {}
  const line = `${key}="${value}"`;
  if (content.includes(`${key}=`)) {
    content = content.replace(new RegExp(`^${key}.*$`, 'm'), line);
  } else {
    content += (content.endsWith('\n') ? '' : '\n') + line + '\n';
  }
  fs.writeFileSync(envPath, content, 'utf-8');
  console.log(`[env] ${key} updated -> ${value}`);
}

(async () => {
  console.log('Deploying MockERC20 (MockUSD, 18 decimals) to BSC Testnet...');
  const art = loadArtifact('MockERC20');
  const factory = new ethers.ContractFactory(art.abi, art.bytecode, wallet);
  const tx = await factory.deploy();
  console.log('  tx hash =', tx.deploymentTransaction().hash);
  const deployed = await tx.waitForDeployment();
  const addr = await deployed.getAddress();
  console.log('MockERC20 deployed at:', addr);
  updateEnv('STABLECOIN_ADDRESS_TESTNET', addr);

  // Optional: mint some tokens to deployer (10,000 mUSD)
  const token = new ethers.Contract(addr, art.abi, wallet);
  const amount = ethers.parseUnits('10000', 18);
  const mintTx = await token.mint(await wallet.getAddress(), amount);
  await mintTx.wait();
  console.log('Minted 10,000 mUSD to', await wallet.getAddress());
})();
