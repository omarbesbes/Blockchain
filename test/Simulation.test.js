const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Network Simulation", function () {
  it("simulates a full network of interactions", async function () {
    // Get signers: assume the order is as follows:
    // [deployer, supplier1, supplier2, supplier3, factory1, factory2, distributor1, distributor2, retailer1, retailer2, consumer1,...,consumer10]
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
    // For clarity, alias the first 10 consumers
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
            // Log doesn't belong to contract, skip.
            }
        }
        if (!parsedEvent) {
            throw new Error("Event not found"); 
        }
        return parsedEvent;
    }

    // Deploy the core contracts
    const StakeholderRegistry = await ethers.getContractFactory("StakeholderRegistry");
    const registry = await StakeholderRegistry.deploy();
    await registry.waitForDeployment();

    const ProductManager = await ethers.getContractFactory("ProductManager");
    const productManager = await ProductManager.deploy();
    await productManager.waitForDeployment();

    const DisputeManager = await ethers.getContractFactory("DisputeManager");
    const disputeManager = await DisputeManager.deploy(await registry.getAddress());
    await disputeManager.waitForDeployment();

    const Token = await ethers.getContractFactory("Token");
    const token = await Token.deploy();
    await token.waitForDeployment();

    const ScoreEngine = await ethers.getContractFactory("ScoreEngine");
    const scoreEngine = await ScoreEngine.deploy(
      await registry.getAddress(),
      await disputeManager.getAddress(),
      await token.getAddress(),
      await productManager.getAddress()
    );
    await scoreEngine.waitForDeployment();

    const TransactionManager = await ethers.getContractFactory("TransactionManager");
    const transactionManager = await TransactionManager.deploy(
      await registry.getAddress(),
      await productManager.getAddress(),
      await scoreEngine.getAddress(),
      await token.getAddress()
    );
    await transactionManager.waitForDeployment();

    // Roles: Supplier=1, Factory=2, Distributor=3, Retailer=4, Consumer=5.
    // Register all stakeholders with their respective roles and a metadata URI.
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

    // Fund factories with tokens (only factories get initial tokens)
    const initialFactoryTokens = ethers.parseUnits("10000", "ether");
    await token.transfer(await factory1.getAddress(), initialFactoryTokens);
    await token.transfer(await factory2.getAddress(), initialFactoryTokens);

    // For subsequent deposit-required sales (e.g., Distributor -> Retailer),
    // transfer tokens from factories to distributors.
    //const distributorFunding = ethers.parseUnits("500", "ether");
    //await token.connect(factory1).transfer(await distributor1.getAddress(), distributorFunding);
    //await token.connect(factory2).transfer(await distributor2.getAddress(), distributorFunding);

    // Define a constant for the reward/deposit amount (from earlier tests, e.g., 10 tokens)
    const REWARD_AMOUNT = ethers.parseUnits("10", "ether");

    // ---------------------------
    // 1. Supplier -> Factory Sales
    // ---------------------------
    // Transaction 1: Supplier1 sells to Factory1.
    let tx = await transactionManager.connect(supplier1).recordSellOperation(await factory1.getAddress());
    await tx.wait();
    // Factory1 confirms the sale (assume transaction ID 1).
    tx = await transactionManager.connect(factory1).confirmBuyOperation(1);
    await tx.wait();
    // Factory1 rates Supplier1 (using rating type 0 (e.g., TRUST) and a score of 8; productId=0 for non-product ratings).
    tx = await transactionManager.connect(factory1).buyerRateSeller(1, 0, 8, 0);
    await tx.wait();

    // Transaction 2: Supplier2 sells to Factory2.
    tx = await transactionManager.connect(supplier2).recordSellOperation(await factory2.getAddress());
    await tx.wait();
    tx = await transactionManager.connect(factory2).confirmBuyOperation(2);
    await tx.wait();
    tx = await transactionManager.connect(factory2).buyerRateSeller(2, 0, 9, 0);
    await tx.wait();

    // Transaction 3: Supplier3 sells to Factory1.
    tx = await transactionManager.connect(supplier3).recordSellOperation(await factory1.getAddress());
    await tx.wait();
    tx = await transactionManager.connect(factory1).confirmBuyOperation(3);
    await tx.wait();
    tx = await transactionManager.connect(factory1).buyerRateSeller(3, 0, 7, 0);
    await tx.wait();

    // ---------------------------
    // 2. Factory -> Distributor Sales (Factory mints product & sells)
    // ---------------------------
    // Factory1 mints a product.
    tx = await productManager.connect(factory1).mintProduct("ipfs://product-factory1-1");
    // Extract the productId from the "ProductMinted" event.
    let productId1 = (await getEvent(tx, "ProductMinted", productManager)).args.productId;
    // Factory1 must approve TransactionManager for deposit.
    await token.connect(factory1).approve(transactionManager.getAddress(), REWARD_AMOUNT);
    // Factory1 sells the minted product to Distributor1.
    tx = await transactionManager.connect(factory1).recordFactorySellOperation(await distributor1.getAddress(), productId1);
    await tx.wait();
    // Distributor1 confirms the sale (assume transaction ID 4).
    tx = await transactionManager.connect(distributor1).confirmBuyOperation(4);
    await tx.wait();
    // Distributor1 rates Factory1 (using rating type 3, for example).
    //tx = await transactionManager.connect(distributor1).buyerRateSeller(4, 3, 8, 0);
    //await tx.wait();

    // Factory2 mints a product.
    tx = await productManager.connect(factory2).mintProduct("ipfs://product-factory2-1");
    let productId2 = (await getEvent(tx, "ProductMinted", productManager)).args.productId;
    // Factory2 approves and sells the product to Distributor2.
    await token.connect(factory2).approve(transactionManager.getAddress(), REWARD_AMOUNT);
    tx = await transactionManager.connect(factory2).recordFactorySellOperation(await distributor2.getAddress(), productId2);
    await tx.wait();
    // Distributor2 confirms the sale (assume transaction ID 5).
    tx = await transactionManager.connect(distributor2).confirmBuyOperation(5);
    await tx.wait();
    // Distributor2 rates Factory2.
    //tx = await transactionManager.connect(distributor2).buyerRateSeller(5, 3, 9, 0);
    //await tx.wait();

    // ---------------------------
    // 3. Distributor -> Retailer Sales
    // ---------------------------
    // Distributor1 sells to Retailer1 (non-factory sale; deposit required).
    await token.connect(distributor1).approve(transactionManager.getAddress(), REWARD_AMOUNT);
    tx = await transactionManager.connect(distributor1).recordSellOperation(await retailer1.getAddress());
    await tx.wait();
    // Retailer1 confirms the sale (assume transaction ID 6).
    tx = await transactionManager.connect(retailer1).confirmBuyOperation(6);
    await tx.wait();
    // Retailer1 rates Distributor1 (using rating type 6, e.g., PACKAGING, with a score of 7).
    tx = await transactionManager.connect(retailer1).buyerRateSeller(6, 6, 7, 0);
    await tx.wait();

    // Distributor2 sells to Retailer2.
    await token.connect(distributor2).approve(transactionManager.getAddress(), REWARD_AMOUNT);
    tx = await transactionManager.connect(distributor2).recordSellOperation(await retailer2.getAddress());
    await tx.wait();
    // Retailer2 confirms the sale (assume transaction ID 7).
    tx = await transactionManager.connect(retailer2).confirmBuyOperation(7);
    await tx.wait();
    // Retailer2 rates Distributor2.
    tx = await transactionManager.connect(retailer2).buyerRateSeller(7, 6, 8, 0);
    await tx.wait();

    // ---------------------------
    // 4. Retailer -> Consumer Sales
    // ---------------------------
    // Retailer1 sells to Consumer1 (deposit required).
    await token.connect(retailer1).approve(transactionManager.getAddress(), REWARD_AMOUNT);
    tx = await transactionManager.connect(retailer1).recordSellOperation(await consumer1.getAddress());
    await tx.wait();
    // Consumer1 confirms the sale (assume transaction ID 8).
    tx = await transactionManager.connect(consumer1).confirmBuyOperation(8);
    await tx.wait();
    // Consumer1 rates Retailer1 (using rating type 10, e.g., PRICE_FAIRNESS, with a score of 9).
    tx = await transactionManager.connect(consumer1).buyerRateSeller(8, 10, 9, 0);
    await tx.wait();

    // Retailer2 sells to Consumer2.
    await token.connect(retailer2).approve(transactionManager.getAddress(), REWARD_AMOUNT);
    tx = await transactionManager.connect(retailer2).recordSellOperation(await consumer2.getAddress());
    await tx.wait();
    // Consumer2 confirms the sale (assume transaction ID 9).
    tx = await transactionManager.connect(consumer2).confirmBuyOperation(9);
    await tx.wait();
    // Consumer2 rates Retailer2.
    tx = await transactionManager.connect(consumer2).buyerRateSeller(9, 10, 8, 0);
    await tx.wait();


    //Missing consumer rates factory on a product
    
    // (We can add further interactions—for example, additional sales from retailer to remaining consumers,
    // or even simulate a consumer rating a factory through NFT ownership if applicable.)

    // Simulation complete.
  });
});
