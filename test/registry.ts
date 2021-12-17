import {expect} from "chai";
import {ethers} from "hardhat";
import {Event} from "ethers";
import {Registry} from "../typechain-types/Registry";
import {Repo} from "../typechain-types/Repo";

describe("Registry", function () {
  it("dnp.dappnode registry publish one package", async function () {
    const [owner, addr1] = await ethers.getSigners();

    const registryName = "dnp.dappnode";

    const newVersion1: RepoVersion = {
      version: "0.1.0",
      contentURI: "/ipfs/Qmaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    };

    const newVersion2: RepoVersion = {
      version: "0.2.0-beta.0",
      contentURI: "/ipfs/Qmbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    };

    const newPackage = {
      name: "gnosis",
      dev: addr1.address,
      flags: 0,
    };

    const Registry = await ethers.getContractFactory("Registry");
    const registry = (await Registry.deploy(registryName)) as Registry;

    await registry.deployed();

    expect(await registry.registryName()).to.equal(registryName, "Wrong registryName");

    // Publish new repo from admin account
    const {repo: newRepoAddress} = await publishRepoVersion(registry, newPackage, newVersion1);

    // Connect to deployed repo
    const repoWithAdmin = (await ethers.getContractAt("Repo", newRepoAddress, owner)) as Repo;
    const repoWithDev = (await ethers.getContractAt("Repo", newRepoAddress, addr1)) as Repo;

    // Assert that there are two version in the Repo contract
    await assertRepoVersions(repoWithDev, [newVersion1]);

    // Ensure it's already initialized
    await expect(repoWithAdmin.initialize(newRepoAddress)).to.be.revertedWith(
      "Initializable: contract is already initialized"
    );

    // Attempt to publish version with non-auth account
    await expect(repoWithAdmin.newVersion(newVersion1.version, newVersion1.contentURI)).to.be.revertedWith(
      "AccessControl"
    );

    // Attempt to publish a version on an existing version str
    await expect(repoWithDev.newVersion(newVersion1.version, newVersion1.contentURI)).to.be.revertedWith(
      "REPO_EXISTENT_VERSION"
    );

    // Publish a version on a different version str
    const newVersionTx = await repoWithDev.newVersion(newVersion2.version, newVersion2.contentURI, {
      from: addr1.address,
    });
    const newVersionReceipt = await newVersionTx.wait();

    const newVersionEvent = getEvent(newVersionReceipt.events, "NewVersion");
    expect(newVersionEvent.args!.version).to.equal(newVersion2.version, "Wrong event NewVersion.version");
    expect(newVersionEvent.args!.contentURI).to.equal(newVersion2.contentURI, "Wrong event NewVersion.contentURI");

    // Assert that there are two version in the Repo contract
    await assertRepoVersions(repoWithDev, [newVersion1, newVersion2]);
  });

  it("public.dappnode registry publish one package and validate", async function () {
    const [owner, addr1] = await ethers.getSigners();

    const registryName = "public.dappnode";

    const newVersion1 = {
      version: "0.1.0",
      contentURI: "/ipfs/Qmaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    };

    const newVersion2 = {
      version: "0.2.0-beta.0",
      contentURI: "/ipfs/Qmbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    };

    const newPackage = {
      name: "gnosis-test",
      dev: addr1.address,
      flags: 0,
    };

    const Registry = await ethers.getContractFactory("Registry");
    const registryAdmin = (await Registry.deploy(registryName)) as Registry;
    await registryAdmin.deployed();

    expect(await registryAdmin.registryName()).to.equal(registryName, "Wrong registryName");

    // Test that non-auth users can NOT publish packages
    const registryUser = (await ethers.getContractAt("Registry", registryAdmin.address, addr1)) as Registry;
    await expect(publishRepoVersion(registryUser, newPackage, newVersion1)).to.be.revertedWith(
      "Initializable: contract is already initialized"
    );

    // Allow anyone to publish package
    await registryAdmin.setAddPackageAnyAddress(true);

    // Test that non-auth users DO can publish packages
    const {repo: newRepoAddress} = await publishRepoVersion(registryUser, newPackage, newVersion1);

    // Connect to deployed repo
    const repoUser = (await ethers.getContractAt("Repo", newRepoAddress, addr1)) as Repo;

    // Assert that there are two version in the Repo contract
    await assertRepoVersions(repoUser, [newVersion1]);
  });
});

interface RepoVersion {
  version: string;
  contentURI: string;
}

interface RepoPackage {
  name: string;
  dev: string;
  flags: number;
}

/**
 * Call newPackageWithVersion and assert event is correct
 */
async function publishRepoVersion(registry: Registry, pkg: RepoPackage, version: RepoVersion): Promise<{repo: string}> {
  const newPackageWithVersionTx = await registry.newPackageWithVersion(
    pkg.name,
    pkg.dev,
    pkg.flags,
    version.version,
    version.contentURI
  );

  // wait until the transaction is mined
  const newPackageWithVersionReceipt = await newPackageWithVersionTx.wait();

  // Recover repo address from AddPackage event
  const addPackageEvent = getEvent(newPackageWithVersionReceipt.events, "AddPackage");
  expect(addPackageEvent.args!.name).to.equal(pkg.name, "Wrong event AddPackage .name");
  const repo = addPackageEvent.args!.repo as string;
  const packageIdx = addPackageEvent.args!.packageIdx as number;

  // Assert that registry lists the new package
  const pkg1 = await registry.packages(packageIdx);
  expect(pkg1.name).to.equal(pkg.name, "Wrong packages.name");
  expect(pkg1.flags).to.equal(pkg.flags, "Wrong packages.flags");
  expect(pkg1.repo).to.equal(repo, "Wrong packages.repo");

  return {repo};
}

async function assertRepoVersions(repo: Repo, expectedVersions: RepoVersion[]) {
  const versionCountBN = await repo.getVersionsCount();
  const versionCount = versionCountBN.toNumber();

  const versions: RepoVersion[] = [];

  for (let i = 1; i < versionCount + 1; i++) {
    const version = await repo.getByVersionId(i);
    versions.push({
      version: version.version,
      contentURI: version.contentURI,
    });
  }

  expect(versions).to.deep.equal(expectedVersions, "Wrong versions in repo");
}

function getEvent(events: Event[] = [], eventName: string): Event {
  const event = events.find((event) => event.event === eventName);
  if (!event) {
    throw Error(`No event found for ${eventName}`);
  }
  return event;
}
