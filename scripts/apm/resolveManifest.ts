import {create} from "ipfs-http-client";
import all from "it-all";

const ipfs = create({url: "https://ipfs.infura.io:5001"});

type Manifest = {
  version: string;
  upstreamVersion?: string;
};

export async function resolveManifest(ipfsHash: string): Promise<Manifest> {
  try {
    return await catJson(ipfsHash);
  } catch (e) {
    return await catJson(`${ipfsHash}/dappnode_package.json`);
  }
}

async function catJson<T>(ipfsHash: string): Promise<T> {
  const bufArr = await all(ipfs.cat(`${ipfsHash}/dappnode_package.json`));
  const jsonStr = Buffer.concat(bufArr).toString();
  return JSON.parse(jsonStr);
}
