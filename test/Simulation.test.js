const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Network Simulation", function () {
  it("simulates a full network of interactions", async function () {
    // Get signers: [deployer, supplier1, supplier2, supplier3, factory1, factory2, distributor1, distributor2, retailer1, retailer2, consumer1,...,consumer10]
    const [
      deployer,
      supplier1,
      supplier2,
      supplier3,
      factory1,
      factory2,
      distributor1,
      distributor2,
      retailer1,
      retailer2,
      ...consumers
    ] = await ethers.getSigners();
    // Alias the first 10 consumers.
    const [
      consumer1,
      consumer2,
      consumer3,
      consumer4,
      consumer5,
      consumer6,
      consumer7,
      consumer8,
      consumer9,
      consumer10
    ] = consumers;
    
    async function getEvent(tx, eventTag, contract) { 
      const receipt = await tx.wait();
      const iface = contract.interface;
      let parsedEvent;
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed.name === eventTag) { 
            parsedEvent = parsed;
            break;
          }
        } catch (error) {
          // Skip logs that don't belong to this contract.
        }
      }
      if (!parsedEvent) {
        throw new Error("Event not found"); 
      }
      return parsedEvent;
    }

    // Deploy core contracts.
    const StakeholderRegistry = await ethers.getContractFactory("StakeholderRegistry");
    const registry = await StakeholderRegistry.deploy();
    await registry.waitForDeployment();

    const ProductManager = await ethers.getContractFactory("ProductManager");
    const productManager = await ProductManager.deploy();
    await productManager.waitForDeployment();

    const Token = await ethers.getContractFactory("Token");
    const token = await Token.deploy();
    await token.waitForDeployment();

    const ScoreEngine = await ethers.getContractFactory("ScoreEngine");
    const scoreEngine = await ScoreEngine.deploy(
      await registry.getAddress(),
      await token.getAddress(),
      await productManager.getAddress()
    );
    await scoreEngine.waitForDeployment();

    const DisputeManager = await ethers.getContractFactory("DisputeManager");
    const disputeManager = await DisputeManager.deploy(await registry.getAddress(), await scoreEngine.getAddress());
    await disputeManager.waitForDeployment();


    const TransactionManager = await ethers.getContractFactory("TransactionManager");
    const transactionManager = await TransactionManager.deploy(
      await registry.getAddress(),
      await productManager.getAddress(),
      await scoreEngine.getAddress(),
      await token.getAddress(),
      await disputeManager.getAddress()
    );
    await transactionManager.waitForDeployment();

    // Register stakeholders.
    await registry.connect(supplier1).registerStakeholder(1, "ipfs://supplier1");
    await registry.connect(supplier2).registerStakeholder(1, "ipfs://supplier2");
    await registry.connect(supplier3).registerStakeholder(1, "ipfs://supplier3");

    await registry.connect(factory1).registerStakeholder(2, "ipfs://factory1");
    await registry.connect(factory2).registerStakeholder(2, "ipfs://factory2");

    await registry.connect(distributor1).registerStakeholder(3, "ipfs://distributor1");
    await registry.connect(distributor2).registerStakeholder(3, "ipfs://distributor2");

    await registry.connect(retailer1).registerStakeholder(4, "ipfs://retailer1");
    await registry.connect(retailer2).registerStakeholder(4, "ipfs://retailer2");

    await registry.connect(consumer1).registerStakeholder(5, "ipfs://consumer1");
    await registry.connect(consumer2).registerStakeholder(5, "ipfs://consumer2");
    await registry.connect(consumer3).registerStakeholder(5, "ipfs://consumer3");
    await registry.connect(consumer4).registerStakeholder(5, "ipfs://consumer4");
    await registry.connect(consumer5).registerStakeholder(5, "ipfs://consumer5");
    await registry.connect(consumer6).registerStakeholder(5, "ipfs://consumer6");
    await registry.connect(consumer7).registerStakeholder(5, "ipfs://consumer7");
    await registry.connect(consumer8).registerStakeholder(5, "ipfs://consumer8");
    await registry.connect(consumer9).registerStakeholder(5, "ipfs://consumer9");
    await registry.connect(consumer10).registerStakeholder(5, "ipfs://consumer10");

    // Fund participants.
    const initialTokens = ethers.parseUnits("10000", "ether");
    await token.transfer(await factory1.getAddress(), initialTokens);
    await token.transfer(await factory2.getAddress(), initialTokens);
    await token.transfer(await scoreEngine.getAddress(), ethers.parseUnits("1000", "ether"));
    const stakeholderFunding = ethers.parseUnits("500", "ether");
    await token.transfer(await distributor1.getAddress(), stakeholderFunding);
    await token.transfer(await distributor2.getAddress(), stakeholderFunding);
    await token.transfer(await retailer1.getAddress(), stakeholderFunding);
    await token.transfer(await retailer2.getAddress(), stakeholderFunding);
    await token.transfer(await consumer1.getAddress(), stakeholderFunding);
    await token.transfer(await consumer2.getAddress(), stakeholderFunding);

    const REWARD_AMOUNT = ethers.parseUnits("10", "ether");

    // ---------------------------
    // 1. Factory -> Supplier Purchases (Buyer-Initiated)
    // ---------------------------
    // Transaction 1: Factory1 buys from Supplier1 (no deposit required)
    let tx = await transactionManager.connect(factory1).recordBuyOperation(await supplier1.getAddress(),0);
    await tx.wait();
    tx = await transactionManager.connect(supplier1).confirmSellOperation(1);
    await tx.wait();
    tx = await transactionManager.connect(factory1).buyerRateSeller(1, 0, 8, 0,false);
    await tx.wait();

    // Transaction 2: Factory2 buys from Supplier2 (no deposit required)
    tx = await transactionManager.connect(factory2).recordBuyOperation(await supplier2.getAddress(),0);
    await tx.wait();
    tx = await transactionManager.connect(supplier2).confirmSellOperation(2);
    await tx.wait();
    tx = await transactionManager.connect(factory2).buyerRateSeller(2, 0, 9, 0,false);
    await tx.wait();

    // Transaction 3: Factory1 buys from Supplier3 (no deposit required)
    tx = await transactionManager.connect(factory1).recordBuyOperation(await supplier3.getAddress(),0);
    await tx.wait();
    tx = await transactionManager.connect(supplier3).confirmSellOperation(3);
    await tx.wait();
    tx = await transactionManager.connect(factory1).buyerRateSeller(3, 0, 7, 0,false);
    await tx.wait();

    // ---------------------------
    // 2. Distributor -> Factory Purchases (Factory Products)
    // ---------------------------
    // Factory1 mints a product.
    tx = await productManager.connect(factory1).mintProduct("ipfs://product-factory1-1");
    let productId1 = (await getEvent(tx, "ProductMinted", productManager)).args.productId;
    
    // Distributor1 buys product from Factory1.
    tx = await transactionManager.connect(distributor1).recordBuyOperation(await factory1.getAddress(), productId1);
    await tx.wait();
    // Seller (Factory1) approves deposit.
    await token.connect(factory1).approve(transactionManager.getAddress(), REWARD_AMOUNT);
    tx = await transactionManager.connect(factory1).confirmSellOperation(4);
    await tx.wait();

    // Factory2 mints a product.
    tx = await productManager.connect(factory2).mintProduct("ipfs://product-factory2-1");
    let productId2 = (await getEvent(tx, "ProductMinted", productManager)).args.productId;
    
    // Distributor2 buys product from Factory2.
    tx = await transactionManager.connect(distributor2).recordBuyOperation(await factory2.getAddress(), productId2);
    await tx.wait();
    // Seller (Factory2) approves deposit.
    await token.connect(factory2).approve(transactionManager.getAddress(), REWARD_AMOUNT);
    tx = await transactionManager.connect(factory2).confirmSellOperation(5);
    await tx.wait();

    // ---------------------------
    // 3. Retailer -> Distributor Purchases (with deposit from seller)
    // ---------------------------
    // Retailer1 buys productId1 from Distributor1.
    tx = await transactionManager.connect(retailer1).recordBuyOperation(await distributor1.getAddress(), productId1);
    await tx.wait();
    // Seller (Distributor1) approves deposit.
    await token.connect(distributor1).approve(transactionManager.getAddress(), REWARD_AMOUNT);
    tx = await transactionManager.connect(distributor1).confirmSellOperation(6);
    await tx.wait();
    tx = await transactionManager.connect(retailer1).buyerRateSeller(6, 6, 7, 0,false);
    await tx.wait();

    // Retailer2 buys from Distributor2.
    tx = await transactionManager.connect(retailer2).recordBuyOperation(await distributor2.getAddress(), productId2);
    await tx.wait();
    // Seller (Distributor2) approves deposit.
    await token.connect(distributor2).approve(transactionManager.getAddress(), REWARD_AMOUNT);
    tx = await transactionManager.connect(distributor2).confirmSellOperation(7);
    await tx.wait();
    tx = await transactionManager.connect(retailer2).buyerRateSeller(7, 6, 8, 0,false);
    await tx.wait();

    // ---------------------------
    // 4. Consumer -> Retailer Purchases (with deposit from seller)
    // ---------------------------
    // Consumer1 buys from Retailer1.
    tx = await transactionManager.connect(consumer1).recordBuyOperation(await retailer1.getAddress(), productId1);
    await tx.wait();
    // Seller (Retailer1) approves deposit.
    await token.connect(retailer1).approve(transactionManager.getAddress(), REWARD_AMOUNT);
    tx = await transactionManager.connect(retailer1).confirmSellOperation(8);
    await tx.wait();
    tx = await transactionManager.connect(consumer1).buyerRateSeller(8, 10, 9, 0,false);
    await tx.wait();

    // Consumer2 buys from Retailer2.
    tx = await transactionManager.connect(consumer2).recordBuyOperation(await retailer2.getAddress(),productId2);
    await tx.wait();
    // Seller (Retailer2) approves deposit.
    await token.connect(retailer2).approve(transactionManager.getAddress(), REWARD_AMOUNT);
    tx = await transactionManager.connect(retailer2).confirmSellOperation(9);
    await tx.wait();
    tx = await transactionManager.connect(consumer2).buyerRateSeller(9, 10, 8, 0,false);
    await tx.wait();

    // 5. Consumer -> Factory Rating (Chain: Distributor -> Factory, then Retailer, then Consumer)
    // ---------------------------
    // Factory1 mints a new product.
    tx = await productManager.connect(factory1).mintProduct("ipfs://product-factory1-special");
    let specialProductId = (await getEvent(tx, "ProductMinted", productManager)).args.productId;

    // Distributor1 buys the product from Factory1.
    tx = await transactionManager.connect(distributor1).recordBuyOperation(await factory1.getAddress(), specialProductId);
    await tx.wait();
    // Seller (Factory1) approves deposit.
    await token.connect(factory1).approve(transactionManager.getAddress(), REWARD_AMOUNT);
    tx = await transactionManager.connect(factory1).confirmSellOperation(10);
    await tx.wait();

    // Retailer1 buys from Distributor1.
    tx = await transactionManager.connect(retailer1).recordBuyOperation(await distributor1.getAddress(),specialProductId);
    await tx.wait();
    // Seller (Distributor1) approves deposit.
    await token.connect(distributor1).approve(transactionManager.getAddress(), REWARD_AMOUNT);
    tx = await transactionManager.connect(distributor1).confirmSellOperation(11);
    await tx.wait();

    // Consumer4 buys from Retailer1.
    tx = await transactionManager.connect(consumer4).recordBuyOperation(await retailer1.getAddress(),specialProductId);
    await tx.wait();
    // Seller (Retailer1) approves deposit.
    await token.connect(retailer1).approve(transactionManager.getAddress(), REWARD_AMOUNT);
    tx = await transactionManager.connect(retailer1).confirmSellOperation(12);
    await tx.wait();

    // Consumer4 rates Retailer1.
    tx = await transactionManager.connect(consumer4).buyerRateSeller(12, 10, 8, 0, false);
    await tx.wait();

    // Consumer4 also rates Factory1 using the ScoreEngine directly.
    tx = await transactionManager.connect(consumer4).buyerRateSeller(12,5,7,specialProductId,true)
    await tx.wait();

    // Verify product details.
    const productDetails = await productManager.getProductDetails(specialProductId);
    expect(productDetails.creator).to.equal(await factory1.getAddress());
    expect(productDetails.currentOwner).to.equal(await consumer4.getAddress());
  });
});
