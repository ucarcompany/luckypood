require('dotenv').config();
const LuckyPoolFactory = artifacts.require("LuckyPoolFactory");

module.exports = async function (deployer, network, accounts) {
  if (network === 'development') {
    // 跳过本地测试网络的工厂部署；单元测试将手动部署所需合约
    return;
  }
  const owner = accounts[0];
  const {
    VRF_COORDINATOR,
    VRF_KEYHASH,
    VRF_SUBSCRIPTION_ID,
    TREASURY_ADDRESS,
    STABLECOIN_ADDRESS_TESTNET,
    STABLECOIN_ADDRESS_MAINNET
  } = process.env;

  let stablecoin;
  if (network === 'bscTestnet') {
    stablecoin = STABLECOIN_ADDRESS_TESTNET;
  } else if (network === 'bsc') {
    stablecoin = STABLECOIN_ADDRESS_MAINNET;
  } else {
    // development / ganache: 使用一个占位地址（测试环境请部署一个 mock ERC20）
    stablecoin = accounts[0];
  }

  const ticketPrice = web3.utils.toWei('1', 'ether'); // 1.0（按18位假设）
  const countdownSeconds = 3 * 24 * 60 * 60; // 3天
  const refundDeadlineSeconds = 15 * 24 * 60 * 60; // 15天

  await deployer.deploy(
    LuckyPoolFactory,
    owner,
    stablecoin,
    ticketPrice,
    countdownSeconds,
    refundDeadlineSeconds,
    VRF_COORDINATOR,
    VRF_KEYHASH,
    Number(VRF_SUBSCRIPTION_ID || '0'),
    TREASURY_ADDRESS || owner
  );
};
