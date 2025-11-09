require('dotenv').config()
const { ethers } = require('hardhat')

const COORDINATOR = process.env.VRF_COORDINATOR
const SUB_ID = process.env.VRF_SUBSCRIPTION_ID

const coordAbi = [
  'function getSubscription(uint64 subId) external view returns (uint96 balance, uint64 reqCount, address owner, address[] consumers)'
]

async function main() {
  if (!COORDINATOR) throw new Error('Missing VRF_COORDINATOR in .env')
  if (!SUB_ID) throw new Error('Missing VRF_SUBSCRIPTION_ID in .env')
  const [signer] = await ethers.getSigners()
  const provider = signer.provider
  const coord = new ethers.Contract(COORDINATOR, coordAbi, provider)
  const sub = await coord.getSubscription(BigInt(SUB_ID))
  console.log('Subscription', SUB_ID, 'details:')
  console.log({
    balance: sub.balance.toString(),
    reqCount: Number(sub.reqCount),
    owner: sub.owner,
    consumers: sub.consumers
  })
}

main().catch(e=>{ console.error(e); process.exit(1) })
