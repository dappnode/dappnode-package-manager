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

export async function fetchRepoVersionLastNPublished(
  provider: ethers.providers.Provider,
  repoAddress: string,
  numOfVersions: number
): Promise<ApmVersionState[]> {
  const repo = new ethers.Contract(repoAddress, repoABI.abi, provider);

  const versionCount: number = await repo.getVersionsCount().then(parseFloat);
  if (versionCount === 0) {
    return [];
  }

  const versions: ApmVersionState[] = [];
  const fromId = Math.max(versionCount - numOfVersions + 1, 1);

  for (let i = fromId; i <= versionCount; i++) {
    // First version is index 1
    const res: ApmRepoVersionReturn = await repo.getByVersionId(i);

    if (!Array.isArray(res.semanticVersion)) throw Error(`property 'semanticVersion' must be an array`);
    versions.push({
      version: res.semanticVersion.join("."),
      // Second argument = true: ignore UTF8 parsing errors
      // Let downstream code identify the content hash as wrong
      contentUri: ethers.utils.toUtf8String(res.contentURI),
    });
  }

  return versions;
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
