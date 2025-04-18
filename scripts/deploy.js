const hre = require("hardhat"); // CommonJS import
const { ethers } = hre;         // ethers from Hardhat

async function main() {
  let TransactionManager, transactionManager;
  let StakeholderRegistry, registry;
  let ProductManager, productManager;
  let ScoreEngine, scoreEngine;
  let Token, token;
  let DisputeManager, disputeManager;

  console.log("=== Starting contract deployment ===");

  // 1. Deploy and set up StakeholderRegistry
  console.log("Deploying StakeholderRegistry...");
  StakeholderRegistry = await ethers.getContractFactory("StakeholderRegistry");
  registry = await StakeholderRegistry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log(`✅ StakeholderRegistry deployed at: ${registryAddress}`);

  // 2. Deploy ProductManager
  console.log("Deploying ProductManager...");
  ProductManager = await ethers.getContractFactory("ProductManager");
  productManager = await ProductManager.deploy();
  await productManager.waitForDeployment();
  const productManagerAddress = await productManager.getAddress();
  console.log(`✅ ProductManager deployed at: ${productManagerAddress}`);

  
  // 4. Deploy Token
  console.log("Deploying Token...");
  Token = await ethers.getContractFactory("Token");
  token = await Token.deploy();
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log(`✅ Token deployed at: ${tokenAddress}`);

  // 5. Deploy ScoreEngine
  console.log("Deploying ScoreEngine...");
  ScoreEngine = await ethers.getContractFactory("ScoreEngine");
  scoreEngine = await ScoreEngine.deploy(
    registryAddress,
    tokenAddress,
    productManagerAddress
  );
  await scoreEngine.waitForDeployment();
  const scoreEngineAddress = await scoreEngine.getAddress();
  console.log(`✅ ScoreEngine deployed at: ${scoreEngineAddress}`);

  // 3. Deploy DisputeManager
  console.log("Deploying DisputeManager...");
  DisputeManager = await ethers.getContractFactory("DisputeManager");
  disputeManager = await DisputeManager.deploy(registryAddress,scoreEngineAddress);
  await disputeManager.waitForDeployment();
  const disputeManagerAddress = await disputeManager.getAddress();
  console.log(`✅ DisputeManager deployed at: ${disputeManagerAddress}`);

  // 6. Deploy TransactionManager
  console.log("Deploying TransactionManager...");
  TransactionManager = await ethers.getContractFactory("TransactionManager");
  transactionManager = await TransactionManager.deploy(
    registryAddress,
    productManagerAddress,
    scoreEngineAddress,
    tokenAddress,
    disputeManagerAddress
  );
  await transactionManager.waitForDeployment();
  const transactionManagerAddress = await transactionManager.getAddress();
  console.log(`✅ TransactionManager deployed at: ${transactionManagerAddress}`);

  console.log("=== All contracts deployed successfully ===");
  
  // Print summary of all deployments
  console.log("\n=== Contract Deployment Summary ===");
  console.log(`StakeholderRegistry: ${registryAddress}`);
  console.log(`ProductManager: ${productManagerAddress}`);
  console.log(`DisputeManager: ${disputeManagerAddress}`);
  console.log(`Token: ${tokenAddress}`);
  console.log(`ScoreEngine: ${scoreEngineAddress}`);
  console.log(`TransactionManager: ${transactionManagerAddress}`);
}

// We use a top-level async/await pattern here
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });