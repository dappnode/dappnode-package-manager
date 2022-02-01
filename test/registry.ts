import {expect} from "chai";
import {ethers} from "hardhat";
import {Event} from "ethers";
import {Registry, PackageStruct} from "../typechain-types/Registry";
import {Repo, VersionStruct} from "../typechain-types/Repo";

interface RepoPackage {
  name: string;
  dev: string;
  flags: number;
}

describe("Registry", function () {
  it("dnp.dappnode registry publish one package", async function () {
    const [owner, addr1] = await ethers.getSigners();

    const registryName = "dnp.dappnode";

    const newVersion1: VersionStruct = {
      version: "0.1.0",
      contentURI: "/ipfs/Qmaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    };

    const newVersion2: VersionStruct = {
      version: "0.2.0-beta.0",
      contentURI: "/ipfs/Qmbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    };

    const newPackage: RepoPackage = {
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

    // Assert registry packages
    await assertPackages(registry, [{flags: newPackage.flags, repo: newRepoAddress, name: newPackage.name}])

    // Connect to deployed repo
    const repoWithAdmin = (await ethers.getContractAt("Repo", newRepoAddress, owner)) as Repo;
    const repoWithDev = (await ethers.getContractAt("Repo", newRepoAddress, addr1)) as Repo;

    // Assert that there are a version in the Repo contract
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
      "NO_ADD_PACKAGE_ROLE"
    );

    // Allow anyone to publish package
    await registryAdmin.setAddPackageAnyAddress(true);

    // Test that non-auth users DO can publish packages
    const {repo: newRepoAddress} = await publishRepoVersion(registryUser, newPackage, newVersion1);

    // Assert registry packages
    await assertPackages(registryUser, [{flags: newPackage.flags, repo: newRepoAddress, name: newPackage.name}])

    // Connect to deployed repo
    const repoUser = (await ethers.getContractAt("Repo", newRepoAddress, addr1)) as Repo;

    // Assert that there are two version in the Repo contract
    await assertRepoVersions(repoUser, [newVersion1]);
  });

  it("public.dappnode registry publish one package and set flags", async function () {
    const [owner, addr1] = await ethers.getSigners();

    const registryName = "dnp.dappnode";

    const newVersion1: VersionStruct = {
      version: "0.1.0",
      contentURI: "/ipfs/Qmaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    };

    const newPackage: RepoPackage = {
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

    // Assert registry packages
    await assertPackages(registry, [{flags: newPackage.flags, repo: newRepoAddress, name: newPackage.name}])

    // Connect to deployed repo
    const repoWithDev = (await ethers.getContractAt("Repo", newRepoAddress, addr1)) as Repo;

    // Assert that there are a version in the Repo contract
    await assertRepoVersions(repoWithDev, [newVersion1]);

    // Set flags using the following:
    // Bitfield with status flags, TBD
    // 0 - visible
    // 1 - active
    // 2 - validated
    // 3 - banned
    const nameHash = ethers.utils.solidityKeccak256(["string"], [newPackage.name]);
    const packageIdx = 1;
    expect(await registry.getPackageIdx(newPackage.name)).to.be.equal(packageIdx);
    expect(await registry.packageIdxByName(nameHash)).to.be.equal(packageIdx);

    // Calculate flag value for visible, active and validated
    const flagValue = calculateFlagValue(true, true, true, false);

    // Set package flags
    await registry.setPackageStatus(packageIdx, flagValue);

    // Assert registry packages
    await assertPackages(registry, [{flags: flagValue, repo: newRepoAddress, name: newPackage.name}])
    expect(await registry.getPackageIdx(newPackage.name)).to.be.equal(packageIdx);

    // Calculate flag value banned
    const bannedFlag = calculateFlagValue(false, false, false, true);

    // Set package flags
    await registry.setPackageStatus(packageIdx, bannedFlag);

    // Assert registry packages
    await assertPackages(registry, [{flags: bannedFlag, repo: newRepoAddress, name: newPackage.name}])

    // Package should have been removed from the packageIdxByName mapping
    await expect(registry.getPackageIdx(newPackage.name)).to.be.revertedWith("REGISTRY_INEXISTENT_NAME");
    expect(await registry.packageIdxByName(nameHash)).to.be.equal(0);
  });
});

/**
 * Call newPackageWithVersion and assert event is correct
 */
async function publishRepoVersion(registry: Registry, pkg: RepoPackage, version: VersionStruct): Promise<{repo: string}> {
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

async function assertRepoVersions(repo: Repo, expectedVersions: VersionStruct[]) {
  const versionCountBN = await repo.getVersionsCount();
  const versionCount = versionCountBN.toNumber();

  const versions: VersionStruct[] = [];

  for (let i = 1; i < versionCount + 1; i++) {
    const version = await repo.getByVersionId(i);
    versions.push({
      version: version.version,
      contentURI: version.contentURI,
    });
  }

  expect(versions).to.deep.equal(expectedVersions, "Wrong versions in repo");
}

async function assertPackages(registry: Registry, expectedPackages: PackageStruct[]) {
  const packageCountBN = await registry.getPackageCount();
  const packageCount = packageCountBN.toNumber();

  const packages: PackageStruct[] = [];

  for (let i = 1; i < packageCount + 1; i++) {
    const currentPackage = await registry.packages(i) as PackageStruct;
    packages.push({
      flags: currentPackage.flags,
      repo: currentPackage.repo,
      name: currentPackage.name,
    });
  }

  expect(packages).to.deep.equal(expectedPackages, "Wrong versions in repo");
}

function getEvent(events: Event[] = [], eventName: string): Event {
  const event = events.find((event) => event.event === eventName);
  if (!event) {
    throw Error(`No event found for ${eventName}`);
  }
  return event;
}

function calculateFlagValue(visible: Boolean, active: Boolean,validated: Boolean, banned: Boolean): number {
  const value = Number(visible) + Number(active)*2 + Number(validated)*4 + Number(banned)*8;
  return value;
}
