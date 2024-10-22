import fs from "fs/promises";
import { toAsyncResult } from "./result-utils";
import { z } from "zod";

/**
 * Builds a summary of the deployments
 *
 * The deployements with name formatted as `<deployment-name>@<release name>` will be grouped by release name.
 *
 *
 * Read the `deployments` directory and build a summary of the deployments in `deployements-summary.json`
 * The JSON object with the following structure:
 * ```json
 * {
 *  <network chain ID>: {
 *      <release-name>: {
 *          <deployment-name-a>: <contract-address>,
 *          <deployment-name-b>: <contract-address>,
 *          ...
 *     },
 *     unknown: {
 *         <deployment-name-c>: <contract-address>,
 *         ...
 *     }
 *    ...
 * }
 * ```
 */
async function buildDeploymentsSummary() {
  const hasDeployments = await fs.stat("deployments").catch(() => false);
  if (!hasDeployments) {
    console.warn("No deployments found");
    await fs.writeFile("deployments-summary.json", JSON.stringify({}, null, 2));
    return;
  }

  const deploymentsSummary = {} as Record<
    string,
    Record<string, Record<string, string>>
  >;
  const deployments = await toAsyncResult(
    fs.readdir("deployments", { withFileTypes: true }),
  );
  if (!deployments.success) {
    process.exitCode = 1;
    console.error("Error reading the `deployments` folder");
    return;
  }

  const deploymentsDirectories = deployments.value
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  for (const deploymentDirectory of deploymentsDirectories) {
    const hasDotChainIdFile = await fs
      .stat(`deployments/${deploymentDirectory}/.chainId`)
      .catch(() => false);
    if (!hasDotChainIdFile) {
      console.warn(
        `No .chainId file found for deployment ${deploymentDirectory}. Skipping`,
      );
      continue;
    }
    const chainIdResult = await toAsyncResult(
      fs.readFile(`deployments/${deploymentDirectory}/.chainId`, "utf-8"),
    );
    if (!chainIdResult.success) {
      console.warn(
        `Error reading .chainId file for deployment ${deploymentDirectory}. Skipping`,
      );
      continue;
    }
    const chainId = Number(chainIdResult.value.trim());
    if (isNaN(chainId)) {
      console.warn(
        `Invalid chain ID in .chainId file for deployment ${deploymentDirectory}. Skipping`,
      );
      continue;
    }

    // Read all files in the deployment directory and consider only the JSON files
    const deploymentFiles = await toAsyncResult(
      fs.readdir(`deployments/${deploymentDirectory}`, { withFileTypes: true }),
    );
    if (!deploymentFiles.success) {
      console.warn(
        `Error reading deployment directory ${deploymentDirectory}. Skipping`,
      );
      continue;
    }
    const deploymentJsonFiles = deploymentFiles.value
      .filter((dirent) => dirent.isFile() && dirent.name.endsWith(".json"))
      .map((dirent) => dirent.name);

    const networkDeployments = {} as Record<string, Record<string, string>>;

    for (const deploymentFile of deploymentJsonFiles) {
      const deploymentContentResult = await toAsyncResult(
        fs.readFile(
          `deployments/${deploymentDirectory}/${deploymentFile}`,
          "utf-8",
        ),
      );
      if (!deploymentContentResult.success) {
        console.warn(
          `Error reading deployment file ${deploymentFile}. Skipping`,
        );
        continue;
      }
      let deploymentAsJson;
      try {
        deploymentAsJson = JSON.parse(deploymentContentResult.value);
      } catch {
        console.warn(
          `Error parsing deployment file ${deploymentFile}. Skipping`,
        );
        continue;
      }
      const parsedDeployment = z
        .object({ address: z.string() })
        .safeParse(deploymentAsJson);
      if (!parsedDeployment.success) {
        console.warn(
          `Error parsing deployment file ${deploymentFile}. Skipping`,
        );
        continue;
      }
      const deploymentName = deploymentFile.replace(".json", "");
      const deploymentNameParts = deploymentName.split("@");
      if (deploymentNameParts.length !== 2) {
        if (!networkDeployments.unknown) {
          networkDeployments.unknown = {};
        }
        networkDeployments.unknown[deploymentName] =
          parsedDeployment.data.address;
      } else {
        const releaseName = deploymentNameParts[1];
        const deploymentName = deploymentNameParts[0];
        if (!networkDeployments[releaseName]) {
          networkDeployments[releaseName] = {};
        }
        networkDeployments[releaseName][deploymentName] =
          parsedDeployment.data.address;
      }
    }

    deploymentsSummary[chainId] = networkDeployments;
  }

  await fs.writeFile(
    "deployments-summary.json",
    JSON.stringify(deploymentsSummary, null, 2),
  );
}

buildDeploymentsSummary();
