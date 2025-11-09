require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');

async function main(){
  const rpc = process.env.RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545';
  const provider = new ethers.JsonRpcProvider(rpc);
  const poolAddr = process.env.POOL_ADDRESS;
  if (!poolAddr) throw new Error('Set POOL_ADDRESS');
  const abi = require('../../shared/abi/LuckyPool.json').abi;
  const iface = new ethers.Interface(abi);
  const event = iface.getEvent('Participated');
  const topic0 = event.topicHash || iface.getEventTopic?.('Participated');
  const logs = await provider.getLogs({ address: poolAddr, topics:[topic0], fromBlock: 0 });
  const firstSeen = [];
  const seen = new Set();
  for (const l of logs){
    try{
      const parsed = iface.parseLog({ topics: l.topics, data: l.data });
      const user = String(parsed.args[0]).toLowerCase();
      if (!seen.has(user)) { seen.add(user); firstSeen.push(user); }
    }catch{}
  }
  const pool = new ethers.Contract(poolAddr, abi, provider);
  const rows = [];
  for (const addr of firstSeen){
    const cnt = Number(await pool.ticketsByUser(addr));
    if (cnt>0) rows.push({ address: addr, tickets: cnt });
  }
  fs.writeFileSync('participants.json', JSON.stringify(rows, null, 2));
  console.log('Wrote participants.json with', rows.length, 'rows');
}

main().catch(e=>{ console.error(e); process.exit(1); });
