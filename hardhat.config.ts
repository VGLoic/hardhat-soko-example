import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-deploy";
import "hardhat-soko";
import "dotenv/config";
import { SokoHardhatUserConfig } from "hardhat-soko";

let sokoConfig: SokoHardhatUserConfig | undefined = undefined;
if (
  process.env.AWS_REGION &&
  process.env.AWS_S3_BUCKET &&
  process.env.AWS_ACCESS_KEY_ID &&
  process.env.AWS_SECRET_ACCESS_KEY
) {
  sokoConfig = {
    project: "doubtful-counter",
    pulledArtifactsPath: ".soko",
    typingsPath: ".soko-typings",
    storageConfiguration: {
      type: "aws",
      awsRegion: process.env.AWS_REGION,
      awsBucketName: process.env.AWS_S3_BUCKET,
      awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
      awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  };
}

export const config: HardhatUserConfig = {
  namedAccounts: {
    deployer: {
      default: 0, // First account is taken as deployer
    },
  },
  soko: sokoConfig,
  networks: {
    localhost: {
      chainId: 31337,
    },
    sepolia: {
      chainId: 11155111,
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: { mnemonic: process.env.SEPOLIA_MNEMONIC || "" },
      verify: {
        etherscan: {
          apiKey: process.env.ETHERSCAN_API_KEY || "",
        },
      },
    },
  },
  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY || "",
    },
  },
  solidity: {
    version: "0.8.13",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "london",
    },
  },
  typechain: {
    outDir: "typechain",
  },
  paths: {
    sources: "./src", // Use ./src rather than ./contracts as Hardhat expects
    cache: "./cache_hardhat", // Use a different cache for Hardhat than Foundry
  },
};

export default config;
