// Deploy LuckyPoolFactory to BSC Testnet using ethers and existing build artifact
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const RPC = process.env.BSC_TESTNET_RPC_URL;
const MNEMONIC = process.env.MNEMONIC;
const STABLE = process.env.STABLECOIN_ADDRESS_TESTNET;
const VRF_COORD = process.env.VRF_COORDINATOR;
const VRF_KEYHASH = process.env.VRF_KEYHASH;
const VRF_SUBID = process.env.VRF_SUBSCRIPTION_ID;
const TREASURY = process.env.TREASURY_ADDRESS;

if (!RPC) throw new Error('BSC_TESTNET_RPC_URL not set');
if (!MNEMONIC) throw new Error('MNEMONIC not set');
if (!STABLE) throw new Error('STABLECOIN_ADDRESS_TESTNET not set');
if (!VRF_COORD || !VRF_KEYHASH) throw new Error('VRF params not set');
if (!VRF_SUBID) throw new Error('VRF_SUBSCRIPTION_ID not set');
if (!TREASURY) throw new Error('TREASURY_ADDRESS not set');

const provider = new ethers.JsonRpcProvider(RPC);
const wallet = ethers.Wallet.fromPhrase(MNEMONIC).connect(provider);

function loadArtifact(name) {
  const p = path.resolve(__dirname, '..', 'build', 'contracts', `${name}.json`);
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function updateFrontendEnv(filePath, key, value) {
  let content = '';
  try { content = fs.readFileSync(filePath, 'utf-8'); } catch {}
  const line = `${key}=${value}`;
  if (content.includes(`${key}=`)) {
    content = content.replace(new RegExp(`^${key}.*$`, 'm'), line);
  } else {
    content += (content.endsWith('\n') ? '' : '\n') + line + '\n';
  }
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`[env] ${path.relative(process.cwd(), filePath)} -> ${key}=${value}`);
}

(async () => {
  console.log('Deploying LuckyPoolFactory to BSC Testnet...');
  const art = loadArtifact('LuckyPoolFactory');
  const factory = new ethers.ContractFactory(art.abi, art.bytecode, wallet);
  const owner = await wallet.getAddress();

  const ticketPrice = ethers.parseUnits('1', 18); // $1 with 18 decimals
  const countdownSeconds = 3n * 24n * 60n * 60n; // 3 days
  const refundDeadlineSeconds = 15n * 24n * 60n * 60n; // 15 days

  const tx = await factory.deploy(
    owner,
    STABLE,
    ticketPrice,
    countdownSeconds,
    refundDeadlineSeconds,
    VRF_COORD,
    VRF_KEYHASH,
    BigInt(VRF_SUBID),
    TREASURY
  );
  console.log('  tx hash =', tx.deploymentTransaction().hash);
  const deployed = await tx.waitForDeployment();
  const addr = await deployed.getAddress();
  console.log('Factory deployed at:', addr);

  // Write to frontends .env
  const feEnv = path.resolve(__dirname, '..', '..', 'frontend', '.env');
  const adEnv = path.resolve(__dirname, '..', '..', 'admin', '.env');
  updateFrontendEnv(feEnv, 'VITE_FACTORY_ADDRESS', addr);
  updateFrontendEnv(adEnv, 'VITE_FACTORY_ADDRESS', addr);
})();
