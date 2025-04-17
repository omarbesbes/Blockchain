// scripts/addStakeholders.js
const { ethers } = require("hardhat");

async function main() {
  // Replace this address with the actual deployed StakeholderRegistry address
  const registryAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

  // Get the contract factory and attach to the deployed instance
  const StakeholderRegistry = await ethers.getContractFactory("StakeholderRegistry");
  const registry = StakeholderRegistry.attach(registryAddress);
  console.log("Attached to StakeholderRegistry at:", await registry.getAddress());

  // // Get signers (these simulate different accounts)
  const [owner, stakeholder1, stakeholder2, stakeholder3] = await ethers.getSigners();

  // Define roles and metadata URIs.
  // Adjust role numbers as defined in contract's enum.
  const role1 = 2, metadata1 = "ipfs://metadata_for_stakeholder1"; // e.g., Factory
  const role2 = 3, metadata2 = "ipfs://metadata_for_stakeholder2"; // e.g., Distributor
  const role3 = 4, metadata3 = "ipfs://metadata_for_stakeholder3"; // e.g., Factory

  // Register Stakeholder 1 using stakeholder1 account
  const tx1 = await registry.connect(stakeholder1).registerStakeholder(role1, metadata1);
  await tx1.wait();
  console.log(`Stakeholder 1 registered as role ${role1}`);

  // Register Stakeholder 2 using stakeholder2 account
  const tx2 = await registry.connect(stakeholder2).registerStakeholder(role2, metadata2);
  await tx2.wait();
  console.log(`Stakeholder 2 registered as role ${role2}`);

  // Register Stakeholder 3 using stakeholder3 account
  const tx3 = await registry.connect(stakeholder3).registerStakeholder(role3, metadata3);
  await tx3.wait();
  console.log(`Stakeholder 3 registered as role ${role3}`);
  const addresss= await stakeholder3.getAddress();
  console.log(`Stakeholder 3 registered as role ${addresss}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
