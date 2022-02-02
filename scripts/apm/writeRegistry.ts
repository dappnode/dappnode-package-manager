import fs from "fs";
import path from "path";

const dataPath = path.join(__dirname, "../../apm-mainnet-data");

export interface RegistryPackage {
  name: string;
  repo: string;
  deployTimestampSec: number;
}

function getCsvPath(registryENS: string): string {
  return path.join(dataPath, `${registryENS}.csv`);
}

export function writeRegistry(registryENS: string, registryPackages: RegistryPackage[]): void {
  const csv = registryPackages
    .map((pkg) =>
      [
        // Short name: 'dappmanager'
        pkg.name,
        // APMRepo contract address
        pkg.repo,
        // Deploy date
        new Date(pkg.deployTimestampSec * 1000).toISOString(),
      ].join(",")
    )
    .join("\n");

  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath);
  }

  fs.writeFileSync(getCsvPath(registryENS), csv);
}

export function readRegistry(registryENS: string): RegistryPackage[] {
  const csv = fs.readFileSync(getCsvPath(registryENS), "utf8");

  return csv
    .trim()
    .split("\n")
    .map((row) => {
      const [name, repo, deployDate] = row.split(",");

      return {
        name,
        repo,
        deployTimestampSec: Math.floor(new Date(deployDate).getTime() / 1000),
      };
    });
}
