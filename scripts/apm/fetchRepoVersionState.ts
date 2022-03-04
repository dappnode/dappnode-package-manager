import {ethers} from "ethers";
import * as repoABI from "./repoABI";
import path from "path";
import fs from "fs";

const CACHE_DIR = path.join(__dirname, "../../cache");
const CACHE_DURATION = 30 * 60 * 1000;

export type ApmVersionState = {
  version: string;
  contentUri: string;
};

interface ApmRepoVersionReturn {
  semanticVersion: number[]; // uint16[3]
  contractAddress: string; // address
  contentURI: string; // bytes
}

export async function fetchRepoVersionLastPublished(
  provider: ethers.providers.Provider,
  repoAddress: string
): Promise<ApmVersionState | null> {
  const cacheFilepath = path.join(CACHE_DIR, "repo-last-published-" + repoAddress);
  if (isFileRecent(cacheFilepath)) {
    return JSON.parse(fs.readFileSync(cacheFilepath, "utf8"));
  }

  const repo = new ethers.Contract(repoAddress, repoABI.abi, provider);

  const versionCount: number = await repo.getVersionsCount().then(parseFloat);
  if (versionCount === 0) {
    return null;
  }

  // First version is index 1
  const res: ApmRepoVersionReturn = await repo.getByVersionId(versionCount);

  if (!Array.isArray(res.semanticVersion)) throw Error(`property 'semanticVersion' must be an array`);
  const version: ApmVersionState = {
    version: res.semanticVersion.join("."),
    // Second argument = true: ignore UTF8 parsing errors
    // Let downstream code identify the content hash as wrong
    contentUri: ethers.utils.toUtf8String(res.contentURI),
  };

  fs.writeFileSync(cacheFilepath, JSON.stringify(version, null, 2));

  return version;
}

function isFileRecent(filepath: string): boolean {
  try {
    const stat = fs.statSync(filepath);
    return Date.now() - stat.mtimeMs < CACHE_DURATION;
  } catch (e) {
    if ((e as {code: string}).code !== "ENOENT") {
      throw e;
    } else {
      return false;
    }
  }
}
