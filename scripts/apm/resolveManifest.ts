import {create} from "ipfs-http-client";
import all from "it-all";
import path from "path";
import fs from "fs";

const CACHE_DIR = path.join(__dirname, "../../cache");

const ipfs = create({url: "https://ipfs.infura.io:5001"});

export type Manifest = {
  version: string;
  upstreamVersion?: string;
  dependencies?: Record<string, string>;
};

export async function resolveManifest(ipfsHash: string): Promise<Manifest> {
  const cacheFilepath = path.join(CACHE_DIR, "manifest-" + ipfsHash.replace(/\//g, ":"));

  try {
    return JSON.parse(fs.readFileSync(cacheFilepath, "utf8"));
  } catch (e) {
    if ((e as {code: string}).code !== "ENOENT") {
      throw e;
    }
  }

  let manifest: Manifest;
  try {
    // Try to resolve as manifest file first
    manifest = await catJson(ipfsHash);
  } catch (e) {
    // Else try to resolve as directory
    manifest = await catJson(`${ipfsHash}/dappnode_package.json`);
  }

  fs.writeFileSync(cacheFilepath, JSON.stringify(manifest, null, 2));

  return manifest;
}

/**
 * Cat JSON file with disk cache
 */
async function catJson<T>(ipfsHash: string): Promise<T> {
  const bufArr = await all(ipfs.cat(ipfsHash));
  const jsonStr = Buffer.concat(bufArr).toString();
  return JSON.parse(jsonStr);
}
