// Minimal VRF v2 subscription tools for BSC Testnet
// Usage:
//   node scripts/vrf-tools.js create
//   node scripts/vrf-tools.js fund <subId> [amountLINK]
//   node scripts/vrf-tools.js add <subId> <consumerAddress>

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const RPC = process.env.BSC_TESTNET_RPC_URL;
const MNEMONIC = process.env.MNEMONIC;
const COORDINATOR = process.env.VRF_COORDINATOR; // e.g. 0x6A2AAd07396B36Fe02a22b33cf443582f682c82f
// BNB Chain Testnet LINK (from Chainlink docs). Override via LINK_TOKEN_TESTNET if needed.
const LINK = process.env.LINK_TOKEN_TESTNET || '0x84b9B910527Ad5C03A9Ca831909E21e236EA7b06';

if (!RPC) throw new Error('BSC_TESTNET_RPC_URL not set');
if (!MNEMONIC) throw new Error('MNEMONIC not set');
if (!COORDINATOR) throw new Error('VRF_COORDINATOR not set');

const provider = new ethers.JsonRpcProvider(RPC);
const wallet = ethers.Wallet.fromPhrase(MNEMONIC).connect(provider);

const COORDINATOR_ABI = [
  'event SubscriptionCreated(uint64 indexed subId, address owner)',
  'function createSubscription() external returns (uint64 subId)',
  'function addConsumer(uint64 subId, address consumer) external',
  'function getSubscription(uint64 subId) external view returns (uint96 balance, uint64 reqCount, address owner, address[] memory consumers)'
];

const LINK_ABI = [
  'function decimals() view returns (uint8)',
  'function transferAndCall(address to, uint256 value, bytes data) returns (bool)'
];

const coordinator = new ethers.Contract(COORDINATOR, COORDINATOR_ABI, wallet);
const link = new ethers.Contract(LINK, LINK_ABI, wallet);

async function updateEnv(key, value) {
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

async function createSub() {
  console.log('Creating VRF v2 subscription on BSC Testnet...');
  const tx = await coordinator.createSubscription();
  const rcpt = await tx.wait();
  let subId = null;
  for (const log of rcpt.logs || []) {
    try {
      const parsed = coordinator.interface.parseLog({ topics: log.topics, data: log.data });
      if (parsed && parsed.name === 'SubscriptionCreated') {
        subId = parsed.args.subId.toString();
        break;
      }
    } catch {}
  }
  if (!subId) throw new Error('Failed to parse SubscriptionCreated event');
  console.log('Created subscription id =', subId);
  await updateEnv('VRF_SUBSCRIPTION_ID', subId);
}

async function fundSub(subId, amountLinkStr) {
  if (!subId) throw new Error('subId required');
  const decimals = await link.decimals();
  const amount = ethers.parseUnits(String(amountLinkStr || '1'), decimals); // default 1 LINK
  const data = ethers.AbiCoder.defaultAbiCoder().encode(['uint64'], [BigInt(subId)]);
  console.log(`Funding subId=${subId} with ${amountLinkStr || '1'} LINK ...`);
  const tx = await link.transferAndCall(COORDINATOR, amount, data);
  await tx.wait();
  console.log('Funded');
}

async function addConsumer(subId, consumer) {
  if (!subId || !ethers.isAddress(consumer)) throw new Error('Usage: add <subId> <consumerAddress>');
  console.log(`Adding consumer ${consumer} to subId=${subId} ...`);
  const tx = await coordinator.addConsumer(BigInt(subId), consumer);
  await tx.wait();
  console.log('Consumer added');
}

(async () => {
  const [,, cmd, a1, a2] = process.argv;
  if (cmd === 'create') return createSub();
  if (cmd === 'fund') return fundSub(a1, a2);
  if (cmd === 'add') return addConsumer(a1, a2);
  console.log('Usage:\n  node scripts/vrf-tools.js create\n  node scripts/vrf-tools.js fund <subId> [amountLINK]\n  node scripts/vrf-tools.js add <subId> <consumerAddress>');
})();
