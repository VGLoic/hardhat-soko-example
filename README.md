# Foundry and Hardhat Soko integration example

This repository is an example of integration between [Hardhat](https://hardhat.org/) and the [Hardhat Soko plugin](https://github.com/VGLoic/hardhat-soko).

- Testing and compilation is handled by [Hardhat](https://hardhat.org/),
- Compilation artifacts management is handled by [Soko](https://github.com/VGLoic/hardhat-soko),
- Releases are handled using [Changesets](https://github.com/changesets/changesets),
- Deployments are handled by [Hardhat Deploy](https://github.com/wighawag/hardhat-deploy) and use the managed compilation artifacts.

## Development

Development of smart contracts is handled by Hardhat only. There are no particular points related to the integration with Hardhat Soko or else.

## Pushing on `main`

When pushing a commit on `main`, we would like to update the `latest` version of our compilation artifacts so that it is accessible to everyone.

This operation is made automatically by the CI, it will

- perform a fresh compilation of the smart contracts,
- push it on the storage using the `latest` tag.

The related code can be found in the `main.yml` workflow file

```yaml
---
- name: Create artifacts
  run: npm run compile
- name: Push latest release to storage
  run: npm run hardhat soko push -- --artifact-path ./artifacts --tag latest --force
```

where `compile` is a `npm` script:

```json
{
  ...
  "scripts": {
    "format:contracts": "prettier --write --plugin=prettier-plugin-solidity 'src/**/*.sol'",
    "compile": "npm run format:contracts && hardhat compile --force --no-typechain",
    ...
  }
  ...
}
```

## Creating a pull request

When opening a new pull request or pushing to an existing one, we would like to have an overview of which contracts are added, removed or modified.

In the `pr.yml` workflow,

- we perform a fresh compilation of the smart contracts,
- we pull the `latest` tag compilation artifact,
- we diff both artifacts in order to check for changes,
- if there are changes, we add a comment to the pull request.

The matching code is

```yaml
      ...
      - name: Create artifacts
        run: npm run compile
      - name: Pull latest release
        run: npm run hardhat soko pull -- --tag latest
      - name: Create diff between artifacts and latest release
        id: artifacts-diff
        uses: actions/github-script@v7
        with:
          script: |
            const { generateDiffWithTargetRelease, LocalStorageProvider } = require("hardhat-soko/scripts");
            const diff = await generateDiffWithTargetRelease(
              "./artifacts",
              { project: "assured-counter", tagOrId: "latest" },
               undefined,
               new LocalStorageProvider(".soko")
            );
            return diff;
      - name: Create or update comment on PR
        uses: actions/github-script@v7
        with:
          script: |
          ...
```

## Creating a release

Once we are satisfied with our codebase, we can create a **release**. By doing so we want to do multiple things

1. push the compilation artifact using the tag of the release,
2. release a new version of a NPM package containing the ABIs and the deployed contract addresses.

Management of the releases is made using [Changesets](https://github.com/changesets/changesets), so what follows will be applicable to those using this tool. However, it is easily applicable to any other tools or processes.

The exact step in the `main.yml` workflow is

```yaml
---
- name: Create Release Pull Request or Publish to npm
  id: changesets
  uses: changesets/action@v1
  with:
    # Script to run logic logic before actually publishing
    # This is needed as Changesets won't trigger the tags workflow when a new version is published, so we need to do it manually
    # The steps of the script are:
    # 1. Upload the compilation artifact with the new release tag,
    # 2. Download the releases,
    # 3. Build the artifacts for the NPM package,
    # 4. Publish the NPM package
    publish: npm run release
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
    AWS_REGION: ${{ secrets.AWS_REGION }}
    AWS_S3_BUCKET: ${{ secrets.AWS_S3_BUCKET }}
    AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

Where the `release` is a bash script performing the needed steps:

1. retrieve the tag from the `package.json`,
2. push the compilation artifact with the retrieved tag,
3. prepare what will be exposed by the NPM package:
   - pull all the compilation artifacts,
   - generate the typings,
   - build the release artifacts for the ABIs,
   - build the release artifacts for the deployments,
4. publish the NPM package.

```bash
#!/bin/bash
set -e

RELEASE_TAG_WITHOUT_PREFIX=$(cat package.json | jq -r '.version')

echo "Publishing release $RELEASE_TAG_WITHOUT_PREFIX"

npm run hardhat soko push -- --artifact-path ./artifacts --tag "v$RELEASE_TAG_WITHOUT_PREFIX" && echo "Successfully pushed release artifact" || echo "Failed to push release, we assume here that this is because the release already exists. Still room for improvement here."

echo "Downloading release artifacts"
npm run hardhat soko pull
npm run hardhat soko typings

echo "Release artifacts downloaded"

echo "Preparing NPM package"
npm run release:build-exposed-abis
npm run release:build-deployments-summary

echo "Publishing NPM package"
npm run changeset publish
```

### Content of the exposed ABIs in NPM package

The ABIs for all contracts organized by `tag` are exposed through the NPM package.

### Content of the exposed deployments in NPM package

Deployment files are named based on the deployed contract and the used tag. It allows us to derive a summary as a JSON file of the various deployments organized by tags and organized by network (chain ID)

```json
{
  // Sepolia chain ID
  "11155111": {
    // Tag used to deploy Counter and IncrementOracle
    "v0.0.1": {
      "Counter": "0x001d35B9e151717C57412262915685e7f6E06ee8",
      "IncrementOracle": "0x2c7a34BA50CD81C54F0cf40b1918E0C865aBE1E4"
    }
  }
}
```

## Deployment of the releases smart contracts

This repository uses [Hardhat Deploy](https://github.com/wighawag/hardhat-deploy) in order to deploy the compiled smart contracts.

Deployments are purely based on the compilation artifacts that have been uploaded, hence always working with frozen artifacts.

```ts
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { project } from "../.soko-typings";

const TARGET_RELEASE = "v0.0.1";

const deployCounter: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment,
) {
  const { deployer } = await hre.getNamedAccounts();

  const projectUtils = project("assured-counter").tag(TARGET_RELEASE);

  const incrementOracleArtifact = await projectUtils.getContractArtifact(
    "src/IncrementOracle.sol:IncrementOracle",
  );

  const incrementOracleDeployment = await hre.deployments.deploy(
    `IncrementOracle@${TARGET_RELEASE}`,
    {
      contract: {
        abi: incrementOracleArtifact.abi,
        bytecode: incrementOracleArtifact.evm.bytecode.object,
        metadata: incrementOracleArtifact.metadata,
      },
      from: deployer,
      log: true,
    },
  );

  const counterArtifact = await projectUtils.getContractArtifact(
    "src/Counter.sol:Counter",
  );
  await hre.deployments.deploy(`Counter@${TARGET_RELEASE}`, {
    contract: {
      abi: counterArtifact.abi,
      bytecode: counterArtifact.evm.bytecode.object,
      metadata: counterArtifact.metadata,
    },
    libraries: {
      "src/IncrementOracle.sol:IncrementOracle":
        incrementOracleDeployment.address,
    },
    from: deployer,
    log: true,
  });
};

export default deployCounter;
```
