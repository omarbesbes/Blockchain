const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("ScoreEngine", function () {
  let scoreEngine, registry, disputeManager, token, productManager;
  let deployer, supplier, factory, consumer, retailer, distributor, nonRegistered;

  // StakeholderRegistry roles (assumed order: None=0, Supplier=1, Factory=2, Distributor=3, Retailer=4, Consumer=5)
  const Role = {
    None: 0,
    Supplier: 1,
    Factory: 2,
    Distributor: 3,
    Retailer: 4,
    Consumer: 5,
  };

  // Score types (see contract enum)
  const ScoreType = {
    TRUST: 0,
    DELIVERY_SPEED: 1,
    MATERIAL_QUALITY: 2,
    PRODUCT_QUALITY: 3,
    WARRANTY: 4,
    ECO_RATING: 5,
    PACKAGING: 6,
    TRANSPARENCY: 7,
    ACCURACY: 8,
    DELIVERY: 9,
    PRICE_FAIRNESS: 10,
    RETURN_POLICY: 11,
  };

  // Precision constant as defined in the contract (1e18)
  const PRECISION = ethers.parseUnits("1", 18);
  const REWARD_AMOUNT = ethers.parseUnits("10", 18);


  // Helper function to parse the ScoreAssigned event from transaction logs.
  async function getScoreAssignedEvent(tx) {
    const receipt = await tx.wait();
    const iface = scoreEngine.interface;
    let parsedEvent;
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed.name === "ScoreAssigned") {
          parsedEvent = parsed;
          break;
        }
      } catch (error) {
        // Log doesn't belong to ScoreEngine, skip.
      }
    }
    if (!parsedEvent) {
      throw new Error("ScoreAssigned event not found");
    }
    return parsedEvent;
  }

  beforeEach(async function () {
    [deployer, supplier, factory, consumer, retailer, distributor, nonRegistered] = await ethers.getSigners();

    // Deploy StakeholderRegistry
    const StakeholderRegistry = await ethers.getContractFactory("StakeholderRegistry");
    registry = await StakeholderRegistry.deploy();
    await registry.waitForDeployment();

    //Deploy ProductManager
    const ProductManager = await ethers.getContractFactory("ProductManager");
    productManager = await ProductManager.deploy();
    await productManager.waitForDeployment();
    

    // Register stakeholders (assume registerStakeholder(role, metadataURI))
    await registry.connect(supplier).registerStakeholder(Role.Supplier, "supplier metadata");
    await registry.connect(factory).registerStakeholder(Role.Factory, "factory metadata");
    await registry.connect(consumer).registerStakeholder(Role.Consumer, "consumer metadata");
    await registry.connect(retailer).registerStakeholder(Role.Retailer, "retailer metadata");
    await registry.connect(distributor).registerStakeholder(Role.Distributor, "distributor metadata");

    // Deploy a dummy DisputeManager.
    const DisputeManager = await ethers.getContractFactory("DisputeManager");
    disputeManager = await DisputeManager.deploy(registry.getAddress());
    await disputeManager.waitForDeployment();

    // Deploy the Token contract.
    const Token = await ethers.getContractFactory("Token");
    token = await Token.deploy();
    await token.waitForDeployment();

    // Deploy ScoreEngine using the registry, disputeManager and token addresses.
    const ScoreEngine = await ethers.getContractFactory("ScoreEngine");
    scoreEngine = await ScoreEngine.deploy(registry.getAddress(), disputeManager.getAddress(), token.getAddress(), productManager.getAddress());
    await scoreEngine.waitForDeployment();
    await token.transfer(scoreEngine.getAddress(), ethers.parseUnits("1000", 18));

  });

  describe("rateStakeholder & EMA calculation", function () {
    it("allows a Factory to rate a Supplier and computes EMA correctly without reward", async function () {
      const supplierAddr = await supplier.getAddress();
      const factoryAddr = await factory.getAddress();

      // Record factory token balance before rating.
      const factoryInitialBalance = await token.balanceOf(factoryAddr);

      // Factory (role 2) rates Supplier with score type TRUST (0) and rating value 8.
      const tx1 = await scoreEngine.connect(factory).rateStakeholder(supplierAddr, ScoreType.TRUST, 8);
      const event1 = await getScoreAssignedEvent(tx1);
      expect(event1.args.rater).to.equal(factoryAddr);
      expect(event1.args.rated).to.equal(supplierAddr);
      expect(event1.args.scoreType).to.equal(ScoreType.TRUST);
      expect(event1.args.value).to.equal(ethers.parseUnits("8", 18));

      let globalScore = await scoreEngine.globalScoresByType(supplierAddr, ScoreType.TRUST);
      expect(globalScore).to.equal(ethers.parseUnits("8", 18));

      // Second rating: Factory rates Supplier with value 6.
      const tx2 = await scoreEngine.connect(factory).rateStakeholder(supplierAddr, ScoreType.TRUST, 6);
      const event2 = await getScoreAssignedEvent(tx2);
      expect(event2.args.value).to.equal(7980000000000000000n);
      globalScore = await scoreEngine.globalScoresByType(supplierAddr, ScoreType.TRUST);
      expect(globalScore).to.equal(7980000000000000000n);

      // Verify that factory (non-consumer) did not receive any token reward.
      const factoryFinalBalance = await token.balanceOf(factoryAddr);
      expect(factoryFinalBalance-factoryInitialBalance).to.equal(0);
    });

    it("allows a Consumer to rate a Factory and receives token reward", async function () {
      const factoryAddr = await factory.getAddress();
      const consumerAddr = await consumer.getAddress();

      // Record consumer token balance before rating.
      const consumerInitialBalance = await token.balanceOf(consumerAddr);

      // Consumer (role 5) rates Factory with allowed score type PRODUCT_QUALITY (3) and value 9.
      const tx = await scoreEngine.connect(consumer).rateStakeholder(factoryAddr, ScoreType.PRODUCT_QUALITY, 9);
      const event = await getScoreAssignedEvent(tx);
      expect(event.args.rater).to.equal(consumerAddr);
      expect(event.args.rated).to.equal(factoryAddr);
      expect(event.args.scoreType).to.equal(ScoreType.PRODUCT_QUALITY);
      expect(event.args.value).to.equal(ethers.parseUnits("9", 18));

      const ema = await scoreEngine.globalScoresByType(factoryAddr, ScoreType.PRODUCT_QUALITY);
      expect(ema).to.equal(ethers.parseUnits("9", 18));

      // Verify that consumer received the reward.
      const consumerFinalBalance = await token.balanceOf(consumerAddr);
      expect(consumerFinalBalance-consumerInitialBalance).to.equal(REWARD_AMOUNT);
    });

    it("reverts if a rating is submitted with an invalid score value", async function () {
      await expect(
        scoreEngine.connect(factory).rateStakeholder(await supplier.getAddress(), ScoreType.TRUST, 0)
      ).to.be.revertedWith("Score value must be between 1 and 10");
      await expect(
        scoreEngine.connect(factory).rateStakeholder(await supplier.getAddress(), ScoreType.TRUST, 11)
      ).to.be.revertedWith("Score value must be between 1 and 10");
    });

    it("reverts if the rated stakeholder is not registered", async function () {
      await expect(
        scoreEngine.connect(factory).rateStakeholder(await nonRegistered.getAddress(), ScoreType.TRUST, 5)
      ).to.be.revertedWith("Rated stakeholder not registered");
    });

    it("reverts if the rater is not registered", async function () {
      await expect(
        scoreEngine.connect(nonRegistered).rateStakeholder(await supplier.getAddress(), ScoreType.TRUST, 5)
      ).to.be.revertedWith("Rater not valid");
    });

    it("reverts if an invalid role combination is used", async function () {
      // For example, Factory rating itself is disallowed.
      await expect(
        scoreEngine.connect(factory).rateStakeholder(factory.getAddress(), ScoreType.TRUST, 5)
      ).to.be.revertedWith("Invalid role or score type for this rating");
    });

    it("reverts if a valid role combination but invalid score type is used", async function () {
      // Factory (role 2) attempting to rate Supplier with PRODUCT_QUALITY (3) should revert.
      await expect(
        scoreEngine.connect(factory).rateStakeholder(await supplier.getAddress(), ScoreType.PRODUCT_QUALITY, 5)
      ).to.be.revertedWith("Invalid role or score type for this rating");
    });
  });

  describe("updateConfidenceAfterDispute", function () {
    it("updates confidence score correctly when votes disagree", async function () {
      // Ensure factory's confidence is initialized by rating.
      await scoreEngine.connect(factory).rateStakeholder(await supplier.getAddress(), ScoreType.TRUST, 8);
      let initialConfidence = await scoreEngine.confidenceScores(factory.getAddress());
      expect(initialConfidence).to.equal(100);
      
      // Simulate a dispute: factory is respondent.
      let dispute = {
        disputeId: 1,
        ratingId: 1,
        challenger: consumer.address,
        respondent: factory.address,
        depositChallenger: ethers.parseEther("1"),
        depositRespondent: ethers.parseEther("1"),
        votingDeadline: (await ethers.provider.getBlock("latest")).timestamp + 86400,
        depositsComplete: true,
        outcome: 0,
        votesForRespondent: 20,
        votesForChallenger: 80,
        voters: [consumer.address],
        finalized: true,
        exists: true
      };

      await scoreEngine.updateConfidenceAfterDispute(dispute);
      let newConfidence = await scoreEngine.confidenceScores(factory.address);
      expect(newConfidence).to.equal(88);
    });

    it("reverts updateConfidenceAfterDispute if rater is not Factory or Retailer", async function () {
      let dispute = {
        disputeId: 3,
        ratingId: 1,
        challenger: factory.address,
        respondent: consumer.address,
        depositChallenger: ethers.parseEther("1"),
        depositRespondent: ethers.parseEther("1"),
        votingDeadline: (await ethers.provider.getBlock("latest")).timestamp + 86400,
        depositsComplete: true,
        outcome: 0,
        votesForRespondent: 10,
        votesForChallenger: 15,
        voters: [factory.address],
        finalized: true,
        exists: true
      };

      await expect(
        scoreEngine.updateConfidenceAfterDispute(dispute)
      ).to.be.revertedWith("Confidence score only applies to factories/retailers");
    });
  });
});