import {ethers} from "ethers";
import * as repoABI from "./repoABI";
import path from "path";
import fs from "fs";
import {memoDisk} from "./memoDisk";

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

// Cache in disk for faster retries
const getVersionsCount = memoDisk(
  async function getVersionsCount(
    provider: ethers.providers.Provider,
    repoAddress: string
  ): Promise<{versionCount: number}> {
    const repo = new ethers.Contract(repoAddress, repoABI.abi, provider);
    const vcBn = await repo.getVersionsCount();
    return {
      versionCount: vcBn.toNumber(),
    };
  },
  {toId: (provider, repoAddress) => `repo-version-count-${repoAddress}`, ttlMs: 30 * 60 * 1000}
);

const getByVersionId = memoDisk(
  async function getByVersionId(
    provider: ethers.providers.Provider,
    repoAddress: string,
    i: number
  ): Promise<ApmVersionState> {
    const repo = new ethers.Contract(repoAddress, repoABI.abi, provider);

    // First version is index 1
    const res: ApmRepoVersionReturn = await repo.getByVersionId(i);

    if (!Array.isArray(res.semanticVersion)) throw Error(`property 'semanticVersion' must be an array`);
    return {
      version: res.semanticVersion.join("."),
      // Second argument = true: ignore UTF8 parsing errors
      // Let downstream code identify the content hash as wrong
      contentUri: ethers.utils.toUtf8String(res.contentURI),
    };
  },
  {toId: (provider, repoAddress, i) => `repo-version-${repoAddress}-${i}`, ttlMs: Infinity}
);

export async function fetchRepoVersionLastNPublished(
  provider: ethers.providers.Provider,
  repoAddress: string,
  numOfVersions: number
): Promise<ApmVersionState[]> {
  const {versionCount} = await getVersionsCount(provider, repoAddress);
  if (versionCount === 0) {
    return [];
  }

  const versions: ApmVersionState[] = [];
  // First version is index 1
  const fromId = Math.max(versionCount - numOfVersions + 1, 1);

  for (let i = fromId; i <= versionCount; i++) {
    versions.push(await getByVersionId(provider, repoAddress, i));
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
