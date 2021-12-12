# dappnode-package-manager

## Goals

- Allow to publish arbitrary version strings: `0.1.0` as well as `0.2.0-beta.0-73612`
- Make versions immutable, the content associated with `0.1.0` can never be changed
- Allow to publish non-sequential versions, bump `0.1.4` -> `0.1.5` after publishing `0.2.0`
- Don't incorporate the notion of `latest` in Repo contract since versions can be published un-ordered

### Publisher flow

1. Deploy Repo contract
2. Set new repo contract address to ENS domain such as `name.dnp.dappnode.eth`
3. Publish version with `newVersion("0.1.0", "/ipfs/Qm...")`. The format of `_contentURI` should be specified **TBD** and support multiple content providers besides IPFS.

For every new version repeat step 3.

### Consumer flow

1. Poll the version list locally iterating `getByVersionId()` from `0` to `getVersionsCount()`. Alternatively, subscribe to `Version` event to get new versions.
2. Apply semver logic over the `version` strings to decide what latest version they want to track. Resolve `_contentURI` to get the release contents.

Every interval, repeat step 1 to 2.
