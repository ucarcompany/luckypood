require('dotenv').config()
const { ethers } = require('hardhat')

const COORDINATOR = process.env.VRF_COORDINATOR
const coordAbi = [
  'function addConsumer(uint64 subId, address consumer) external'
]

async function main() {
  if (!COORDINATOR) throw new Error('Missing VRF_COORDINATOR in .env')
  const subId = process.env.VRF_SUBSCRIPTION_ID
  const consumer = process.env.VRF_CONSUMER_ADDRESS
  if (!subId) throw new Error('Set VRF_SUBSCRIPTION_ID in .env')
  if (!consumer) throw new Error('Set VRF_CONSUMER_ADDRESS in .env (Factory address)')

  const [signer] = await ethers.getSigners()
  console.log('Signer:', await signer.getAddress())
  const coord = new ethers.Contract(COORDINATOR, coordAbi, signer)
  const tx = await coord.addConsumer(BigInt(subId), consumer)
  await tx.wait()
  console.log(`Added consumer ${consumer} to subId ${subId} (tx: ${tx.hash})`)
}

main().catch((e)=>{ console.error(e); process.exit(1) })
