import { BuildInfo, HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployOptions } from "hardhat-deploy/dist/types";
import { Etherscan } from "@nomicfoundation/hardhat-verify/etherscan";
import { setTimeout } from "timers/promises";

/**
 * Retrieve an existing deployment or deploy a new one
 * A deployment is considered existing if the contract bytecode is the same than the current one
 * @param hre Hardhat runtime environment
 * @param deploymentName Name of the deployment
 * @param options Deployment options
 * @returns Address of the deployed contract
 */
export async function retrieveOrDeploy(
  hre: HardhatRuntimeEnvironment,
  deploymentName: string,
  options: DeployOptions,
) {
  const result = await hre.deployments.fetchIfDifferent(
    deploymentName,
    options,
  );
  if (!result.differences && result.address) {
    console.log(
      `\n✔️ The deployment ${deploymentName} is known, deployed contract
       is found at address ${result.address}. Re-using it.\n`,
    );
    return result.address;
  }

  console.log(
    `\n This version of the ${deploymentName} has not been deployed. Deploying it. \n`,
  );
  const deploymentResult = await hre.deployments.deploy(
    deploymentName,
    options,
  );
  console.log(
    `\n✔️ The deployment ${deploymentName} has been successfully realised, the deployed contract can be found at address ${deploymentResult.address} \n`,
  );
  return deploymentResult.address;
}

type VerifyPayload = {
  // Address of the deployed contract
  address: string;
  // Source code of the contract - input part of the build info
  compilationInput: BuildInfo["input"];
  // Compiler version - solcLongVersion of the build info
  compilerVersion: string;
  // Source name of the contract - path of the contract file
  sourceName: string;
  // Contract name - name of the contract in the source file
  contractName: string;
  // Libraries if any
  libraries?: {
    address: string;
    sourceName: string;
    contractName: string;
  }[];
  encodedConstructorArgs?: string;
};
/**
 * Verify a contract on Etherscan
 * @dev Only works for Polygon Scan on Mumbai Testnet for now
 * @dev Need to be completed with constructor arguments
 * @param payload Verification payload
 * @param payload.address Address of the deployed contract
 * @param payload.compilationInput Input part of the build info
 * @param payload.compilerVersion Compiler version - solcLongVersion of the build info
 * @param payload.sourceName Source name of the contract - path of the contract file
 * @param payload.contractName Contract name - name of the contract in the source file
 * @param payload.libraries Libraries if any
 * @param payload.encodedConstructorArgs Encoded constructor arguments
 */
export async function verifyContract(payload: VerifyPayload) {
  const updatedSetting: BuildInfo["input"]["settings"] & {
    libraries: NonNullable<BuildInfo["input"]["settings"]["libraries"]>;
  } = {
    ...payload.compilationInput.settings,
    libraries: {},
  };

  if (payload.libraries) {
    for (const library of payload.libraries) {
      updatedSetting.libraries[library.sourceName] = {
        [library.contractName]: library.address,
      };
    }
  }

  const updatedSources: BuildInfo["input"]["sources"] = {};
  for (const [sourceName, source] of Object.entries(
    payload.compilationInput.sources,
  )) {
    updatedSources[sourceName] = {
      content: source.content,
    };
  }

  const updatedSourceCode: BuildInfo["input"] = {
    ...payload.compilationInput,
    sources: updatedSources,
    settings: updatedSetting,
  };
  payload.compilationInput = updatedSourceCode;

  // ******************* End disabling *******************
  for (let i = 0; i < 5; i++) {
    try {
      await verifyContractOnce(payload);
      return;
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const message = (err as any).message as string;
      if (message && message.includes("does not have bytecode")) {
        await setTimeout(2_000);
        continue;
      }

      if (message) {
        console.error(
          `\n⚠️ Verification of ${payload.sourceName}:${payload.contractName} fails. \nIf fail happens because the data is not yet available on the block explorer, feel free to re-trigger the script in a few seconds in order to try to verify again.\n Actual error: `,
          message,
        );
        return;
      }
    }
  }
}

async function verifyContractOnce(payload: VerifyPayload) {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    throw new Error("Missing API key for verification");
  }
  const etherscan = new Etherscan(
    apiKey,
    "https://api-sepolia.etherscan.io/api",
    "https://sepolia.etherscan.io/",
  );

  const isVerified = await etherscan.isVerified(payload.address);

  if (isVerified) {
    console.log("Wunderbar, it's already verified!");
    return;
  }

  const { message: guid } = await etherscan.verify(
    // Contract address
    payload.address,
    // Inputs
    JSON.stringify(payload.compilationInput),
    // Contract full name
    `${payload.sourceName}:${payload.contractName}`,
    // Compiler version
    `v${payload.compilerVersion}`,
    // Encoded constructor arguments
    payload.encodedConstructorArgs ?? "",
  );

  await setTimeout(2_000);

  const verificationStatus = await etherscan.getVerificationStatus(guid);

  if (verificationStatus.isSuccess()) {
    console.log(
      `Successfully verified contract ${payload.sourceName}:${payload.contractName}`,
    );
  } else {
    throw new Error(verificationStatus.message);
  }
}
