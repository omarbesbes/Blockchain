const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TransactionManager", function () {
  let TransactionManager, transactionManager;
  let StakeholderRegistry, registry;
  let ProductManager, productManager;
  let ScoreEngine, scoreEngine;
  let Token, token;
  let DisputeManager, disputeManager;
  let owner, supplier, factory, distributor, retailer, consumer, other;

  // REWARD_AMOUNT as defined in the contract (10 tokens with 18 decimals)
  const REWARD_AMOUNT = ethers.parseUnits("10", "ether");

  // Roles: None = 0, Supplier = 1, Factory = 2, Distributor = 3, Retailer = 4, Consumer = 5.
  const Role = { None: 0, Supplier: 1, Factory: 2, Distributor: 3, Retailer: 4, Consumer: 5 };

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
        // Not this contract’s log, skip
      }
    }
    if (!parsedEvent) {
      throw new Error(`Event ${eventTag} not found`);
    }
    return parsedEvent;
  }

  beforeEach(async function () {
    [
      owner,
      supplier,
      factory,
      distributor,
      retailer,
      consumer,
      other
    ] = await ethers.getSigners();

    // 1. Deploy and set up StakeholderRegistry
    StakeholderRegistry = await ethers.getContractFactory("StakeholderRegistry");
    registry = await StakeholderRegistry.deploy();
    await registry.waitForDeployment();

    // 2. Register stakeholders with their respective roles
    await registry.connect(supplier).registerStakeholder(Role.Supplier, "ipfs://supplier");
    await registry.connect(factory).registerStakeholder(Role.Factory, "ipfs://factory");
    await registry.connect(distributor).registerStakeholder(Role.Distributor, "ipfs://distributor");
    await registry.connect(retailer).registerStakeholder(Role.Retailer, "ipfs://retailer");
    await registry.connect(consumer).registerStakeholder(Role.Consumer, "ipfs://consumer");

    // 3. Deploy ProductManager
    ProductManager = await ethers.getContractFactory("ProductManager");
    productManager = await ProductManager.deploy();
    await productManager.waitForDeployment();

    // Deploy Token
    Token = await ethers.getContractFactory("Token");
    token = await Token.deploy();
    await token.waitForDeployment();

    // Deploy ScoreEngine
    ScoreEngine = await ethers.getContractFactory("ScoreEngine");
    scoreEngine = await ScoreEngine.deploy(
      await registry.getAddress(),
      await token.getAddress(),
      await productManager.getAddress()
    );
    await scoreEngine.waitForDeployment();

    // 4. Deploy DisputeManager (dummy for ScoreEngine)
    DisputeManager = await ethers.getContractFactory("DisputeManager");
    disputeManager = await DisputeManager.deploy(await registry.getAddress(),await scoreEngine.getAddress());
    await disputeManager.waitForDeployment();

    // 7. Distribute tokens
    await token.transfer(await factory.getAddress(), ethers.parseUnits("1000", "ether"));
    await token.transfer(await distributor.getAddress(), ethers.parseUnits("1000", "ether"));
    await token.transfer(await retailer.getAddress(), ethers.parseUnits("1000", "ether"));
    await token.transfer(await consumer.getAddress(), ethers.parseUnits("1000", "ether"));
    // Also fund ScoreEngine a bit
    await token.transfer(await scoreEngine.getAddress(), ethers.parseUnits("1000", "ether"));
    // Supplier also gets some tokens if needed
    await token.transfer(await supplier.getAddress(), ethers.parseUnits("1000", "ether"));

    // 8. Deploy TransactionManager
    TransactionManager = await ethers.getContractFactory("TransactionManager");
    transactionManager = await TransactionManager.deploy(
      await registry.getAddress(),
      await productManager.getAddress(),
      await scoreEngine.getAddress(),
      await token.getAddress(),
      await disputeManager.getAddress()
    );
    await transactionManager.waitForDeployment();
  });

  //
  // ============================================================================
  // 1) recordBuyOperation with productId=0: e.g., "Supplier -> Factory"
  //    or "Distributor -> Retailer" or "Consumer -> Retailer" for items with no NFT
  // ============================================================================
  //
  describe("recordBuyOperation (no NFT minted, productId=0)", function () {
    it("records a valid Supplier -> Factory purchase (factory is buyer, supplier is seller)", async function () {
      // Buyer = factory(2), Seller = supplier(1). (2 - 1 = 1) => valid.
      const tx = await transactionManager
        .connect(factory)
        .recordBuyOperation(await supplier.getAddress(), 0);
      const event = await getEvent(tx, "BuyOperationRecorded", transactionManager);
      expect(event.args.buyer).to.equal(await factory.getAddress());
      expect(event.args.seller).to.equal(await supplier.getAddress());
      expect(event.args.productId).to.equal(0);

      const txn = await transactionManager.transactions(1);
      expect(txn.status).to.equal(0); // Pending
    });

    it("records a valid Retailer -> Distributor purchase (retailer is buyer, distributor is seller)", async function () {
      // Buyer=retailer(4), Seller=distributor(3). (4 - 3=1) => valid
      const tx = await transactionManager
        .connect(retailer)
        .recordBuyOperation(await distributor.getAddress(), 0);
      const event = await getEvent(tx, "BuyOperationRecorded", transactionManager);
      expect(event.args.buyer).to.equal(await retailer.getAddress());
      expect(event.args.seller).to.equal(await distributor.getAddress());
      expect(event.args.productId).to.equal(0);

      const txn = await transactionManager.transactions(1);
      expect(txn.status).to.equal(0); // Pending
    });

    it("records a valid Consumer -> Retailer purchase (consumer is buyer, retailer is seller)", async function () {
      // Buyer=consumer(5), Seller=retailer(4). (5 - 4=1) => valid
      const tx = await transactionManager
        .connect(consumer)
        .recordBuyOperation(await retailer.getAddress(), 0);
      const event = await getEvent(tx, "BuyOperationRecorded", transactionManager);
      expect(event.args.buyer).to.equal(await consumer.getAddress());
      expect(event.args.seller).to.equal(await retailer.getAddress());
      expect(event.args.productId).to.equal(0);

      const txn = await transactionManager.transactions(1);
      expect(txn.status).to.equal(0); // Pending
    });

    it("reverts for an invalid buyer-seller combination (e.g. Factory->Distributor) for productId=0", async function () {
      // Buyer=factory(2), Seller=distributor(3) => (2 -3 != 1) => revert
      await expect(
        transactionManager.connect(factory).recordBuyOperation(
          await distributor.getAddress(),
          0
        )
      ).to.be.revertedWith("Invalid buyer-seller role combination for transaction");
    });
  });

  //
  // ============================================================================
  // 2) recordBuyOperation WITH an actual minted NFT: e.g. "Factory->Distributor"
  //    The Factory is the product owner, the Distributor is the buyer.
  // ============================================================================
  //
  describe("recordBuyOperation (factory-owned NFT scenario)", function () {
    let mintedProductId;

    beforeEach(async function () {
      // Factory mints an NFT
      const txMint = await productManager
        .connect(factory)
        .mintProduct("ipfs://factory-nft");
      const eventMint = await getEvent(txMint, "ProductMinted", productManager);
      mintedProductId = eventMint.args.productId;

      const productDetails = await productManager.getProductDetails(mintedProductId);
      expect(productDetails.currentOwner).to.equal(await factory.getAddress());
    });

    it("records a valid Factory -> Distributor purchase (buyer=distributor, seller=factory)", async function () {
      // Buyer=distributor(3), Seller=factory(2). (3 -2=1) => allowed for minted product
      const tx = await transactionManager
        .connect(distributor)
        .recordBuyOperation(await factory.getAddress(), mintedProductId);

      const event = await getEvent(tx, "BuyOperationRecorded", transactionManager);
      expect(event.args.buyer).to.equal(await distributor.getAddress());
      expect(event.args.seller).to.equal(await factory.getAddress());
      expect(event.args.productId).to.equal(mintedProductId);

      // Ownership doesn't change until confirmSellOperation
      const productDetails = await productManager.getProductDetails(mintedProductId);
      expect(productDetails.currentOwner).to.equal(await factory.getAddress());
    });

    it("reverts if the consumer tries to buy directly from the factory for a minted NFT", async function () {
      // Buyer=consumer(5), Seller=factory(2) => (5 -2=3 !=1), so it should revert
      await expect(
        transactionManager
          .connect(consumer)
          .recordBuyOperation(await factory.getAddress(), mintedProductId)
      ).to.be.revertedWith("Invalid buyer-seller role combination for transaction");
    });
  });

  //
  // ============================================================================
  // 3) confirmSellOperation
  // ============================================================================
  //
  describe("confirmSellOperation", function () {
    it("allows seller (distributor) to confirm a sale to retailer, transferring deposit from distributor->retailer", async function () {
      // 1) Retailer->Distributor purchase with productId=0
      const txBuy = await transactionManager
        .connect(retailer)
        .recordBuyOperation(await distributor.getAddress(), 0);
      await txBuy.wait();

      // 2) Distributor approves deposit and confirms
      await token.connect(distributor).approve(transactionManager.getAddress(), REWARD_AMOUNT);
      const initialRetailerBalance = await token.balanceOf(await retailer.getAddress());

      const txConfirm = await transactionManager.connect(distributor).confirmSellOperation(1);
      await txConfirm.wait();

      const finalRetailerBalance = await token.balanceOf(await retailer.getAddress());
      expect(finalRetailerBalance-(initialRetailerBalance)).to.equal(REWARD_AMOUNT);

      const txn = await transactionManager.transactions(1);
      expect(txn.status).to.equal(1); // Validated
    });

    it("allows seller (retailer) to confirm a sale to consumer, depositing tokens to ScoreEngine", async function () {
      // 1) Consumer->Retailer purchase with productId=0
      const txBuy = await transactionManager
        .connect(consumer)
        .recordBuyOperation(await retailer.getAddress(), 0);
      await txBuy.wait();

      // 2) Retailer approves deposit and confirms
      await token.connect(retailer).approve(transactionManager.getAddress(), REWARD_AMOUNT);
      const initialScoreEngineBalance = await token.balanceOf(await scoreEngine.getAddress());

      await transactionManager.connect(retailer).confirmSellOperation(1);

      const finalScoreEngineBalance = await token.balanceOf(await scoreEngine.getAddress());
      expect(finalScoreEngineBalance-(initialScoreEngineBalance)).to.equal(REWARD_AMOUNT);

      const txn = await transactionManager.transactions(1);
      expect(txn.status).to.equal(1); // Validated
    });

    it("allows seller (factory) to confirm a sale to distributor (minted product), deposit from factory->distributor", async function () {
      // Factory mints an NFT
      const txMint = await productManager.connect(factory).mintProduct("ipfs://product5");
      const eventMint = await getEvent(txMint, "ProductMinted", productManager);
      const productId = eventMint.args.productId;

      // Buyer=distributor(3), Seller=factory(2)
      const txBuy = await transactionManager
        .connect(distributor)
        .recordBuyOperation(await factory.getAddress(), productId);
      await txBuy.wait();

      // Factory approves deposit
      await token.connect(factory).approve(transactionManager.getAddress(), REWARD_AMOUNT);
      const initialDistBalance = await token.balanceOf(await distributor.getAddress());

      // Confirm
      const txConfirm = await transactionManager.connect(factory).confirmSellOperation(1);
      await txConfirm.wait();

      // Check deposit
      const finalDistBalance = await token.balanceOf(await distributor.getAddress());
      expect(finalDistBalance-(initialDistBalance)).to.equal(REWARD_AMOUNT);

      // Check NFT transfer
      const productDetails = await productManager.getProductDetails(productId);
      expect(productDetails.currentOwner).to.equal(await distributor.getAddress());

      const txn = await transactionManager.transactions(1);
      expect(txn.status).to.equal(1); // Validated
    });

    it("reverts if confirmSellOperation is called by a non-designated seller", async function () {
      // Buyer=factory, Seller=supplier => transaction #1
      const txBuy = await transactionManager
        .connect(factory)
        .recordBuyOperation(await supplier.getAddress(), 0);
      await txBuy.wait();

      // Now consumer tries to confirm (not the seller)
      await expect(
        transactionManager.connect(consumer).confirmSellOperation(1)
      ).to.be.revertedWith("Only designated seller can confirm sale");
    });
  });

  //
  // ============================================================================
  // 4) buyerRateSeller
  // ============================================================================
  //
  describe("buyerRateSeller", function () {
    it("allows Factory (buyer) to rate Supplier (seller) for a raw-material (productId=0) purchase", async function () {
      // Buyer=factory(2), Seller=supplier(1)
      const txBuy = await transactionManager
        .connect(factory)
        .recordBuyOperation(await supplier.getAddress(), 0);
      await txBuy.wait();

      // Supplier confirms
      await transactionManager.connect(supplier).confirmSellOperation(1);

      // Factory rates Supplier
      const txRate = await transactionManager
        .connect(factory)
        .buyerRateSeller(1, /*scoreType=*/0, /*scoreValue=*/8, /*productId=*/0, /*ratingFactory=*/false);
      const event = await getEvent(txRate, "SellerRated", transactionManager);

      expect(event.args.buyer).to.equal(await factory.getAddress());
      expect(event.args.seller).to.equal(await supplier.getAddress());

      const txn = await transactionManager.transactions(1);
      expect(txn.rated).to.equal(true);
    });

    it("allows Retailer (buyer) to rate Distributor (seller)", async function () {
      // Buyer=retailer(4), Seller=distributor(3)
      const txBuy = await transactionManager
        .connect(retailer)
        .recordBuyOperation(await distributor.getAddress(), 0);
      await txBuy.wait();

      // Distributor approves deposit and confirms
      await token.connect(distributor).approve(transactionManager.getAddress(), REWARD_AMOUNT);
      await transactionManager.connect(distributor).confirmSellOperation(1);

      // Retailer rates Distributor
      const txRate = await transactionManager
        .connect(retailer)
        .buyerRateSeller(1, /*scoreType=*/6, /*scoreValue=*/7, /*productId=*/0, /*ratingFactory=*/false);
      const event = await getEvent(txRate, "SellerRated", transactionManager);

      expect(event.args.buyer).to.equal(await retailer.getAddress());
      expect(event.args.seller).to.equal(await distributor.getAddress());

      const txn = await transactionManager.transactions(1);
      expect(txn.rated).to.equal(true);
    });

    it("allows Consumer (buyer) to rate Retailer (seller)", async function () {
      // Buyer=consumer(5), Seller=retailer(4)
      const txBuy = await transactionManager
        .connect(consumer)
        .recordBuyOperation(await retailer.getAddress(), 0);
      await txBuy.wait();

      // Retailer approves deposit and confirms
      await token.connect(retailer).approve(transactionManager.getAddress(), REWARD_AMOUNT);
      await transactionManager.connect(retailer).confirmSellOperation(1);

      // Consumer rates Retailer
      const txRate = await transactionManager
        .connect(consumer)
        .buyerRateSeller(1, /*scoreType=*/10, /*scoreValue=*/9, 0, false);
      const event = await getEvent(txRate, "SellerRated", transactionManager);

      expect(event.args.buyer).to.equal(await consumer.getAddress());
      expect(event.args.seller).to.equal(await retailer.getAddress());

      const txn = await transactionManager.transactions(1);
      expect(txn.rated).to.equal(true);
    });

    it("reverts if a non-buyer calls buyerRateSeller", async function () {
      // Buyer=factory(2), Seller=supplier(1)
      const txBuy = await transactionManager
        .connect(factory)
        .recordBuyOperation(await supplier.getAddress(), 0);
      await txBuy.wait();
      await transactionManager.connect(supplier).confirmSellOperation(1);

      // consumer tries to rate (not the buyer)
      await expect(
        transactionManager.connect(consumer).buyerRateSeller(1, 0, 8, 0, false)
      ).to.be.revertedWith("Only buyer can rate the seller");
    });

    it("reverts if the transaction is not validated yet", async function () {
      // Buyer=factory(2), Seller=supplier(1)
      const txBuy = await transactionManager
        .connect(factory)
        .recordBuyOperation(await supplier.getAddress(), 0);
      await txBuy.wait();

      // No confirmSellOperation yet
      await expect(
        transactionManager.connect(factory).buyerRateSeller(1, 0, 8, 0, false)
      ).to.be.revertedWith("Transaction not validated");
    });

    it("reverts if buyer tries to rate the same seller a second time in the same transaction", async function () {
      // Buyer=factory(2), Seller=supplier(1)
      const txBuy = await transactionManager
        .connect(factory)
        .recordBuyOperation(await supplier.getAddress(), 0);
      await txBuy.wait();
      await transactionManager.connect(supplier).confirmSellOperation(1);

      // 1st rating
      await transactionManager
        .connect(factory)
        .buyerRateSeller(1, 0, 8, 0, false);

      // 2nd rating attempt
      await expect(
        transactionManager.connect(factory).buyerRateSeller(1, 0, 7, 0, false)
      ).to.be.revertedWith("Seller already rated for this transaction");
    });

    it("reverts if the roles do not match an allowed buyer-seller rating scenario", async function () {
      // e.g., Supplier trying to rate Factory in a transaction where
      // buyer=Factory, seller=Supplier
      const txBuy = await transactionManager
        .connect(factory)
        .recordBuyOperation(await supplier.getAddress(), 0);
      await txBuy.wait();
      await transactionManager.connect(supplier).confirmSellOperation(1);

      // Now seller tries to call buyerRateSeller
      await expect(
        transactionManager.connect(supplier).buyerRateSeller(1, 3, 8, 0, false)
      ).to.be.revertedWith("Only buyer can rate the seller");
    });
  });

  //
  // ============================================================================
  // 5) End-to-End flow: Factory->Distributor->Retailer->Consumer with an actual NFT
  //    Then Consumer rates both Retailer (normal) and Factory (ratingFactory=true)
  // ============================================================================
  //
  it("allows a consumer to ultimately rate the factory after the product flows (factory->distributor->retailer->consumer)", async function () {
    // Step 1: Factory mints a product
    const txMint = await productManager
      .connect(factory)
      .mintProduct("ipfs://factory-product");
    const eventMint = await getEvent(txMint, "ProductMinted", productManager);
    const productId = eventMint.args.productId;

    // Step 2: Distributor buys from Factory
    const txBuy1 = await transactionManager
      .connect(distributor)
      .recordBuyOperation(await factory.getAddress(), productId);
    await txBuy1.wait();

    // Factory approves deposit, confirms
    await token.connect(factory).approve(transactionManager.getAddress(), REWARD_AMOUNT);
    await transactionManager.connect(factory).confirmSellOperation(1);

    // Product now with Distributor

    // Step 3: Retailer buys from Distributor
    const txBuy2 = await transactionManager
      .connect(retailer)
      .recordBuyOperation(await distributor.getAddress(), productId);
    await txBuy2.wait();

    // Distributor approves deposit, confirms
    await token.connect(distributor).approve(transactionManager.getAddress(), REWARD_AMOUNT);
    await transactionManager.connect(distributor).confirmSellOperation(2);

    // Product now with Retailer

    // Step 4: Consumer buys from Retailer
    const txBuy3 = await transactionManager
      .connect(consumer)
      .recordBuyOperation(await retailer.getAddress(), productId);
    await txBuy3.wait();

    // Retailer approves deposit, confirms
    await token.connect(retailer).approve(transactionManager.getAddress(), REWARD_AMOUNT);
    await transactionManager.connect(retailer).confirmSellOperation(3);

    // Product now with Consumer

    // Step 5a: Consumer rates the Retailer (normal rating)
    const txRateRetailer = await transactionManager
      .connect(consumer)
      .buyerRateSeller(3, /*scoreType=*/10, /*scoreValue=*/8, /*productId=*/0, /*ratingFactory=*/false);
    await txRateRetailer.wait();

    // Step 5b: Consumer also rates the Factory (ratingFactory=true)
    // Must pass the minted productId so the contract can identify the original creator (factory).
    const txRateFactory = await transactionManager
      .connect(consumer)
      .buyerRateSeller(3, /*scoreType=*/5, /*scoreValue=*/9, productId, /*ratingFactory=*/true);
    const eventRate = await getEvent(txRateFactory, "SellerRated", transactionManager);
    expect(eventRate.args.buyer).to.equal(await consumer.getAddress());
    expect(eventRate.args.seller).to.equal(await factory.getAddress());
  });
});
