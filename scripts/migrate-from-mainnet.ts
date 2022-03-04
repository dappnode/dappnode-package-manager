import {ethers, upgrades} from "hardhat";
import {ContractReceipt} from "ethers";
import fs from "fs";
import semver from "semver";
import {Registry} from "../typechain-types/Registry";
import {ApmVersionState, fetchRepoVersionLastNPublished} from "./apm/fetchRepoVersionState";
import {readRegistry} from "./apm/writeRegistry";
import {resolveManifest} from "./apm/resolveManifest";
import {Repo} from "../typechain-types/Repo";

// Caveats
// =======
// - 'raiden-testnet' and 'raiden' packages are not available, they should be re-deployed
// - If we switch to 'upstreamVersion' from 'version' it can trigger a major update
// - Changing the registry name from 'dnp.dappnode.eth' to 'dnp.dappnode' invalidates the name
//   inside the dappnode_package.json
// - Packages have dependencies, which versions must be available

const VERSION_TRANSFORM: "not" | "use-upstream" = "not";
const CONTENTURI_TRANSFORM: "not" | "ENSIP-7" = "ENSIP-7";
const VERSIONS_TO_MIGRATE = 1;

const dropListByRegistry = {
  "dnp.dappnode.eth": [
    "apm-registry",
    "apm-enssub",
    "apm-repo",
    "testing",
    "nginx-proxy",
    "letsencrypt-nginx",
    "otpweb",
    "ethchain",
    "ethforward",
    "wamp",
    "admin",
    "telegram-mtpproto.dnp.dappnode.eth",
    "telegram-mtpproto",
    "livepeer",
    "ln",
    "vipnode",
    "trustlines-monitor",
    "trustlines-bridge",
    "trustlines-netstats",
    "trustlines-validator",
    "swarm",
    "turbo-geth",

    "goerli-parity",
    "goerli-pantheon",

    "prysm-witti-beacon-chain",
    "prysm-witti-validator",
    "eth2stats-client-witti",
    "prysm-onyx-beacon-chain",
    "prysm-onyx-validator",
    "prysm-altona-beacon-chain",
    "prysm-altona-validator",
    "prysm-medalla-beacon-chain",
    "lighthouse-medalla-beacon-chain",
    "medalla-validator",
  ],

  "public.dappnode.eth": [
    //
    "apm-registry",
    "apm-enssub",
    "apm-repo",
    // dappnode-exporter is duplicated, we want the .dnp one
    "dappnode-exporter",
    "bitcoin",
    "dnpinner",
    "status",
    "goerli-parity",
    "lightning-network",
    "prysm-beacon-chain",
    "prysm-validator",
    "dappnode-exporter",
    "prometheus-grafana",
    "dms",
    "turbo-geth",
    "ethereum-optimism",
  ],
};

/**
 * 0 - active
 * 1 - validated
 * 2 - banned
 * 3 - hidden
 */
type Flags = number;

const flagsByRegistryByRepo: Record<string, Record<string, Flags>> = {
  "dnp.dappnode.eth": {
    bind: 0b1011,
    ipfs: 0b1011,
    dappmanager: 0b1011,
    core: 0b1011,
    wifi: 0b1011,
    https: 0b1011,
    wireguard: 0b1011,
  },

  "public.dappnode.eth": {},
};

const flagsDefaultByRegistry: Record<string, Flags> = {
  "dnp.dappnode.eth": 0b0011,
  "public.dappnode.eth": 0b0001,
};

const checkManifestAvailable: Record<string, boolean> = {
  "dnp.dappnode.eth": true,
  "public.dappnode.eth": false,
};

type PackageToPublishData = {
  repoName: string;
  flags: number;
  versions: {
    version: string;
    versionChanged: string;
    contentURIs: string[];
    apmVersion: ApmVersionState;
  }[];
};

const registryName = process.env.REGISTRY_NAME as keyof typeof dropListByRegistry;
if (!flagsDefaultByRegistry[registryName]) {
  throw Error(`Must set a REGISTRY_NAME ENV. Possible values ${Object.keys(flagsDefaultByRegistry).join(", ")} `);
}

if (process.env.DRY_RUN) {
  getVersionData(registryName)
    .then((dataSet) => {
      console.log("Persisted results");
      fs.writeFileSync(`${registryName}.json`, JSON.stringify(Object.fromEntries(dataSet), null, 2));
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
} else {
  deployAndMigrate(registryName).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

async function deployAndMigrate(registryName: keyof typeof dropListByRegistry) {
  const accounts = await ethers.provider.listAccounts();
  if (accounts.length === 0) throw Error("No accounts");
  const devAddress = accounts[0];

  /* Deploy Registry contract */
  console.log("Deployment Registry Contract");
  console.log("registryName:", registryName);

  const Registry = await ethers.getContractFactory("Registry");

  const registry = (await upgrades.deployProxy(Registry, [registryName])) as Registry;
  await registry.deployed();

  console.log("Dappnode Registry Contract deployed to:", registry.address);
  console.log("registryName:", await registry.registryName());

  const dataSet = await getVersionData(registryName);

  // Deploy all packages

  for (const registryPackage of dataSet.values()) {
    console.log(`Publishing package ${registryPackage.repoName} @ ${registryPackage.versions[0].version}`);

    const newPackageWithVersionTX = await registry.newPackageWithVersion(
      registryPackage.repoName,
      devAddress,
      registryPackage.flags,
      registryPackage.versions[0].version,
      registryPackage.versions[0].contentURIs
    );

    const newPackageRcp = await newPackageWithVersionTX.wait();

    if (registryPackage.versions.length > 1) {
      const repoAddress = getRepoAddressFromRcp(newPackageRcp);
      const repoWithDev = (await ethers.getContractAt("Repo", repoAddress)) as Repo;

      for (const version of registryPackage.versions.slice(1)) {
        console.log(`Publishing package ${registryPackage.repoName} @ ${version.version}`);

        const newVersionTx = await repoWithDev.newVersion(version.version, version.contentURIs);
        await newVersionTx.wait();
      }
    }
  }
}

export async function getVersionData(
  registryName: keyof typeof dropListByRegistry
): Promise<Map<string, PackageToPublishData>> {
  const mainnetProvider = new ethers.providers.InfuraProvider("mainnet");

  // Deploy all packages

  const registryPackages = readRegistry(registryName);
  const dropSet = new Set(dropListByRegistry[registryName]);

  const dataSet = new Map<string, PackageToPublishData>();

  for (const registryPackage of registryPackages) {
    if (dropSet.has(registryPackage.name)) {
      // console.log(`Ignoring package ${registryPackage.name}`);
      continue;
    }

    const flags = flagsByRegistryByRepo[registryName][registryPackage.name] ?? flagsDefaultByRegistry[registryName];
    if (flags === undefined) {
      throw Error(`flags not defined for ${registryName} ${registryPackage.name}`);
    }

    const pkgToPublish: PackageToPublishData = {
      repoName: registryPackage.name,
      flags,
      versions: [],
    };
    dataSet.set(registryPackage.name, pkgToPublish);

    // Fetch latestVersion if exists
    // Resolve manifest
    const apmVersions = await fetchRepoVersionLastNPublished(
      mainnetProvider,
      registryPackage.repo,
      VERSIONS_TO_MIGRATE
    );

    if (apmVersions.length === 0) {
      console.log(`Package ${registryPackage.name} has no published version, skipping`);
      continue;
    }

    for (const apmVersion of apmVersions) {
      // Only check if manifest is there for main repo
      if (checkManifestAvailable[registryName]) {
        await resolveManifest(apmVersion.contentUri, registryPackage.name);
      }

      // Transform version and contentURI
      const version = await transformVersion(apmVersion, registryPackage.name);
      const contentUri = transformContentURI(apmVersion.contentUri);

      const versionChanged = computeVersionChange(apmVersion.version, version);
      console.log(
        [
          registryPackage.name.padEnd(25),
          versionChanged.padEnd(10),
          `${apmVersion.version} -> ${version}`.padEnd(20),
          contentUri,
        ].join("\t")
      );

      pkgToPublish.versions.push({
        version,
        versionChanged,
        contentURIs: [contentUri],
        apmVersion,
      });
    }
  }

  return dataSet;
}

async function transformVersion(prevVersion: ApmVersionState, id: string): Promise<string> {
  switch (VERSION_TRANSFORM) {
    case "not":
      return prevVersion.version;

    case "use-upstream": {
      const manifest = await resolveManifest(prevVersion.contentUri, id);

      if (manifest.upstreamVersion) {
        // Remove leading v if semver
        if (/^v\d/.test(manifest.upstreamVersion)) {
          return manifest.upstreamVersion.slice(1);
        } else {
          return manifest.upstreamVersion;
        }
      } else {
        return manifest.version;
      }
    }
  }
}

function transformContentURI(contentURI: string): string {
  switch (CONTENTURI_TRANSFORM) {
    case "not":
      return contentURI;

    case "ENSIP-7": {
      if (!contentURI.startsWith("/ipfs/")) throw Error("contentUri must start with /ipfs/");
      return "ipfs://" + contentURI.split("/ipfs/")[1];
    }
  }
}

function computeVersionChange(prevVersion: string, nextVersion: string): string {
  const prev = new semver.SemVer(prevVersion);

  let next: semver.SemVer;
  try {
    next = new semver.SemVer(nextVersion);
  } catch (e) {
    return "INVALID_NEXT";
  }

  if (next.major > prev.major) return "BUMP_MAJOR";
  if (next.major < prev.major) return "REGRESION_MAJOR";
  if (next.minor > prev.minor) return "BUMP_MINOR";
  if (next.minor < prev.minor) return "REGRESION_MINOR";
  if (next.patch > prev.patch) return "BUMP_PATCH";
  if (next.patch < prev.patch) return "REGRESION_PATCH";

  return "SAME";
}

function getRepoAddressFromRcp(newPackageRcp: ContractReceipt): string {
  const event = newPackageRcp.events?.find((event) => event.event === "AddPackage");
  if (!event) {
    throw Error("No AddPackage event found");
  }

  const repo = event.args?.repo as string | undefined;
  if (!repo) {
    throw Error("No arg repo in event");
  }

  return repo;
}
