import {ethers} from "ethers";
import * as repoABI from "./repoABI";

type ApmVersionState = {
  version: string;
  contentUri: string;
};

interface ApmRepoVersionReturn {
  semanticVersion: number[]; // uint16[3]
  contractAddress: string; // address
  contentURI: string; // bytes
}

export async function fetchRepoVersionState(
  provider: ethers.providers.Provider,
  repoAddress: string
): Promise<ApmVersionState | null> {
  const repo = new ethers.Contract(repoAddress, repoABI.abi, provider);

  const versionCount: number = await repo.getVersionsCount().then(parseFloat);
  if (versionCount === 0) {
    return null;
  }

  // First version is index 1
  const res: ApmRepoVersionReturn = await repo.getByVersionId(versionCount);

  if (!Array.isArray(res.semanticVersion)) throw Error(`property 'semanticVersion' must be an array`);
  return {
    version: res.semanticVersion.join("."),
    // Second argument = true: ignore UTF8 parsing errors
    // Let downstream code identify the content hash as wrong
    contentUri: ethers.utils.toUtf8String(res.contentURI),
  };
}
