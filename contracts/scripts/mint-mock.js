require('dotenv').config()
const { ethers } = require('hardhat')

// ====== 自动填入参数 ======
const to = '0x05f5d60025f544a792ce887d1f000b55c815bd05' // 你的钱包地址
const amountTokensStr = '1000' // 要铸币的数量（整数，单位为 token）

// Minimal ABI for MockERC20
const ABI = [
  'function decimals() view returns (uint8)',
  'function mint(address to, uint256 amount)'
]

async function main() {
  if (!ethers.isAddress(to)) {
    throw new Error('Invalid recipient address')
  }
  const tokenAddr = process.env.STABLECOIN_ADDRESS_TESTNET
  if (!tokenAddr) throw new Error('Missing STABLECOIN_ADDRESS_TESTNET in contracts/.env')

  const [signer] = await ethers.getSigners()
  console.log('Using signer:', await signer.getAddress())
  console.log('Token:', tokenAddr)
  const erc = new ethers.Contract(tokenAddr, ABI, signer)
  let decimals = 18
  try { decimals = await erc.decimals() } catch {}
  const amountWei = ethers.parseUnits(amountTokensStr, decimals)
  console.log(`Minting ${amountTokensStr} tokens (${amountWei}) to ${to} ...`)
  const tx = await erc.mint(to, amountWei)
  console.log('tx hash:', tx.hash)
  await tx.wait()
  console.log('Minted successfully')
}

main().catch((e) => { console.error(e); process.exit(1) })
