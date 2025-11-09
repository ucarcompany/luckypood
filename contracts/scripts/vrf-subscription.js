require('dotenv').config()
const { ethers } = require('hardhat')

const COORDINATOR = process.env.VRF_COORDINATOR
// BNB Chain Testnet LINK token (ERC677) from Chainlink docs
const DEFAULT_LINK_TESTNET = '0x84b9B910527Ad5C03A9Ca831909E21e236EA7b06'
const LINK_TOKEN = process.env.LINK_TOKEN_TESTNET || DEFAULT_LINK_TESTNET

const coordAbi = [
  'event SubscriptionCreated(uint64 indexed subId, address owner)',
  'function createSubscription() external returns (uint64 subId)',
  'function addConsumer(uint64 subId, address consumer) external'
]

const erc677Abi = [
  'function transferAndCall(address to, uint256 value, bytes data) external returns (bool)'
]

async function main() {
  if (!COORDINATOR) throw new Error('Missing VRF_COORDINATOR in .env')
  const [signer] = await ethers.getSigners()
  const coord = new ethers.Contract(COORDINATOR, coordAbi, signer)

  const [cmd, ...args] = process.argv.slice(2)
  if (!cmd || !['create','fund','add-consumer'].includes(cmd)) {
    console.log('Usage: node scripts/vrf-subscription.js <create|fund|add-consumer> [args]')
    console.log('  create                                   -> create a new subscription and print subId')
    console.log('  fund <subId> <amountLINK>                -> fund sub with LINK (uses LINK_TOKEN_TESTNET or default)')
    console.log('  add-consumer <subId> <consumerAddress>   -> add a consumer address to subscription')
    process.exit(1)
  }

  if (cmd === 'create') {
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
    console.log('Created VRF Subscription. subId =', subId)
    return
  }

  if (cmd === 'fund') {
    const [subId, amountStr] = args
    if (!subId || !amountStr) throw new Error('Usage: fund <subId> <amountLINK>')
    const link = new ethers.Contract(LINK_TOKEN, erc677Abi, signer)
    const amount = ethers.parseUnits(amountStr, 18)
    const abiCoder = ethers.AbiCoder.defaultAbiCoder()
    const data = abiCoder.encode(['uint64'], [BigInt(subId)])
    const tx = await link.transferAndCall(COORDINATOR, amount, data)
    await tx.wait()
    console.log(`Funded subId ${subId} with ${amountStr} LINK`)
    return
  }

  if (cmd === 'add-consumer') {
    const [subId, consumer] = args
    if (!subId || !consumer) throw new Error('Usage: add-consumer <subId> <consumerAddress>')
    const tx = await coord.addConsumer(BigInt(subId), consumer)
    await tx.wait()
    console.log(`Added consumer ${consumer} to subId ${subId}`)
    return
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
