require('dotenv').config()
const { ethers } = require('hardhat')

const FACTORY = process.env.FACTORY_ADDRESS || process.env.VITE_FACTORY_ADDRESS
const COORDINATOR = process.env.VRF_COORDINATOR
const SUB_ID = process.env.VRF_SUBSCRIPTION_ID

const factoryAbi = [
  'function getPools() view returns (address[])'
]
const coordAbi = [
  'function getSubscription(uint64 subId) external view returns (uint96 balance, uint64 reqCount, address owner, address[] consumers)',
  'function addConsumer(uint64 subId, address consumer) external'
]

async function main() {
  if (!FACTORY) throw new Error('Missing FACTORY_ADDRESS in .env')
  if (!COORDINATOR) throw new Error('Missing VRF_COORDINATOR in .env')
  if (!SUB_ID) throw new Error('Missing VRF_SUBSCRIPTION_ID in .env')
  const [signer] = await ethers.getSigners()
  console.log('Signer:', await signer.getAddress())
  const provider = signer.provider
  const fac = new ethers.Contract(FACTORY, factoryAbi, provider)
  const coord = new ethers.Contract(COORDINATOR, coordAbi, signer)

  const pools = await fac.getPools()
  console.log('Pools:', pools.length)

  // read existing consumers
  const sub = await coord.getSubscription(BigInt(SUB_ID))
  const existing = new Set(sub.consumers.map(a => a.toLowerCase()))

  for (const p of pools) {
    if (existing.has(p.toLowerCase())) {
      console.log('Already consumer:', p)
      continue
    }
    console.log('Adding consumer:', p)
    try {
      const tx = await coord.addConsumer(BigInt(SUB_ID), p)
      await tx.wait()
      console.log('Added:', p, 'tx', tx.hash)
    } catch (e) {
      console.error('Failed to add', p, e?.message || e)
    }
  }
}

main().catch(e=>{ console.error(e); process.exit(1) })
