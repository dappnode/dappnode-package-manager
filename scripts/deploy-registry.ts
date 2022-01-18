import {ethers} from "hardhat";
import {Registry} from "../typechain-types/Registry";

async function main() {
  const registryName = "dnp.dappnode";

  /*
        Deploy Registry contract
  */
  console.log("\n#######################");
  console.log("##### Deployment Registry Contract #####");
  console.log("#######################");
  console.log("registryName:", registryName);

  const Registry = await ethers.getContractFactory("Registry");
  const registry = (await Registry.deploy(registryName)) as Registry;
  await registry.deployed();

  console.log("#######################\n");
  console.log("Dappnode Registry Contract deployed to:", registry.address);

  console.log("\n#######################");
  console.log("#####    Checks    #####");
  console.log("#######################");
  console.log("registryName:", await registry.registryName());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
