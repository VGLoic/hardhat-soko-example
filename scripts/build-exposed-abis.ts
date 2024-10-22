import fs from "fs/promises";
import { toAsyncResult } from "./result-utils";
import { build as tsupBuild } from "tsup";
import path from "node:path";
import { project } from "../.soko-typings";

const ABIS_FOLDER = path.join(__dirname, "../abis");
// Temporary `abis-tmp` folder for storing the files waiting to be bundled
const ABIS_TMP_FOLDER = path.join(__dirname, "../abis-tmp");
const ABIS_TMP_FOLDER_FOR_BUNDLE = path.join(ABIS_TMP_FOLDER, "for-bundle");
const ABIS_TMP_FOLDER_JSON = path.join(ABIS_TMP_FOLDER, "json");
// Old `abis` folder in case the build fails
const ABIS_OLD_FOLDER = path.join(__dirname, "../abis-old");

/**
 * Based on the releases and generated delta artifacts folders,
 * this script will create a new `abis` folder with the following structure:
 * ```
 * abis/
 * ├── <release-name>/
 * │   ├── <contract-path>:<contract-name>.json
 * │   ├── <contract-path>:<contract-name>.js
 * │   ├── <contract-path>:<contract-name>.d.ts
 * │   └── ...
 * └── ...
 * ```
 * The `.json` files will contain the ABI of the contract at the corresponding version.
 * The `.js` files will contain a `abi` TypeScript `const` with the ABI of the contract at the corresponding version.
 *
 * During the process, the current `abis` folder will be renamed to `abis-old`.
 * If the process is successful, the `abis-old` folder will be removed.
 * If the process fails, the `abis` folder will be removed and the `abis-old` folder will be renamed back to `abis`.
 *
 * The script will start by creating a new `abis-tmp` folder with the following structure:
 * ```
 * abis-tmp/
 * ├── for-bundle/
 * │   ├── <release-name>/
 * │   │   ├── <contract-path>:<contract-name>.ts
 * │   │   └── ...
 * │   └── ...
 * └── json/
 *     ├── <release-name>/
 *     │   ├── <contract-path>:<contract-name>.json
 *     │   └── ...
 *     └── ...
 * ```
 * The `for-bundle` folder will contain a TypeScript file for each version of each contract and will be used to bundle the contracts using `tsup`.
 * The `json` folder will contain a JSON file for each version of each contract and will be used to create the `.json` files in the `abis` folder by copy.
 * This folder will be removed at the end of the process.
 *
 * @dev The contract path is transformed to replace `/` with `-` to avoid issues with the file system.
 *
 * @dev Assumptions:
 * - The `releases` folder exists,
 * - A release folder contains a file `build-info.json` with the structure of `BuildInfo`,
 */
async function buildExposedAbis() {
  // Remove the `abis-tmp` folder if it exists
  const hasAbisTmpFolder = await fs.stat(ABIS_TMP_FOLDER).catch(() => false);
  if (hasAbisTmpFolder) {
    const removeAbisTmpResult = await toAsyncResult(
      fs.rm(ABIS_TMP_FOLDER, { recursive: true }),
    );
    if (!removeAbisTmpResult.success) {
      // Exit if there was an error removing the `abis-tmp` folder
      console.error(
        `❌ There was an error removing the \`${ABIS_TMP_FOLDER}\` folder. Please remove it manually. Build cancelled.`,
      );
      console.error(removeAbisTmpResult.error);
      process.exitCode = 1;
      return;
    }
  }
  // Create the `abis-tmp` folder
  const createAbisTmpResult = await toAsyncResult(fs.mkdir(ABIS_TMP_FOLDER));
  if (!createAbisTmpResult.success) {
    // Exit if there was an error creating the `abis` folder
    console.error(
      `❌ There was an error creating the new \`${ABIS_TMP_FOLDER}\` folder. Build cancelled. Please check the error and retry.`,
    );
    console.error(createAbisTmpResult.error);
    process.exitCode = 1;
    return;
  }

  // Fill the new `abis-tmp` folder
  const fillAbisTmpFolderResult = await toAsyncResult(fillAbisTmpFolder());
  if (!fillAbisTmpFolderResult.success) {
    await fs.rm(ABIS_TMP_FOLDER, { recursive: true }).catch((e) => {
      console.warn(
        `⚠️ There was an error removing the \`${ABIS_TMP_FOLDER}\` folder. Please remove it manually.`,
      );
      console.warn(e);
    });
    console.error(
      `❌ There was an error filling the new \`${ABIS_TMP_FOLDER}\` folder. Build cancelled. Please check the error and retry.`,
    );
    console.error(fillAbisTmpFolderResult.error);
    process.exitCode = 1;
    return;
  }

  // If `abis` folder exists
  // Remove the current `abis-old` folder
  // Rename the current `abis` folder to `abis-old`
  const hasAbisFolder = await fs.stat(ABIS_FOLDER).catch(() => false);
  if (hasAbisFolder) {
    const hasAbisOldFolder = await fs.stat(ABIS_OLD_FOLDER).catch(() => false);
    if (hasAbisOldFolder) {
      const removeAbisOldResult = await toAsyncResult(
        fs.rm(ABIS_OLD_FOLDER, { recursive: true }),
      );
      if (!removeAbisOldResult.success) {
        // Exit if there was an error removing the `abis-old` folder
        console.error(
          `❌ There was an error removing the \`${ABIS_OLD_FOLDER}\` folder. Please remove it manually. Build cancelled.`,
        );
        console.error(removeAbisOldResult.error);
        process.exitCode = 1;
        return;
      }
    }
    const renameResult = await toAsyncResult(
      fs.rename(ABIS_FOLDER, ABIS_OLD_FOLDER),
    );
    if (!renameResult.success) {
      // Exit if there was an error renaming the `abis` folder
      console.error(
        `❌ There was an error renaming the \`${ABIS_FOLDER}\` folder. Build cancelled. Please check the error and retry.`,
      );
      console.error(renameResult.error);
      process.exitCode = 1;
      return;
    }
  }

  // Bundle the `abis-tmp` folder
  try {
    await tsupBuild({
      entry: [ABIS_TMP_FOLDER_FOR_BUNDLE],
      dts: true,
      format: ["cjs", "esm"],
      publicDir: ABIS_TMP_FOLDER_JSON,
      outDir: ABIS_FOLDER,
    });
    // Remove the `abis-tmp` folder
    await fs.rm(ABIS_TMP_FOLDER, { recursive: true }).catch((e) => {
      console.warn(
        `⚠️ There was an error removing the \`${ABIS_TMP_FOLDER}\` folder. Please remove it manually.`,
      );
      console.warn(e);
    });
    // Remove the old `abis` folder if it exists
    if (hasAbisFolder) {
      await fs.rm(ABIS_OLD_FOLDER, { recursive: true }).catch((e) => {
        console.warn(
          `⚠️ There was an error removing the old \`${ABIS_FOLDER}\` folder. Please remove it manually.`,
        );
        console.warn(e);
      });
    }
    console.log("\n✅ Build for the exposed ABIs is successful.\n");
  } catch (err) {
    // If there was an error, remove the `abis-tmp` folder, remove the new `abis` folder if it exists, and rename the old `abis` folder back to `abis`
    const hasAbisTmpFolder = await fs.stat(ABIS_TMP_FOLDER).catch(() => false);
    if (hasAbisTmpFolder) {
      await fs.rm(ABIS_TMP_FOLDER, { recursive: true }).catch((e) => {
        console.warn(
          `⚠️ There was an error removing the \`${ABIS_TMP_FOLDER}\` folder. Please remove it manually.`,
        );
        console.warn(e);
      });
    }
    const hasAbisFolder = await fs.stat(ABIS_FOLDER).catch(() => false);
    if (hasAbisFolder) {
      await fs.rm(ABIS_FOLDER, { recursive: true }).catch((e) => {
        console.warn(
          `⚠️ There was an error removing the new \`${ABIS_FOLDER}\` folder. Please remove it manually.`,
        );
        console.warn(e);
      });
    }
    const hasAbisOldFolder = await fs.stat(ABIS_OLD_FOLDER).catch(() => false);
    if (hasAbisOldFolder) {
      fs.rename(ABIS_OLD_FOLDER, ABIS_FOLDER).catch((e) => {
        console.warn(
          `⚠️ There was an error renaming the \`${ABIS_OLD_FOLDER}\` folder back to \`${ABIS_FOLDER}\`. Please rename it manually.`,
        );
        console.warn(e);
      });
    }
    console.error(
      `❌ There was an error filling the new \`${ABIS_FOLDER}\` folder. Build cancelled. Please check the error and retry.`,
    );
    console.error(err);
    process.exitCode = 1;
    return;
  }
}

/**
 * Fills the `abis-tmp` folder with the ABI of the contracts at each version.
 * @dev Error handling is not done in this function. It is assumed that the caller will handle errors.
 */
async function fillAbisTmpFolder() {
  // Create the `abis-tmp/for-bundle` and the `abis-tmp/json` folders
  await fs.mkdir(ABIS_TMP_FOLDER_FOR_BUNDLE);
  await fs.mkdir(ABIS_TMP_FOLDER_JSON);

  const projectUtils = project("doubtful-counter");

  const tags = projectUtils.getAvailableTags();

  for (const tag of tags) {
    const compilationArtifactResult = await toAsyncResult(
      projectUtils.tag(tag).getCompilationArtifact(),
    );
    if (!compilationArtifactResult.success) {
      throw compilationArtifactResult.error;
    }

    await fs.mkdir(path.join(ABIS_TMP_FOLDER_FOR_BUNDLE, tag), {
      recursive: true,
    });
    await fs.mkdir(path.join(ABIS_TMP_FOLDER_JSON, tag), {
      recursive: true,
    });

    for (const contractPath in compilationArtifactResult.value.output
      .contracts) {
      const contracts =
        compilationArtifactResult.value.output.contracts[contractPath];
      for (const contractName in contracts) {
        const contractKey = `${contractPath.replace("/", "_")}:${contractName}`;

        // Parsing is not perfect, so we take the raw parsed data using JSON.parse
        const contractAbi =
          compilationArtifactResult.value.output.contracts[contractPath][
            contractName
          ].abi;

        await fs.writeFile(
          path.join(
            ABIS_TMP_FOLDER_JSON,
            tag,
            fromPascalCaseToKebabCase(contractKey) + ".json",
          ),
          JSON.stringify(contractAbi, null, 4),
        );

        await fs.writeFile(
          path.join(
            ABIS_TMP_FOLDER_FOR_BUNDLE,
            tag,
            fromPascalCaseToKebabCase(contractKey) + ".ts",
          ),
          `export const abi = ${JSON.stringify(
            contractAbi,
            null,
            4,
          )} as const;`,
        );
      }
    }
  }
}

function fromPascalCaseToKebabCase(pascalCase: string) {
  let formatted = pascalCase
    .replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, "$1-$2")
    .toLowerCase();

  formatted = formatted.replace(/_-/g, "_");
  formatted = formatted.replace(/:-/g, ":");

  if (formatted.startsWith("-")) {
    return formatted.slice(1);
  }

  return formatted;
}

buildExposedAbis();
