import { HardhatUserConfig } from "hardhat/config";

// PLUGINS
import "@nomiclabs/hardhat-ethers"; 
import "@nomiclabs/hardhat-etherscan";
import "@typechain/hardhat";
import "@nomiclabs/hardhat-waffle"
import "hardhat-deploy";


// ================================= CONFIG =========================================
// Process Env Variables
import * as dotenv from "dotenv";
dotenv.config({ path: __dirname + "/.env" });

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const accounts: string[] =  PRIVATE_KEY ? [PRIVATE_KEY] : [];
const ETHERSCAN_KEY = process.env.ETHERSCAN_KEY;
const ALCHEMY_KEY  = process.env.ALCHEMY_KEY

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",

  // hardhat-deploy
  namedAccounts: {
    deployer: {
      default: 0,
    },
  },
  networks: {
    
    hardhat: {
      chainId: 41923, // EDU Chain ID for consistency
      forking: {
        url: `https://rpc.edu-chain.raas.gelato.cloud`,
        blockNumber: 29558000,
        enabled: false, // Disabled - EDU Chain RPC doesn't support archival queries for forking
      },
    },

    // Shared Testnet
   synFuturesABCTestnet: {
      accounts,
      chainId: 20250903,
      url: `https://rpc.synfutures-abc-testnet.raas.gelato.cloud`,
    },
    baseSepolia: {
      chainId: 84532,
      url: `https://base-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`,
      accounts
    },
    eduChain: {
      chainId: 41923,
      url: `https://rpc.edu-chain.raas.gelato.cloud`,
      accounts
    },
  },
  etherscan: {
    apiKey: {
      synFuturesABCTestnet: "xxx",
      sepolia: ETHERSCAN_KEY as string,
      eduChain: "xx"
    },
    customChains: [
      {
        network: "synFuturesABCTestnet",
        chainId: 20250903,
        urls: {
          apiURL: "https://synfutures-abc-testnet.cloud.blockscout.com/api",
          browserURL: "https://synfutures-abc-testnet.cloud.blockscout.com"
        }
      },
      {
        network: "eduChain",
        chainId: 41923,
        urls: {
          apiURL: "https://educhain.blockscout.com/api",
          browserURL: "https://educhain.blockscout.com"
        }
      },
    ]
  },

  solidity: {
    compilers: [
      {
        version: "0.8.29",
        settings: {
          evmVersion: 'paris',
          optimizer: { enabled: true , runs:200},
        },
      },
      {
        version: "0.8.20",
        settings: {
          evmVersion: 'paris',
          optimizer: { enabled: true , runs:200},
        },
      },
    ],
  },

  typechain: {
    outDir: "typechain",
    target: "ethers-v6",
  },


};

export default config;
