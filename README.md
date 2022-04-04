# DAppNode pacakge manager (DMP)

Set of smart contracts to govern a registry of packages of arbitrary versioned content. Based on Aragon's [APM](https://hack.aragon.org/docs/apm-intro.html).

**Registry**

Map of names to packages. Similar to Javascript's NPM or Rust's crates.io. Resolves human readable names to packages with additional metadata:

- **Per package `flags`**: Bitfield with status flags, for example `validated`, `banned`.
- **Global `packageList`**: Compact list of packageIdx'es in some order. May signal ordering for quality, relevance.

**Repo**

Map of versions to contentURIs. Versions are immutable, can be published in any order and are defined by:

- **version**: Arbitrary string representation of a version, for example `0.1.4`, `2.0.0-beta.0` or `2022.03.02`
- **contentURI**: [ENSIP-7](https://docs.ens.domains/ens-improvement-proposals/ensip-7-contenthash-field) Contenthash field specification (formerly EIP-1577), for example `ipfs://QmRAQB6YaCyidP37UdDnjFY5vQuiBrcqdyoW1CuDgwxkD` or `bzz://d1de9994b4d039f6548d191eb26786769f580809256b4685ef316805265ea162`

## Usage

**Publsh version**

- For the first version use `Registry.newPackageWithVersion()`.
- For subsequent version updates use `Repo.newVersion()`.

**Read all data**

- Aquire a `Registry` address from a trusted source. This can be hardcoded in software of published in a developer's socials page.
- Get current package count with `Registry.getPackageCount()` and iterate the map `Registry.packages`
- Sort resulting package array with indexes from `Registry.packageList` and `Registry.bytesPerListItem` if any
- Packages should be referenced by their full name concatenating struct `Package.name` and `Registry.registryName`
- For each package's struct `Package.repo` get current version count with `Repo.getVersionsCount` and iterate the map `Repo.versions`
- To resolve the "latest" version use the algorythm defined by `Repo.versionSorting`. Since versions are arbitrary text different strategies than semver may be used.

## Rationale

**Registry goals**

- Provide governable package name resolution to map human readable names (`prysm`) to specific `Repo` contracts
- Provide governable ordered list of packages
- Version immutability: (package name) + (version) => must resolve to the same content

**Repo goals**

- Allow to publish arbitrary version strings: `0.1.0` as well as `0.2.0-beta.0-73612`
- Make versions immutable, the content associated with `0.1.0` can never be changed
- Allow to publish non-sequential versions, bump `0.1.4` -> `0.1.5` after publishing `0.2.0`
- Don't incorporate the notion of `latest` in Repo contract since versions can be published un-ordered

## Suggested permissions settings

**Guarded registry**

Suitable for high value packages mantained by a single organization where name collisions with community packages must not occur. Ethereum mainnet `dnp.dappnode.eth` registry is an example.

All permissions `ADD_PACKAGE_ROLE`, `SET_STATUS_ROLE`, `SET_LIST_ROLE` should be granted to a dev lead, a collective of trusted devs or a multisig controlled by trusted devs. `SET_REPO_ROLE` should be burned after deployment to ensure immutability of the registry.

**Open registry**

Suitable for community registries that enable un-trusted participation. Each role can be granted to another smart contract to govern its usage:

- `ADD_PACKAGE_ROLE`: Could be open to anyone, to have a first-come first-serve distribution of package names. Otherwise an auction model can be adopted to prevent squating.
- `SET_STATUS_ROLE`: Should be restricted to smaller set of invested participants that can attest that quality and content of the packages. Could be governed by a DAO, or a TCR.
- `SET_LIST_ROLE`: Should be restricted to smaller set of invested participants that can attest that quality and content of the packages. Could be governed by a DAO, or a TCR.
- `SET_REPO_ROLE`: Should be restricted and challengable and only used if distribution of names can allow malicious usage or phising.

## Open questions / FAQ

_Why is ENS not used?_

- xDAI does not have a reputable ENS deployment so we couldn't rely on it. However, ENS can be used on top of this contracts. It would solve the duplicate registry issue with same registryNames

_What happens if a package is reference in two registries at once?_

- That's fine, it's up to the consumer to decide which registry takes precende and use its metadata

_What happens if a package with the same name exists in two chains?_

- That's fine, it's up to the consumer to decide which registry and repo takes precende. Care should be taken to never allow to update an existing package with a version from a different registry.

_How to migrate packages from an existing deployment in Mainnet_?

- DAppNode team has migrated only the latest version of the existing Aragon's APM to provide continuity but not history. Packages from the open registry `public.dappnode.eth` will be re-published by the DAppNode team in the new deployment and claimable by their original owner. Upon claiming all permissions hold by the DAppNode team will be revoked and only the original owner will be able to publish versions. In detail: Grant to original owner DEFAULT_ADMIN_ROLE. Provide a UI for original owner to revoke roles to anyone else but itself. DAppNode may keep publishing updates until the original owner claims. It has role DEFAULT_ADMIN_ROLE so it can rotate keys if necessary
