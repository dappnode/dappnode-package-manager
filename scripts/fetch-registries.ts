import {ethers} from "ethers";
import fs from "fs";
import {getRegistryOnRange} from "./apm/fetchRegistry";
import {writeRegistry} from "./apm/writeRegistry";

// dnp.dappnode.eth
//   0x266BFdb2124A68beB6769dC887BD655f78778923
//   5254891
// public.dappnode.eth
//   0x9F85AE5aeFE4a3eFF39d9A44212aae21Dd15079A
//   6311951

async function main() {
  await fetchAndWriteRegistry("dnp.dappnode.eth", 5254891);
  await fetchAndWriteRegistry("public.dappnode.eth", 6311951);
}

async function fetchAndWriteRegistry(registryENS: string, deployBlock: number): Promise<void> {
  const provider = new ethers.providers.InfuraProvider();
  const latestBlock = await provider.getBlockNumber();
  const registryPackages = await getRegistryOnRange(provider, registryENS, deployBlock, latestBlock);

  writeRegistry(registryENS, registryPackages);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
