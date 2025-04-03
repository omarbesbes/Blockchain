const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("ScoreEngine", function () {
  let scoreEngine, registry, disputeManager;
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

    // Deploy ScoreEngine using the registry and disputeManager addresses.
    const ScoreEngine = await ethers.getContractFactory("ScoreEngine");
    scoreEngine = await ScoreEngine.deploy(registry.getAddress(), disputeManager.getAddress());
    await scoreEngine.waitForDeployment();
  });

  describe("rateStakeholder & EMA per score type", function () {
    it("allows a Factory to rate a Supplier with a valid score type and computes EMA correctly", async function () {
      const supplierAddr = await supplier.getAddress();
      const factoryAddr = await factory.getAddress();

      // First rating: value 8 should set EMA = 8.
      const tx1 = await scoreEngine.connect(factory).rateStakeholder(supplierAddr, ScoreType.TRUST, 8);
      const event1 = await getScoreAssignedEvent(tx1);
      expect(event1.args.rater).to.equal(factoryAddr);
      expect(event1.args.rated).to.equal(supplierAddr);
      expect(event1.args.scoreType).to.equal(ScoreType.TRUST);
      expect(event1.args.value).to.equal(8);

      let globalScore = await scoreEngine.globalScoresByType(supplierAddr, ScoreType.TRUST);
      expect(globalScore).to.equal(8);

      // Second rating: value 6.
      // Expected newEMA = (10*6 + 90*8)/100 = 780/100 = 7 (integer division).
      const tx2 = await scoreEngine.connect(factory).rateStakeholder(supplierAddr, ScoreType.TRUST, 6);
      const event2 = await getScoreAssignedEvent(tx2);
      expect(event2.args.value).to.equal(7);

      globalScore = await scoreEngine.globalScoresByType(supplierAddr, ScoreType.TRUST);
      expect(globalScore).to.equal(7);
    });

    it("allows a Consumer to rate a Factory with valid score type (PRODUCT_QUALITY)", async function () {
      const factoryAddr = await factory.getAddress();
      const consumerAddr = await consumer.getAddress();

      const tx = await scoreEngine.connect(consumer).rateStakeholder(factoryAddr, ScoreType.PRODUCT_QUALITY, 9);
      const event = await getScoreAssignedEvent(tx);
      expect(event.args.rater).to.equal(consumerAddr);
      expect(event.args.rated).to.equal(factoryAddr);
      expect(event.args.scoreType).to.equal(ScoreType.PRODUCT_QUALITY);
      expect(event.args.value).to.equal(9);

      const ema = await scoreEngine.globalScoresByType(factoryAddr, ScoreType.PRODUCT_QUALITY);
      expect(ema).to.equal(9);
    });

    it("allows a Retailer to rate a Distributor with valid score type (PACKAGING)", async function () {
      const distributorAddr = await distributor.getAddress();
      const retailerAddr = await retailer.getAddress();

      const tx = await scoreEngine.connect(retailer).rateStakeholder(distributorAddr, ScoreType.PACKAGING, 7);
      const event = await getScoreAssignedEvent(tx);
      expect(event.args.rater).to.equal(retailerAddr);
      expect(event.args.rated).to.equal(distributorAddr);
      expect(event.args.scoreType).to.equal(ScoreType.PACKAGING);
      expect(event.args.value).to.equal(7);

      const ema = await scoreEngine.globalScoresByType(distributorAddr, ScoreType.PACKAGING);
      expect(ema).to.equal(7);
    });

    it("allows a Consumer to rate a Retailer with valid score type (DELIVERY)", async function () {
      const retailerAddr = await retailer.getAddress();
      const consumerAddr = await consumer.getAddress();

      const tx = await scoreEngine.connect(consumer).rateStakeholder(retailerAddr, ScoreType.DELIVERY, 10);
      const event = await getScoreAssignedEvent(tx);
      expect(event.args.rater).to.equal(consumerAddr);
      expect(event.args.rated).to.equal(retailerAddr);
      expect(event.args.scoreType).to.equal(ScoreType.DELIVERY);
      expect(event.args.value).to.equal(10);

      const ema = await scoreEngine.globalScoresByType(retailerAddr, ScoreType.DELIVERY);
      expect(ema).to.equal(10);
    });

    it("updates score history and getter functions correctly", async function () {
      const supplierAddr = await supplier.getAddress();
      const factoryAddr = await factory.getAddress();

      const tx1 = await scoreEngine.connect(factory).rateStakeholder(supplierAddr, ScoreType.TRUST, 8);
      const event1 = await getScoreAssignedEvent(tx1);
      const scoreId1 = event1.args.scoreId;

      const tx2 = await scoreEngine.connect(factory).rateStakeholder(supplierAddr, ScoreType.TRUST, 6);
      const event2 = await getScoreAssignedEvent(tx2);
      const scoreId2 = event2.args.scoreId;

      const scores = await scoreEngine.getScores(supplierAddr);
      expect(scores.length).to.equal(2);
      expect(scores[1].value).to.equal(7); // EMA computed as 7 in a previous test.

      const scoreIds = await scoreEngine.getStakeholderScoreIds(supplierAddr);
      expect(scoreIds.length).to.equal(2);
      expect(scoreIds[0]).to.equal(scoreId1);
      expect(scoreIds[1]).to.equal(scoreId2);

      const scoreRecord1 = await scoreEngine.getScoreById(scoreId1);
      expect(scoreRecord1.value).to.equal(8);
      expect(scoreRecord1.scoreType).to.equal(ScoreType.TRUST);
      const scoreRecord2 = await scoreEngine.getScoreById(scoreId2);
      expect(scoreRecord2.value).to.equal(7);
      expect(scoreRecord2.scoreType).to.equal(ScoreType.TRUST);
    });

    it("reverts if a rating is submitted with invalid score value", async function () {
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
      await expect(
        scoreEngine.connect(factory).rateStakeholder(await factory.getAddress(), ScoreType.TRUST, 5)
      ).to.be.revertedWith("Invalid role or score type for this rating");
    });

    it("reverts if a valid role combination but invalid score type is used", async function () {
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
