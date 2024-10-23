#!/bin/bash
set -e

RELEASE_TAG_WITHOUT_PREFIX=$(cat package.json | jq -r '.version')

echo "Publishing release $RELEASE_TAG_WITHOUT_PREFIX"

npm run hardhat soko push -- --artifact-path ./artifacts --tag "v$RELEASE_TAG_WITHOUT_PREFIX" && echo "Successfully pushed release artifact" || echo "Failed to push release, we assume here that this is because the release already exists. We need to improve this!"

echo "Downloading release artifacts"

npm run hardhat soko pull

npm run hardhat soko typings

echo "Release artifacts downloaded"

echo "Preparing NPM package"

npm run release:build-exposed-abis

npm run release:build-deployments-summary

echo "Publishing NPM package"

npm run changeset publish
