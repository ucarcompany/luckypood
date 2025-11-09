/**
 * Hardhat config
 */
require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");

const { BSC_TESTNET_RPC_URL, MNEMONIC } = process.env;

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    hardhat: {
      chainId: 1337,
    },
    bscTestnet: {
      url: BSC_TESTNET_RPC_URL || "",
      accounts: MNEMONIC ? { mnemonic: MNEMONIC } : undefined,
      chainId: 97,
    },
  },
};
