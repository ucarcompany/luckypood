require('dotenv').config()
const { ethers } = require('hardhat')

const COORDINATOR = process.env.VRF_COORDINATOR
const DEFAULT_LINK_TESTNET = '0x84b9B910527Ad5C03A9Ca831909E21e236EA7b06'
const LINK_TOKEN = process.env.LINK_TOKEN_TESTNET || DEFAULT_LINK_TESTNET

const erc677Abi = [
  'function transferAndCall(address to, uint256 value, bytes data) external returns (bool)'
]

async function main() {
  const subId = process.env.VRF_SUBSCRIPTION_ID
  const amountLink = process.env.LINK_AMOUNT || '1.0'
  if (!COORDINATOR) throw new Error('Missing VRF_COORDINATOR in .env')
  if (!subId) throw new Error('Set VRF_SUBSCRIPTION_ID in .env')

  const [signer] = await ethers.getSigners()
  console.log('Signer:', await signer.getAddress())
  const link = new ethers.Contract(LINK_TOKEN, erc677Abi, signer)
  const amount = ethers.parseUnits(amountLink, 18)
  const abiCoder = ethers.AbiCoder.defaultAbiCoder()
  const data = abiCoder.encode(['uint64'], [BigInt(subId)])
  const tx = await link.transferAndCall(COORDINATOR, amount, data)
  await tx.wait()
  console.log(`Funded subId ${subId} with ${amountLink} LINK (tx: ${tx.hash})`)
}

main().catch((e)=>{ console.error(e); process.exit(1) })
