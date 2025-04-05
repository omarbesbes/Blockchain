const hre = require("hardhat"); // CommonJS import
const { ethers } = hre;         // ethers from Hardhat

async function main() {
  // 1. Deploy StakeholderRegistry
  const StakeholderRegistry = await ethers.getContractFactory("StakeholderRegistry");
  console.log("Deploying StakeholderRegistry...");
  const stakeholderRegistry = await StakeholderRegistry.deploy();
  await stakeholderRegistry.waitForDeployment();
  console.log("StakeholderRegistry deployed to:", stakeholderRegistry.target);

  // 2. Deploy DisputeManager (requires registry address)
  const DisputeManager = await ethers.getContractFactory("DisputeManager");
  console.log("Deploying DisputeManager...");
  const disputeManager = await DisputeManager.deploy(stakeholderRegistry.target);
  await disputeManager.waitForDeployment();
  console.log("DisputeManager deployed to:", disputeManager.target);

  // 3. Deploy ProductManager (standalone)
  const ProductManager = await ethers.getContractFactory("ProductManager");
  console.log("Deploying ProductManager...");
  const productManager = await ProductManager.deploy();
  await productManager.waitForDeployment();
  console.log("ProductManager deployed to:", productManager.target);

  // 4. Deploy ScoreEngine (requires registry + disputeManager)
  const ScoreEngine = await ethers.getContractFactory("ScoreEngine");
  console.log("Deploying ScoreEngine...");
  const scoreEngine = await ScoreEngine.deploy(stakeholderRegistry.target, disputeManager.target);
  await scoreEngine.waitForDeployment();
  console.log("ScoreEngine deployed to:", scoreEngine.target);
}

// We use a top-level async/await pattern here
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
