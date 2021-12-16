# dappnode-package-manager

# General goals

- Package name resolution: if user searches for `prysm` what package is shown? Where is it fetched from? Which authority decides what is "prysm"?
- Version immutability: (package name) + (version) => must resolve to the same content
- Governable list of packages

# Repo contract

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

# Registry contract

**Registry**

- Used as a utility contract for factory deployment of Repo contracts attached to a domain prefix
- Allows

**ENS**

- Used for permissions heriarchy. For example trusting `*.dnp.dappnode.eth` content and ensuring only trusted parties have access to those subdomains
- Used for fast inspection in Etherscan. However, since there's no official ENS deployment in xDAI that's not too useful

**Caveats**

- What happens if a package with the same name exists in two chains? Which takes precedence?

**List contract**

- `mapping(name => {repoAddress, status}) repos`. Mapping keyed by subname `"dappmanager"`, can only add entries and guarantees name uniqueness
  - Where `repoAddress` is the address of the Repo contract
  - Where `status` is an enum [Actice, Disabled, etc]
- `string[] subnames`. Array of package names to iterate the mapping and display in the DAppStore UI.
- `uint[] ordering`. Array of 'featured' packages sorted by their index in the `subnames` array. Should be in packaged form to save space

# Directory contract

- Used to control what packages are displayed in the DAppStore, and in what order
- Currently it's managed by DAppNode Association

```
bytes ordering // 0x0502000000000... To sort [5, 2]
uint bytesPerIndex = 1
```
