import {create} from "ipfs-http-client";
import all from "it-all";
import {memoDisk} from "./memoDisk";

const ipfs = create({url: "https://ipfs.infura.io:5001"});

export type Manifest = {
  version: string;
  upstreamVersion?: string;
  dependencies?: Record<string, string>;
};

// Cache in disk for faster retries
export const resolveManifest = memoDisk(
  async function resolveManifest(ipfsHash: string, id: string): Promise<Manifest> {
    console.log(`Resolving ${id} manifest ${ipfsHash}`);

    try {
      // Try to resolve as manifest file first
      return await catJson(ipfsHash);
    } catch (e) {
      // Else try to resolve as directory
      return await catJson(`${ipfsHash}/dappnode_package.json`);
    }
  },
  {
    toId: (ipfsHash) => `ipfs-dappnode_package-${ipfsHash}`,
    ttlMs: Infinity,
  }
);

/**
 * Cat JSON file with disk cache
 */
async function catJson<T>(ipfsHash: string): Promise<T> {
  const bufArr = await all(ipfs.cat(ipfsHash));
  const jsonStr = Buffer.concat(bufArr).toString();
  return JSON.parse(jsonStr);
}
