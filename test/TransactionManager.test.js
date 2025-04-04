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
        // Log doesn't belong to contract, skip.
      }
    }
    if (!parsedEvent) {
      throw new Error("Event not found"); 
    }
    return parsedEvent;
  }

  beforeEach(async function () {
    [owner, supplier, factory, distributor, retailer, consumer, other] = await ethers.getSigners();

    // Deploy and set up StakeholderRegistry.
    StakeholderRegistry = await ethers.getContractFactory("StakeholderRegistry");
    registry = await StakeholderRegistry.deploy();
    await registry.waitForDeployment();

    // Register stakeholders with their respective roles.
    await registry.connect(supplier).registerStakeholder(Role.Supplier, "ipfs://supplier");
    await registry.connect(factory).registerStakeholder(Role.Factory, "ipfs://factory");
    await registry.connect(distributor).registerStakeholder(Role.Distributor, "ipfs://distributor");
    await registry.connect(retailer).registerStakeholder(Role.Retailer, "ipfs://retailer");
    await registry.connect(consumer).registerStakeholder(Role.Consumer, "ipfs://consumer");

    // Deploy ProductManager.
    ProductManager = await ethers.getContractFactory("ProductManager");
    productManager = await ProductManager.deploy();
    await productManager.waitForDeployment();

    // Deploy a dummy DisputeManager (required for ScoreEngine).
    DisputeManager = await ethers.getContractFactory("DisputeManager");
    disputeManager = await DisputeManager.deploy(await registry.getAddress());
    await disputeManager.waitForDeployment();

    // Deploy Token.
    Token = await ethers.getContractFactory("Token");
    token = await Token.deploy();
    await token.waitForDeployment();

    // Deploy ScoreEngine.
    ScoreEngine = await ethers.getContractFactory("ScoreEngine");
    scoreEngine = await ScoreEngine.deploy(
      await registry.getAddress(),
      await disputeManager.getAddress(),
      await token.getAddress(),
      await productManager.getAddress()
    );
    await scoreEngine.waitForDeployment();
    // Transfer tokens to ScoreEngine if needed.
    await token.transfer(await factory.getAddress(), ethers.parseUnits("1000", "ether"));

    // In real chain of events only the factory would need to charge its account with tokens.
    await token.transfer(await scoreEngine.getAddress(), ethers.parseUnits("1000", "ether"));
    await token.transfer(await supplier.getAddress(), ethers.parseUnits("1000", "ether"));
    await token.transfer(await distributor.getAddress(), ethers.parseUnits("1000", "ether"));
    await token.transfer(await retailer.getAddress(), ethers.parseUnits("1000", "ether"));

    // Deploy TransactionManager with the addresses of registry, productManager, scoreEngine, and token.
    TransactionManager = await ethers.getContractFactory("TransactionManager");
    transactionManager = await TransactionManager.deploy(
      await registry.getAddress(),
      await productManager.getAddress(),
      await scoreEngine.getAddress(),
      await token.getAddress()
    );
    await transactionManager.waitForDeployment();

    // For Retailer -> Consumer sales, ensure the retailer approves TransactionManager to spend REWARD_AMOUNT tokens.
    await token.connect(retailer).approve(transactionManager.getAddress(), REWARD_AMOUNT);
  });

  describe("recordSellOperation (non-factory sale)", function () {
    it("records a valid Supplier -> Factory sale without deposit", async function () {
      // Supplier (role 1) sells to Factory (role 2): no deposit required.
      const tx = await transactionManager.connect(supplier).recordSellOperation(await factory.getAddress());
      const event = await getEvent(tx, "SellOperationRecorded", transactionManager);
      expect(event).to.not.be.undefined;
      const { seller, buyer, productId } = event.args;
      expect(seller).to.equal(await supplier.getAddress());
      expect(buyer).to.equal(await factory.getAddress());
      expect(productId).to.equal(0);
      const txn = await transactionManager.transactions(1);
      expect(txn.status).to.equal(0); // Pending
    });

    it("records a valid Distributor -> Retailer sale with deposit", async function () {
      // Distributor (role 3) sells to Retailer (role 4): deposit required.
      await token.connect(distributor).approve(transactionManager.getAddress(), REWARD_AMOUNT);
      const tx = await transactionManager.connect(distributor).recordSellOperation(await retailer.getAddress());
      const event = await getEvent(tx, "SellOperationRecorded", transactionManager);
      expect(event).to.not.be.undefined;
      const { seller, buyer, productId } = event.args;
      expect(seller).to.equal(await distributor.getAddress());
      expect(buyer).to.equal(await retailer.getAddress());
      expect(productId).to.equal(0);
      const txn = await transactionManager.transactions(1);
      expect(txn.status).to.equal(0); // Pending
    });

    it("records a valid Retailer -> Consumer sale without deposit", async function () {
      // Retailer (role 4) sells to Consumer (role 5): no deposit required.
      const tx = await transactionManager.connect(retailer).recordSellOperation(await consumer.getAddress());
      const event = await getEvent(tx, "SellOperationRecorded", transactionManager);
      expect(event).to.not.be.undefined;
      const { seller, buyer, productId } = event.args;
      expect(seller).to.equal(await retailer.getAddress());
      expect(buyer).to.equal(await consumer.getAddress());
      expect(productId).to.equal(0);
      const txn = await transactionManager.transactions(1);
      expect(txn.status).to.equal(0); // Pending
    });

    it("reverts for an invalid seller-buyer combination", async function () {
      // For example, Distributor (role 3) → Factory (role 2) is not allowed.
      await expect(
        transactionManager.connect(distributor).recordSellOperation(await factory.getAddress())
      ).to.be.revertedWith("Invalid seller-buyer role combination for non-factory sale");
    });
  });

  describe("recordFactorySellOperation (factory sale)", function () {
    it("records a valid Factory -> Distributor sale with deposit and transfers NFT", async function () {
      // Factory must first mint an NFT.
      const metadataURI = "ipfs://product1";
      const mintTx = await productManager.connect(factory).mintProduct(metadataURI);
      const mintEvent = await getEvent(mintTx, "ProductMinted", productManager);
      const productId = mintEvent.args.productId;

      // Verify factory is the current owner.
      let productDetails = await productManager.getProductDetails(productId);
      expect(productDetails.currentOwner).to.equal(await factory.getAddress());

      // For Factory -> Distributor sale, deposit is required.
      await token.connect(factory).approve(transactionManager.getAddress(), REWARD_AMOUNT);
      // Factory sells to Distributor.
      const tx = await transactionManager.connect(factory).recordFactorySellOperation(await distributor.getAddress(), productId);
      const event = await getEvent(tx, "SellOperationRecorded", transactionManager);
      expect(event).to.not.be.undefined;
      const { seller, buyer, productId: eventProductId } = event.args;
      expect(seller).to.equal(await factory.getAddress());
      expect(buyer).to.equal(await distributor.getAddress());
      expect(eventProductId).to.equal(productId);

      // Check that NFT ownership has transferred.
      productDetails = await productManager.getProductDetails(productId);
      expect(productDetails.currentOwner).to.equal(await distributor.getAddress());
    });

    it("records a valid Factory -> Consumer sale without deposit and transfers NFT", async function () {
      const metadataURI = "ipfs://product2";
      const mintTx = await productManager.connect(factory).mintProduct(metadataURI);
      const mintEvent = await getEvent(mintTx, "ProductMinted", productManager);
      const productId = mintEvent.args.productId;

      let productDetails = await productManager.getProductDetails(productId);
      expect(productDetails.currentOwner).to.equal(await factory.getAddress());

      // Factory sells to Consumer with no deposit.
      const tx = await transactionManager.connect(factory).recordFactorySellOperation(await consumer.getAddress(), productId);
      const event = await getEvent(tx, "SellOperationRecorded", transactionManager);
      expect(event).to.not.be.undefined;
      const { seller, buyer, productId: eventProductId } = event.args;
      expect(seller).to.equal(await factory.getAddress());
      expect(buyer).to.equal(await consumer.getAddress());
      expect(eventProductId).to.equal(productId);

      productDetails = await productManager.getProductDetails(productId);
      expect(productDetails.currentOwner).to.equal(await consumer.getAddress());
    });

    it("reverts if a non-factory calls recordFactorySellOperation", async function () {
      const metadataURI = "ipfs://product3";
      const mintTx = await productManager.connect(factory).mintProduct(metadataURI);
      const mintEvent = await getEvent(mintTx, "ProductMinted", productManager);
      const productId = mintEvent.args.productId;

      await expect(
        transactionManager.connect(supplier).recordFactorySellOperation(await consumer.getAddress(), productId)
      ).to.be.revertedWith("Seller must be a Factory");
    });

    it("reverts if buyer role is invalid for factory sale", async function () {
      const metadataURI = "ipfs://product4";
      const mintTx = await productManager.connect(factory).mintProduct(metadataURI);
      const mintEvent = await getEvent(mintTx, "ProductMinted", productManager);
      const productId = mintEvent.args.productId;

      // Attempt to sell to a Retailer (role 4) which is not allowed.
      await expect(
        transactionManager.connect(factory).recordFactorySellOperation(await retailer.getAddress(), productId)
      ).to.be.revertedWith("Buyer must be Distributor or Consumer for factory sale");
    });
  });

  describe("confirmBuyOperation", function () {
    it("allows the buyer to confirm a Distributor -> Retailer sale and receive the deposit", async function () {
      // Set up a Distributor -> Retailer sale.
      await token.connect(distributor).approve(transactionManager.getAddress(), REWARD_AMOUNT);
      const txSell = await transactionManager.connect(distributor).recordSellOperation(await retailer.getAddress());
      await txSell.wait();

      const initialTokenBalance = await token.balanceOf(await retailer.getAddress());
      // Retailer confirms the sale.
      const txConfirm = await transactionManager.connect(retailer).confirmBuyOperation(1);
      await txConfirm.wait();
      const finalTokenBalance = await token.balanceOf(await retailer.getAddress());
      expect(finalTokenBalance-(initialTokenBalance)).to.equal(REWARD_AMOUNT);
      
      const txn = await transactionManager.transactions(1);
      expect(txn.status).to.equal(1); // Validated
    });

    it("allows the buyer to confirm a Retailer -> Consumer sale and transfer token reward", async function () {
      // Set up a Retailer -> Consumer sale.
      // Ensure retailer has approved the TransactionManager already in beforeEach.
      const initialRetailerTokenBalance = await token.balanceOf(await retailer.getAddress());
      const initialScoreEngineTokenBalance = await token.balanceOf(await scoreEngine.getAddress());

      const txSell = await transactionManager.connect(retailer).recordSellOperation(await consumer.getAddress());
      await txSell.wait();

      await transactionManager.connect(consumer).confirmBuyOperation(1);

      const finalRetailerTokenBalance = await token.balanceOf(await retailer.getAddress());
      const finalScoreEngineTokenBalance = await token.balanceOf(await scoreEngine.getAddress());
      expect(initialRetailerTokenBalance-(finalRetailerTokenBalance)).to.equal(REWARD_AMOUNT);
      expect(finalScoreEngineTokenBalance-(initialScoreEngineTokenBalance)).to.equal(REWARD_AMOUNT);
      
      const txn = await transactionManager.transactions(1);
      expect(txn.status).to.equal(1); // Validated
    });

    it("allows the buyer to confirm a Factory -> Distributor sale and receive the deposit", async function () {
      // Set up a Factory -> Distributor sale.
      const metadataURI = "ipfs://product5";
      const mintTx = await productManager.connect(factory).mintProduct(metadataURI);
      const mintEvent = await getEvent(mintTx, "ProductMinted", productManager);
      const productId = mintEvent.args.productId;
      
      await token.connect(factory).approve(transactionManager.getAddress(), REWARD_AMOUNT);
      const txSell = await transactionManager.connect(factory).recordFactorySellOperation(await distributor.getAddress(), productId);
      await txSell.wait();

      const initialDistributorTokenBalance = await token.balanceOf(await distributor.getAddress());
      const txConfirm = await transactionManager.connect(distributor).confirmBuyOperation(1);
      await txConfirm.wait();
      const finalDistributorTokenBalance = await token.balanceOf(await distributor.getAddress());
      expect(finalDistributorTokenBalance-(initialDistributorTokenBalance)).to.equal(REWARD_AMOUNT);
      
      const txn = await transactionManager.transactions(1);
      expect(txn.status).to.equal(1); // Validated
    });

    it("reverts if confirmBuyOperation is called by a non-designated buyer", async function () {
      const txSell = await transactionManager.connect(supplier).recordSellOperation(await factory.getAddress());
      await txSell.wait();
      await expect(
        transactionManager.connect(consumer).confirmBuyOperation(1)
      ).to.be.revertedWith("Only designated buyer can confirm purchase");
    });
  });

  describe("buyerRateSeller", function () {
    it("allows a Factory (buyer) to rate a Supplier (seller)", async function () {
      // Setup a Supplier -> Factory sale.
      const txSell = await transactionManager.connect(supplier).recordSellOperation(await factory.getAddress());
      await txSell.wait();
      await transactionManager.connect(factory).confirmBuyOperation(1);

      // Factory rates Supplier.
      const txRate = await transactionManager.connect(factory).buyerRateSeller(1, 0, 8, 0);
      const event = await getEvent(txRate, "SellerRated", transactionManager);
      expect(event).to.not.be.undefined;
      expect(event.args.buyer).to.equal(await factory.getAddress());
      expect(event.args.seller).to.equal(await supplier.getAddress());
      const txn = await transactionManager.transactions(1);
      expect(txn.rated).to.equal(true);
    });

    it("allows a Retailer (buyer) to rate a Distributor (seller)", async function () {
      // Setup a Distributor -> Retailer sale.
      await token.connect(distributor).approve(transactionManager.getAddress(), REWARD_AMOUNT);
      const txSell = await transactionManager.connect(distributor).recordSellOperation(await retailer.getAddress());
      await txSell.wait();
      await transactionManager.connect(retailer).confirmBuyOperation(1);

      // Retailer rates Distributor.
      const txRate = await transactionManager.connect(retailer).buyerRateSeller(1, 6, 7, 0); // rate packaging
      const event = await getEvent(txRate, "SellerRated", transactionManager);
      expect(event).to.not.be.undefined;
      expect(event.args.buyer).to.equal(await retailer.getAddress());
      expect(event.args.seller).to.equal(await distributor.getAddress());
      const txn = await transactionManager.transactions(1);
      expect(txn.rated).to.equal(true);
    });

    it("allows a Consumer (buyer) to rate a Retailer (seller)", async function () {
      // Setup a Retailer -> Consumer sale.
      const txSell = await transactionManager.connect(retailer).recordSellOperation(await consumer.getAddress());
      await txSell.wait();
      await transactionManager.connect(consumer).confirmBuyOperation(1);

      // Consumer rates Retailer.
      const txRate = await transactionManager.connect(consumer).buyerRateSeller(1, 10, 9, 0); // rate price fairness
      const event = await getEvent(txRate, "SellerRated", transactionManager);
      expect(event).to.not.be.undefined;
      expect(event.args.buyer).to.equal(await consumer.getAddress());
      expect(event.args.seller).to.equal(await retailer.getAddress());
      const txn = await transactionManager.transactions(1);
      expect(txn.rated).to.equal(true);
    });

    it("allows a Consumer to rate a Factory when owning the NFT", async function () {
      // Setup a Factory -> Consumer sale.
      const metadataURI = "ipfs://product6";
      const mintTx = await productManager.connect(factory).mintProduct(metadataURI);
      const mintEvent = await getEvent(mintTx, "ProductMinted", productManager);
      const productId = mintEvent.args.productId;

      const txSell = await transactionManager.connect(factory).recordFactorySellOperation(await consumer.getAddress(), productId);
      await txSell.wait();
      await transactionManager.connect(consumer).confirmBuyOperation(1);

      // Consumer rates Factory, providing the productId for NFT ownership verification.
      const txRate = await transactionManager.connect(consumer).buyerRateSeller(1, 5, 10, productId); // eco rating
      const event = await getEvent(txRate, "SellerRated", transactionManager);
      expect(event).to.not.be.undefined;
      expect(event.args.buyer).to.equal(await consumer.getAddress());
      expect(event.args.seller).to.equal(await factory.getAddress());
      const txn = await transactionManager.transactions(1);
      expect(txn.rated).to.equal(true);
    });

    it("reverts if buyerRateSeller is called by a non-buyer", async function () {
      const txSell = await transactionManager.connect(supplier).recordSellOperation(await factory.getAddress());
      await txSell.wait();
      await transactionManager.connect(factory).confirmBuyOperation(1);
      await expect(
        transactionManager.connect(consumer).buyerRateSeller(1, 4, 8, 0) // warranty rating
      ).to.be.revertedWith("Only buyer can rate the seller");
    });

    it("reverts if buyerRateSeller is called before the transaction is validated", async function () {
      const txSell = await transactionManager.connect(supplier).recordSellOperation(await factory.getAddress());
      await txSell.wait();
      await expect(
        transactionManager.connect(factory).buyerRateSeller(1, 0, 8, 0) // trust rating
      ).to.be.revertedWith("Transaction not validated");
    });

    it("reverts if buyerRateSeller is called a second time on the same transaction", async function () {
      const txSell = await transactionManager.connect(supplier).recordSellOperation(await factory.getAddress());
      await txSell.wait();
      await transactionManager.connect(factory).confirmBuyOperation(1);
      await transactionManager.connect(factory).buyerRateSeller(1, 0, 8, 0); // trust rating
      await expect(
        transactionManager.connect(factory).buyerRateSeller(1, 0, 7, 0) // trust rating
      ).to.be.revertedWith("Seller already rated for this transaction");
    });

    it("reverts if rating is not allowed for the given role combination", async function () {
      // Setup: Supplier -> Factory sale.
      const txSell = await transactionManager.connect(supplier).recordSellOperation(await factory.getAddress());
      await txSell.wait();
      await transactionManager.connect(factory).confirmBuyOperation(1);
      
      // In this case, although Factory (buyer) is allowed to rate Supplier,
      // we simulate an invalid combination by having Supplier try to rate Factory.
      await expect(
        transactionManager.connect(supplier).buyerRateSeller(1, 3, 8, 0) // PRODUCT_QUALITY rating
      ).to.be.revertedWith("Only buyer can rate the seller");
    });
  });
});
