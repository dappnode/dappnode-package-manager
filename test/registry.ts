import {expect} from "chai";
import {ethers, upgrades} from "hardhat";
import {BigNumber, Event} from "ethers";
import {Registry, PackageStruct} from "../typechain-types/Registry";
import {Repo, VersionStruct} from "../typechain-types/Repo";
import {RegistryV2Mock} from "../typechain-types/RegistryV2Mock";

interface RepoPackage {
  name: string;
  dev: string;
  flags: BigNumber;
}

describe("Registry", function () {
  it("dnp.dappnode registry publish one package", async function () {
    const [owner, addr1] = await ethers.getSigners();

    const registryName = "dnp.dappnode";

    const newVersion1: VersionStruct = {
      version: "0.1.0",
      contentURIs: ["/ipfs/Qmaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
    };

    const newVersion2: VersionStruct = {
      version: "0.2.0-beta.0",
      contentURIs: ["/ipfs/Qmbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
    };

    const newPackage: RepoPackage = {
      name: "gnosis",
      dev: addr1.address,
      flags: ethers.BigNumber.from(0),
    };

    const Registry = await ethers.getContractFactory("Registry");

    const registry = (await upgrades.deployProxy(Registry, [registryName])) as Registry;
    await registry.deployed();

    expect(await registry.registryName()).to.equal(registryName, "Wrong registryName");

    // Publish new repo from admin account
    const {repo: newRepoAddress} = await publishRepoVersion(registry, newPackage, newVersion1);

    // Assert registry packages
    await assertPackages(registry, [{flags: newPackage.flags, repo: newRepoAddress, name: newPackage.name}]);

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
    await expect(repoWithAdmin.newVersion(newVersion1.version, newVersion1.contentURIs)).to.be.revertedWith(
      "AccessControl"
    );

    // Attempt to publish a version on an existing version str
    await expect(repoWithDev.newVersion(newVersion1.version, newVersion1.contentURIs)).to.be.revertedWith(
      "REPO_EXISTENT_VERSION"
    );

    // Publish a version on a different version str
    const newVersionTx = await repoWithDev.newVersion(newVersion2.version, newVersion2.contentURIs, {
      from: addr1.address,
    });
    const newVersionReceipt = await newVersionTx.wait();

    const newVersionEvent = getEvent(newVersionReceipt.events, "NewVersion");
    expect(newVersionEvent.args!.version).to.equal(newVersion2.version, "Wrong event NewVersion.version");
    expect(newVersionEvent.args!.contentURIs).to.equal(newVersion2.contentURIs, "Wrong event NewVersion.contentURIs");

    // Assert that there are two version in the Repo contract
    await assertRepoVersions(repoWithDev, [newVersion1, newVersion2]);
  });

  it("public.dappnode registry publish one package and validate", async function () {
    const [owner, addr1] = await ethers.getSigners();

    const registryName = "public.dappnode";

    const newVersion1: VersionStruct = {
      version: "0.1.0",
      contentURIs: ["/ipfs/Qmaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
    };

    const newPackage = {
      name: "gnosis-test",
      dev: addr1.address,
      flags: ethers.BigNumber.from(0),
    };

    const Registry = await ethers.getContractFactory("Registry");

    const registryAdmin = (await upgrades.deployProxy(Registry, [registryName])) as Registry;
    await registryAdmin.deployed();

    expect(await registryAdmin.registryName()).to.equal(registryName, "Wrong registryName");

    // Test that non-auth users can NOT publish packages
    const registryUser = (await ethers.getContractAt("Registry", registryAdmin.address, addr1)) as Registry;
    await expect(publishRepoVersion(registryUser, newPackage, newVersion1)).to.be.revertedWith("NO_ADD_PACKAGE_ROLE");

    // Allow anyone to publish package
    await registryAdmin.setAddPackageAnyAddress(true);

    // Test that non-auth users DO can publish packages
    const {repo: newRepoAddress} = await publishRepoVersion(registryUser, newPackage, newVersion1);

    // Assert registry packages
    await assertPackages(registryUser, [{flags: newPackage.flags, repo: newRepoAddress, name: newPackage.name}]);

    // Connect to deployed repo
    const repoUser = (await ethers.getContractAt("Repo", newRepoAddress, addr1)) as Repo;

    // Assert that there are two version in the Repo contract
    await assertRepoVersions(repoUser, [newVersion1]);
  });

  it("public.dappnode replace a malicious repo using setPackageRepo", async function () {
    const [owner, addr1, dev] = await ethers.getSigners();

    const registryName = "dnp.dappnode";

    const badVersion: VersionStruct = {
      version: "0.1.0",
      contentURIs: ["/ipfs/notcorrectversion"],
    };

    const badPackage: RepoPackage = {
      name: "gnosis",
      dev: addr1.address,
      flags: ethers.BigNumber.from(0),
    };

    const correctPackage: RepoPackage = {
      name: "gnosis",
      dev: dev.address,
      flags: ethers.BigNumber.from(0),
    };

    const correctVersion: VersionStruct = {
      version: "0.1.0",
      contentURIs: ["/ipfs/Qmaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
    };

    const Registry = await ethers.getContractFactory("Registry");

    const registry = (await upgrades.deployProxy(Registry, [registryName])) as Registry;
    await registry.deployed();

    expect(await registry.registryName()).to.equal(registryName, "Wrong registryName");

    // Publish new repo from admin account
    const {repo: repoAddress} = await publishRepoVersion(registry, badPackage, badVersion);

    // Assert registry packages
    await assertPackages(registry, [{flags: badPackage.flags, repo: repoAddress, name: badPackage.name}]);

    // Replace the bad package with a new one
    const Repo = await ethers.getContractFactory("Repo");
    const newRepoAddress = (await upgrades.deployProxy(Repo, [dev.address], {
      unsafeAllow: ["constructor"],
    })) as Repo;

    const repoWithDev = (await ethers.getContractAt("Repo", newRepoAddress.address, dev)) as Repo;

    // Publish a version on the new repo
    const newVersionTx = await repoWithDev.newVersion(correctVersion.version, correctVersion.contentURIs);
    const newVersionReceipt = await newVersionTx.wait();

    const newVersionEvent = getEvent(newVersionReceipt.events, "NewVersion");
    expect(newVersionEvent.args!.version).to.equal(correctVersion.version, "Wrong event NewVersion.version");
    expect(newVersionEvent.args!.contentURIs).to.equal(
      correctVersion.contentURIs,
      "Wrong event NewVersion.contentURIs"
    );

    // Assert that there are one version in the Repo contract
    await assertRepoVersions(repoWithDev, [correctVersion]);

    // Check that the malicious package is the idx 1
    const packageIdx = 1;
    expect(await registry.getPackageIdx(badPackage.name)).to.be.equal(packageIdx);

    // Overwrite repo address
    const registryUser = (await ethers.getContractAt("Registry", registry.address, addr1)) as Registry;
    expect(registryUser.setPackageRepo(packageIdx, newRepoAddress.address)).to.be.revertedWith(
      "AccessControl: account 0x70997970c51812dc3a010c7d01b50e0d17dc79c8 is missing role 0x16bd2aca01d0d7886c05a93638707d130beb22ebb67403e39bc35ee20a0de336"
    );

    await registry.setPackageRepo(packageIdx, newRepoAddress.address);

    // Assert registry packages
    await assertPackages(registry, [
      {flags: correctPackage.flags, repo: newRepoAddress.address, name: correctPackage.name},
    ]);
  });

  it("public.dappnode registry publish one package and set flags", async function () {
    const [owner, addr1] = await ethers.getSigners();

    const registryName = "dnp.dappnode";

    const newVersion1: VersionStruct = {
      version: "0.1.0",
      contentURIs: ["/ipfs/Qmaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
    };

    const newPackage: RepoPackage = {
      name: "gnosis",
      dev: addr1.address,
      flags: ethers.BigNumber.from(0),
    };

    const Registry = await ethers.getContractFactory("Registry");

    const registry = (await upgrades.deployProxy(Registry, [registryName])) as Registry;
    await registry.deployed();

    expect(await registry.registryName()).to.equal(registryName, "Wrong registryName");

    // Publish new repo from admin account
    const {repo: newRepoAddress} = await publishRepoVersion(registry, newPackage, newVersion1);

    // Assert registry packages
    await assertPackages(registry, [{flags: newPackage.flags, repo: newRepoAddress, name: newPackage.name}]);

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
    await assertPackages(registry, [{flags: flagValue, repo: newRepoAddress, name: newPackage.name}]);
    expect(await registry.getPackageIdx(newPackage.name)).to.be.equal(packageIdx);

    // Calculate flag value banned
    const bannedFlag = calculateFlagValue(false, false, false, true);

    // Set package flags
    await registry.setPackageStatus(packageIdx, bannedFlag);

    // Assert registry packages
    await assertPackages(registry, [{flags: bannedFlag, repo: newRepoAddress, name: newPackage.name}]);
  });

  it("public.dappnode registry upgradability test", async function () {
    const registryName = "dnp.dappnode";

    const Registry = await ethers.getContractFactory("Registry");

    const registry = (await upgrades.deployProxy(Registry, [registryName])) as Registry;
    await registry.deployed();

    expect(await registry.registryName()).to.equal(registryName, "Wrong registryName");

    // Prepare upgrade
    const RegistryV2 = await ethers.getContractFactory("RegistryV2Mock");
    const registryV2 = RegistryV2.attach(registry.address) as RegistryV2Mock;

    // Check that the contract is not yet upgraded
    // For some reason the expect to be reverted does not work when the function selector does not exist
    try {
      await registryV2.setVersion();
      throw new Error("Unreachable code");
    } catch (error: unknown) {
      const {message} = error as Error;
      expect(message).to.be.equal(
        "Transaction reverted: function selector was not recognized and there's no fallback function"
      );
    }

    // Upgrade the contract
    await upgrades.upgradeProxy(registry.address, RegistryV2);

    // Check upgrade
    await registryV2.setVersion();
    expect(await registryV2.getVersion()).to.be.equal(2);
  });
});

/**
 * Call newPackageWithVersion and assert event is correct
 */
async function publishRepoVersion(
  registry: Registry,
  pkg: RepoPackage,
  version: VersionStruct
): Promise<{repo: string}> {
  const newPackageWithVersionTx = await registry.newPackageWithVersion(
    pkg.name,
    pkg.dev,
    pkg.flags,
    version.version,
    version.contentURIs
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
      contentURIs: version.contentURIs,
    });
  }

  expect(versions).to.deep.equal(expectedVersions, "Wrong versions in repo");
}

async function assertPackages(registry: Registry, expectedPackages: PackageStruct[]) {
  const packageCountBN = await registry.getPackageCount();
  const packageCount = packageCountBN.toNumber();

  const packages: PackageStruct[] = [];

  for (let i = 1; i < packageCount + 1; i++) {
    const currentPackage = (await registry.packages(i)) as PackageStruct;
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

function calculateFlagValue(visible: Boolean, active: Boolean, validated: Boolean, banned: Boolean): BigNumber {
  const value = Number(visible) + Number(active) * 2 + Number(validated) * 4 + Number(banned) * 8;
  return ethers.BigNumber.from(value);
}
