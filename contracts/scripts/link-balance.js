require('dotenv').config()
const { ethers } = require('hardhat')

const LINK = process.env.LINK_TOKEN_TESTNET

const erc20Abi = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)'
]

async function main() {
  if (!LINK) throw new Error('Missing LINK_TOKEN_TESTNET in .env')
  const [signer] = await ethers.getSigners()
  const addr = await signer.getAddress()
  const token = new ethers.Contract(LINK, erc20Abi, signer)
  const [bal, dec] = await Promise.all([
    token.balanceOf(addr),
    token.decimals()
  ])
  console.log('Signer:', addr)
  console.log('LINK balance:', ethers.formatUnits(bal, dec))
}

main().catch(e=>{ console.error(e); process.exit(1) })
