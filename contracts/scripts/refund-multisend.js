require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');

async function main(){
  const rpc = process.env.RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545';
  const pk = process.env.PRIVATE_KEY;
  const poolAddr = process.env.POOL_ADDRESS;
  if (!pk) throw new Error('Set PRIVATE_KEY');
  if (!poolAddr) throw new Error('Set POOL_ADDRESS');
  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(pk, provider);

  const poolAbi = require('../../shared/abi/LuckyPool.json').abi;
  const erc20Abi = require('../../shared/abi/IERC20.json').abi;
  const pool = new ethers.Contract(poolAddr, poolAbi, provider);
  const stable = await pool.stablecoin();
  const ticketPrice = await pool.ticketPrice();
  const token = new ethers.Contract(stable, erc20Abi, wallet);

  const rows = JSON.parse(fs.readFileSync('participants.json','utf8'));
  console.log('Refunding', rows.length, 'addresses using token', stable);

  for (const r of rows){
    const amount = ticketPrice * BigInt(r.tickets);
    const tx = await token.transfer(r.address, amount);
    console.log('tx', tx.hash, '->', r.address, String(amount));
    await tx.wait();
  }
  console.log('Done.');
}

main().catch(e=>{ console.error(e); process.exit(1); });
