import {Interface} from "ethers/lib/utils";
import {ethers,upgrades} from "hardhat";
import fs from "fs";
import {Registry} from "../typechain-types/Registry";
import * as registryData from "./apm/registryABI";
import {fetchRepoVersionState} from "./apm/fetchRepoVersionState";
import {readRegistry} from "./apm/writeRegistry";
import {resolveManifest} from "./apm/resolveManifest";

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

async function main() {
  const mainnetRegistryENS = "dnp.dappnode.eth";
  const xDAIRegistryName = "dnp.dappnode";

  const accounts = await ethers.provider.listAccounts();
  if (accounts.length === 0) throw Error("No accounts");
  const devAddress = accounts[0];

  const mainnetProvider = new ethers.providers.InfuraProvider("mainnet");

  /* Deploy Registry contract */
  console.log("Deployment Registry Contract");
  console.log("registryName:", xDAIRegistryName);

  const Registry = await ethers.getContractFactory("Registry");

  const registry = (await upgrades.deployProxy(Registry, [xDAIRegistryName])) as Registry;
  await registry.deployed();

  console.log("Dappnode Registry Contract deployed to:", registry.address);
  console.log("registryName:", await registry.registryName());

  // Deploy all packages

  const registryPackages = readRegistry(mainnetRegistryENS);
  const dropSet = new Set(dropListByRegistry[mainnetRegistryENS]);

  for (const registryPackage of registryPackages) {
    if (dropSet.has(registryPackage.name)) {
      console.log(`Ignoring package ${registryPackage.name}`);
      continue;
    }

    // Fetch latestVersion if exists
    // Resolve manifest
    const latestVersion = await fetchRepoVersionState(mainnetProvider, registryPackage.repo);
    if (latestVersion === null) {
      console.log(`Package ${registryPackage.name} has no published version, skipping`);
      continue;
    }

    console.log(`Resolving ${registryPackage.name} manifest ${latestVersion.contentUri}`);

    let version: string;
    try {
      const manifest = await resolveManifest(latestVersion.contentUri);
      version = manifest.upstreamVersion ?? manifest.version;
    } catch (e) {
      console.error("Error resolving manifest", e);
      version = latestVersion.version;
    }
    const flags = 0b011;

    console.log(`Publishing package ${registryPackage.name} version ${version} ${latestVersion.contentUri}`);

    const newPackageWithVersionTX = await registry.newPackageWithVersion(
      registryPackage.name,
      devAddress,
      flags,
      version,
      latestVersion.contentUri
    );

    await newPackageWithVersionTX.wait();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
