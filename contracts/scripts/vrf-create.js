require('dotenv').config()
const { ethers } = require('hardhat')

const COORDINATOR = process.env.VRF_COORDINATOR
const coordAbi = [
  'event SubscriptionCreated(uint64 indexed subId, address owner)',
  'function createSubscription() external returns (uint64 subId)'
]

async function main() {
  if (!COORDINATOR) throw new Error('Missing VRF_COORDINATOR in .env')
  const [signer] = await ethers.getSigners()
  console.log('Signer:', await signer.getAddress())
  const coord = new ethers.Contract(COORDINATOR, coordAbi, signer)
  const tx = await coord.createSubscription()
  const rc = await tx.wait()
  let subId = null
  for (const log of rc.logs) {
    try {
      const parsed = coord.interface.parseLog({ topics: log.topics, data: log.data })
      if (parsed && parsed.name === 'SubscriptionCreated') {
        subId = parsed.args.subId.toString()
        break
      }
    } catch (_) {}
  }
  if (!subId) {
    console.log('WARN: Could not parse subId from logs. Please check the transaction. Tx:', tx.hash)
  } else {
    console.log('Created VRF Subscription. subId =', subId)
  }
}

main().catch((e)=>{ console.error(e); process.exit(1) })
