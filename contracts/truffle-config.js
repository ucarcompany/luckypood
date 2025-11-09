require('dotenv').config();
const HDWalletProvider = require('@truffle/hdwallet-provider');

const {
  MNEMONIC,
  BSC_RPC_URL,
  BSC_TESTNET_RPC_URL
} = process.env;

module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*"
    },
    bscTestnet: {
      provider: () => new HDWalletProvider({
        mnemonic: { phrase: MNEMONIC },
        providerOrUrl: BSC_TESTNET_RPC_URL
      }),
      network_id: 97,
      confirmations: 2,
      timeoutBlocks: 200,
      skipDryRun: true
    },
    bsc: {
      provider: () => new HDWalletProvider({
        mnemonic: { phrase: MNEMONIC },
        providerOrUrl: BSC_RPC_URL
      }),
      network_id: 56,
      confirmations: 5,
      timeoutBlocks: 500,
      skipDryRun: true
    }
  },
  compilers: {
    solc: {
      version: "0.8.20",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        }
      }
    }
  },
  api_keys: {},
  mocha: {
    timeout: 100000
  }
};
