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
  const [deployer, factory, supplier, factory2] = await ethers.getSigners();

  // Register supplier (role 1) and factory (role 2)
  console.log("Registering supplier and factory...");
  let tx = await registry.connect(supplier).registerStakeholder(1, "ipfs://supplier-metadata");
  await tx.wait();
  tx = await registry.connect(factory).registerStakeholder(2, "ipfs://factory-metadata");
  await tx.wait();
  tx = await registry.connect(factory2).registerStakeholder(2, "ipfs://factory-metadata");
  await tx.wait();
  console.log("Supplier and Factory are registered.");
  console.log("Supplier address:", await supplier.getAddress());
  console.log("Factory address:", await factory.getAddress());
  console.log("Factory2 address:", await factory2.getAddress());
  
  // Distribute tokens to participants (similar to the test file)
  console.log("Distributing tokens to participants...");
  const tokensToDistribute = ethers.parseUnits("100", "ether"); // 100 tokens
  
  // Send tokens to supplier
  tx = await token.transfer(await supplier.getAddress(), tokensToDistribute);
  await tx.wait();
  console.log(`Transferred ${ethers.formatUnits(tokensToDistribute, "ether")} tokens to Supplier`);
  
  // Send tokens to factory
  tx = await token.transfer(await factory.getAddress(), tokensToDistribute);
  await tx.wait();
  console.log(`Transferred ${ethers.formatUnits(tokensToDistribute, "ether")} tokens to Factory`);
  
  // Send tokens to factory2
  tx = await token.transfer(await factory2.getAddress(), tokensToDistribute);
  await tx.wait();
  console.log(`Transferred ${ethers.formatUnits(tokensToDistribute, "ether")} tokens to Factory2`);
  
  // Also send tokens to ScoreEngine for rewards
  tx = await token.transfer(scoreEngineAddress, ethers.parseUnits("1000", "ether"));
  await tx.wait();
  console.log(`Transferred ${ethers.formatUnits(ethers.parseUnits("1000", "ether"), "ether")} tokens to ScoreEngine`);
  
  // Check token balances
  const supplierBalance = await token.balanceOf(await supplier.getAddress());
  const factoryBalance = await token.balanceOf(await factory.getAddress());
  const factory2Balance = await token.balanceOf(await factory2.getAddress());
  
  console.log(`Supplier token balance: ${ethers.formatUnits(supplierBalance, "ether")}`);
  console.log(`Factory token balance: ${ethers.formatUnits(factoryBalance, "ether")}`);
  console.log(`Factory2 token balance: ${ethers.formatUnits(factory2Balance, "ether")}`);

  // 3. Supplier mints a product.
  console.log("Supplier minting a product...");
  tx = await productManager.connect(supplier).mintProduct("ipfs://product-supplier-1");
  const receipt = await tx.wait();
  // Extract product ID from event
  const productId = 1; // Assuming first product has ID 1
  console.log(`Product minted with ID: ${productId}`);

  // 4. Factory buys the product from the supplier.
  console.log("Factory buying the product from supplier...");
  tx = await transactionManager.connect(factory).recordBuyOperation(await supplier.getAddress(), productId);
  await tx.wait();
  const transactionId = 1; // First transaction
  
  // Supplier confirms the sale
  tx = await transactionManager.connect(supplier).confirmSellOperation(transactionId);
  await tx.wait();
  console.log("Product purchase confirmed, transaction ID:", transactionId);

  // 5. Factory rates the supplier on three score types (0, 1, 2) with values.
  console.log("Factory rating supplier with scores...");
  const scoreTypes = [
    { type: 0, name: "Trust", value: 8 },
    { type: 1, name: "Delivery speed", value: 7 },
    { type: 2, name: "Material quality", value: 9 }
  ];
  
  for (const score of scoreTypes) {
    tx = await transactionManager.connect(factory).buyerRateSeller(
      transactionId,
      score.type,
      score.value,
      0,           // productIdForRating (not used here)
      false        // ratingFactory is false since rating supplier
    );
    await tx.wait();
    console.log(`Rated ${score.name} (type ${score.type}) with ${score.value}/10.`);
  }

  // 6. Factory2 also buys from the supplier and rates
  console.log("Factory2 buying the product from supplier...");
  // Supplier mints another product
  tx = await productManager.connect(supplier).mintProduct("ipfs://product-supplier-2");
  const receipt2 = await tx.wait();
  const productId2 = 2; // Assuming second product has ID 2
  
  // Factory2 buys the product
  tx = await transactionManager.connect(factory2).recordBuyOperation(await supplier.getAddress(), productId2);
  await tx.wait();
  const transactionId2 = 2; // Second transaction
  
  // Supplier confirms the second sale
  tx = await transactionManager.connect(supplier).confirmSellOperation(transactionId2);
  await tx.wait();
  console.log("Second product purchase confirmed, transaction ID:", transactionId2);
  
  // Factory2 rates the supplier
  console.log("Factory2 rating supplier with scores...");
  const scoreTypesFactory2 = [
    { type: 0, name: "Trust", value: 7 },
    { type: 1, name: "Product quality", value: 8 },
    { type: 2, name: "Eco rating", value: 6 }
  ];
  
  for (const score of scoreTypesFactory2) {
    tx = await transactionManager.connect(factory2).buyerRateSeller(
      transactionId2,
      score.type,
      score.value,
      0,
      false
    );
    await tx.wait();
    console.log(`Factory2 rated ${score.name} (type ${score.type}) with ${score.value}/10.`);
  }

  console.log("\nSimulation complete.");
  
  // Summary
  console.log("\nSIMULATION SUMMARY:");
  console.log("-------------------");
  console.log("Contracts deployed:");
  console.log(`- StakeholderRegistry: ${registryAddress}`);
  console.log(`- ProductManager: ${productManagerAddress}`);
  console.log(`- Token: ${tokenAddress}`);
  console.log(`- ScoreEngine: ${scoreEngineAddress}`);
  console.log(`- DisputeManager: ${disputeManagerAddress}`);
  console.log(`- TransactionManager: ${transactionManagerAddress}`);
  console.log("\nStakeholders registered:");
  console.log(`- Supplier: ${await supplier.getAddress()}`);
  console.log(`- Factory: ${await factory.getAddress()}`);
  console.log(`- Factory2: ${await factory2.getAddress()}`);
  console.log("\nTransactions created:");
  console.log(`- Transaction #${transactionId}: Factory bought Product #${productId} from Supplier`);
  console.log(`- Transaction #${transactionId2}: Factory2 bought Product #${productId2} from Supplier`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error in simulation:", error);
    process.exit(1);
  });