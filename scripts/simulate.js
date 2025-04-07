//// filepath: d:\OneDrive - CentraleSupelec\2A\Blockchain\PROJECT\Blockchain\scripts\simulate.js
const hre = require("hardhat");
const { ethers } = hre;

async function main() {
  // 1. Deploy the core contracts
  console.log("Deploying StakeholderRegistry...");
  const StakeholderRegistry = await ethers.getContractFactory("StakeholderRegistry");
  const registry = await StakeholderRegistry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("StakeholderRegistry deployed at:", registryAddress);

  console.log("Deploying ProductManager...");
  const ProductManager = await ethers.getContractFactory("ProductManager");
  const productManager = await ProductManager.deploy();
  await productManager.waitForDeployment();
  const productManagerAddress = await productManager.getAddress();
  console.log("ProductManager deployed at:", productManagerAddress);

  console.log("Deploying Token...");
  const Token = await ethers.getContractFactory("Token");
  const token = await Token.deploy();
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log("Token deployed at:", tokenAddress);

  console.log("Deploying ScoreEngine...");
  const ScoreEngine = await ethers.getContractFactory("ScoreEngine");
  const scoreEngine = await ScoreEngine.deploy(
    registryAddress, 
    tokenAddress, 
    productManagerAddress
  );
  await scoreEngine.waitForDeployment();
  const scoreEngineAddress = await scoreEngine.getAddress();
  console.log("ScoreEngine deployed at:", scoreEngineAddress);

  console.log("Deploying DisputeManager...");
  const DisputeManager = await ethers.getContractFactory("DisputeManager");
  const disputeManager = await DisputeManager.deploy(registryAddress, scoreEngineAddress);
  await disputeManager.waitForDeployment();
  const disputeManagerAddress = await disputeManager.getAddress();
  console.log("DisputeManager deployed at:", disputeManagerAddress);

  console.log("Deploying TransactionManager...");
  const TransactionManager = await ethers.getContractFactory("TransactionManager");
  const transactionManager = await TransactionManager.deploy(
    registryAddress,
    productManagerAddress,
    scoreEngineAddress,
    tokenAddress,
    disputeManagerAddress
  );
  await transactionManager.waitForDeployment();
  const transactionManagerAddress = await transactionManager.getAddress();
  console.log("TransactionManager deployed at:", transactionManagerAddress);

  // 2. Get signers and register a supplier and a factory.
  const [deployer, factory,supplier] = await ethers.getSigners();

  // Register supplier (role 1) and factory (role 2)
  console.log("Registering supplier and factory...");
  let tx = await registry.connect(supplier).registerStakeholder(1, "ipfs://supplier-metadata");
  await tx.wait();
  tx = await registry.connect(factory).registerStakeholder(2, "ipfs://factory-metadata");
  await tx.wait();
  console.log("Supplier and Factory are registered.");
console.log("Supplier address:", await supplier.getAddress());
console.log("Factory address:", await factory.getAddress());
  // 3. Supplier mints a product.
  console.log("Supplier minting a product...");
  tx = await productManager.connect(supplier).mintProduct("ipfs://product-supplier-1");
  const receipt = await tx.wait();
  // Assuming the ProductMinted event returns (productId) as args.


  // 4. Factory buys the product from the supplier.
  console.log("Factory buying the product from supplier...");
  tx = await transactionManager.connect(factory).recordBuyOperation(await supplier.getAddress(), 1);
  await tx.wait();
  // We'll assume the transaction ID is 1 (for simplicity) since this is the first transaction.
  const transactionId = 1;
  // Supplier confirms the sale.
  tx = await transactionManager.connect(supplier).confirmSellOperation(transactionId);
  await tx.wait();
  console.log("Product purchase confirmed.");

  // 5. Factory rates the supplier on three score types (0, 1, 2) with a value of 5.
  console.log("Factory rating supplier with all three scores of 5...");
  for (let scoreType = 0; scoreType <= 2; scoreType++) {
    tx = await transactionManager.connect(factory).buyerRateSeller(
      transactionId, 
      scoreType, 
      5,           // score value 5
      0,           // productIdForRating (not used here)
      false        // ratingFactory is false since rating supplier
    );
    await tx.wait();
    console.log(`Rated score type ${scoreType} with 5.`);
  }

  console.log("Simulation complete.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error in simulation:", error);
    process.exit(1);
  });