const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("ScoreEngine", function () {
  let scoreEngine, registry;
  let deployer, supplier, factory, consumer, retailer, distributor, nonRegistered;

  // StakeholderRegistry enum order:
  // None: 0, Supplier: 1, Factory: 2, Distributor: 3, Retailer: 4, Consumer: 5
  const Role = {
    None: 0,
    Supplier: 1,
    Factory: 2,
    Distributor: 3,
    Retailer: 4,
    Consumer: 5,
  };

  beforeEach(async function () {
    [deployer, supplier, factory, consumer, retailer, distributor, nonRegistered] =
      await ethers.getSigners();

    // Deploy the StakeholderRegistry contract
    const StakeholderRegistry = await ethers.getContractFactory("StakeholderRegistry");
    registry = await StakeholderRegistry.deploy();
    await registry.waitForDeployment();

    // Each stakeholder registers itself with its appropriate role.
    // The function registerStakeholder expects (Role, metadataURI)
    await registry.connect(supplier).registerStakeholder(Role.Supplier, "supplier metadata");
    await registry.connect(factory).registerStakeholder(Role.Factory, "factory metadata");
    await registry.connect(consumer).registerStakeholder(Role.Consumer, "consumer metadata");
    await registry.connect(retailer).registerStakeholder(Role.Retailer, "retailer metadata");
    await registry.connect(distributor).registerStakeholder(Role.Distributor, "distributor metadata");

    // Deploy the ScoreEngine contract with the registry address.
    const ScoreEngine = await ethers.getContractFactory("ScoreEngine");
    scoreEngine = await ScoreEngine.deploy(registry.getAddress());
    await scoreEngine.waitForDeployment();
  });

  // Helper function to parse ScoreAssigned event from receipt.logs using ethers v6
  async function getScoreAssignedEvent(txResponse) {
    const receipt = await txResponse.wait();
    let parsedEvent;
    for (const log of receipt.logs) {
      try {
        const parsed = scoreEngine.interface.parseLog(log);
        if (parsed.name === "ScoreAssigned") {
          parsedEvent = parsed;
          break;
        }
      } catch (e) {
        // ignore logs that do not belong to our contract
      }
    }
    expect(parsedEvent, "ScoreAssigned event not found").to.not.be.undefined;
    return parsedEvent;
  }

  describe("rateStakeholder", function () {
    it("allows a Factory to rate a Supplier with a valid score type and updates global score", async function () {
      // Allowed: Rated = Supplier (role 1) and rater = Factory (role 2)
      // Valid score types: TRUST (0), DELIVERY_SPEED (1), MATERIAL_QUALITY (2)
      const supplierAddr = await supplier.getAddress();
      const factoryAddr = await factory.getAddress();

      const tx = await scoreEngine
        .connect(factory)
        .rateStakeholder(supplierAddr, 0, 7); // using TRUST (0) with a score value of 7

      // Using our helper to parse the ScoreAssigned event.
      const event = await getScoreAssignedEvent(tx);
      expect(event.args.rater).to.equal(factoryAddr);
      expect(event.args.rated).to.equal(supplierAddr);
      expect(event.args.scoreType).to.equal(0);
      expect(event.args.value).to.equal(7);
      // event.args.timestamp and event.args.scoreId are also available.

      const scores = await scoreEngine.getScores(supplierAddr);
      expect(scores.length).to.equal(1);
      expect(scores[0].scoreType).to.equal(0);
      expect(scores[0].value).to.equal(7);
      expect(scores[0].rater).to.equal(factoryAddr);

      // Check that the global score is updated.
      const globalScore = await scoreEngine.globalScores(supplierAddr);
      expect(globalScore).to.equal(7);
    });

    it("reverts if score value is 0", async function () {
      await expect(
        scoreEngine.connect(factory).rateStakeholder(await supplier.getAddress(), 0, 0)
      ).to.be.revertedWith("Score value must be between 1 and 10");
    });

    it("reverts if score value is greater than 10", async function () {
      await expect(
        scoreEngine.connect(factory).rateStakeholder(await supplier.getAddress(), 0, 11)
      ).to.be.revertedWith("Score value must be between 1 and 10");
    });

    it("reverts if the rated stakeholder is not registered", async function () {
      await expect(
        scoreEngine.connect(factory).rateStakeholder(await nonRegistered.getAddress(), 0, 5)
      ).to.be.revertedWith("Rated stakeholder not registered");
    });

    it("reverts if the rater is not registered", async function () {
      // nonRegistered (role None) attempts to rate supplier.
      await expect(
        scoreEngine.connect(nonRegistered).rateStakeholder(await supplier.getAddress(), 0, 5)
      ).to.be.revertedWith("Rater not valid");
    });

    it("reverts for an invalid role combination", async function () {
      // For example, a Factory (role 2) rating another Factory (role 2) is not allowed.
      await expect(
        scoreEngine.connect(factory).rateStakeholder(await factory.getAddress(), 0, 5)
      ).to.be.revertedWith("Invalid role or score type for this rating");
    });

    it("reverts if a valid role combination but invalid score type is used", async function () {
      // Allowed: Factory rating Supplier should use score types 0, 1, or 2.
      // Using score type 3 (PRODUCT_QUALITY) is invalid.
      await expect(
        scoreEngine.connect(factory).rateStakeholder(await supplier.getAddress(), 3, 5)
      ).to.be.revertedWith("Invalid role or score type for this rating");
    });

    it("allows a Consumer to rate a Factory with a valid score type and updates global score", async function () {
      // Allowed: Rated = Factory (role 2) and rater = Consumer (role 5)
      // Valid score types: PRODUCT_QUALITY (3), WARRANTY (4), ECO_RATING (5)
      const consumerAddr = await consumer.getAddress();
      const factoryAddr = await factory.getAddress();

      const tx = await scoreEngine.connect(consumer).rateStakeholder(factoryAddr, 3, 8);
      const event = await getScoreAssignedEvent(tx);
      expect(event.args.rater).to.equal(consumerAddr);
      expect(event.args.rated).to.equal(factoryAddr);
      expect(event.args.scoreType).to.equal(3);
      expect(event.args.value).to.equal(8);

      const scores = await scoreEngine.getScores(factoryAddr);
      expect(scores.length).to.equal(1);
      expect(scores[0].scoreType).to.equal(3);
      expect(scores[0].value).to.equal(8);
      expect(scores[0].rater).to.equal(consumerAddr);

      // Global score for factory should be updated.
      const globalScore = await scoreEngine.globalScores(factoryAddr);
      expect(globalScore).to.equal(8);
    });

    it("allows a Retailer to rate a Distributor with a valid score type and updates global score", async function () {
      // Allowed: Rated = Distributor (role 3) and rater = Retailer (role 4)
      // Valid score types: PACKAGING (6), TRANSPARENCY (7), ACCURACY (8)
      const retailerAddr = await retailer.getAddress();
      const distributorAddr = await distributor.getAddress();

      const tx = await scoreEngine.connect(retailer).rateStakeholder(distributorAddr, 6, 9);
      const event = await getScoreAssignedEvent(tx);
      expect(event.args.rater).to.equal(retailerAddr);
      expect(event.args.rated).to.equal(distributorAddr);
      expect(event.args.scoreType).to.equal(6);
      expect(event.args.value).to.equal(9);

      const scores = await scoreEngine.getScores(distributorAddr);
      expect(scores.length).to.equal(1);
      expect(scores[0].scoreType).to.equal(6);
      expect(scores[0].value).to.equal(9);
      expect(scores[0].rater).to.equal(retailerAddr);

      const globalScore = await scoreEngine.globalScores(distributorAddr);
      expect(globalScore).to.equal(9);
    });

    it("allows a Consumer to rate a Retailer with a valid score type and updates global score", async function () {
      // Allowed: Rated = Retailer (role 4) and rater = Consumer (role 5)
      // Valid score types: DELIVERY (9), PRICE_FAIRNESS (10), RETURN_POLICY (11)
      const consumerAddr = await consumer.getAddress();
      const retailerAddr = await retailer.getAddress();

      const tx = await scoreEngine.connect(consumer).rateStakeholder(retailerAddr, 9, 6);
      const event = await getScoreAssignedEvent(tx);
      expect(event.args.rater).to.equal(consumerAddr);
      expect(event.args.rated).to.equal(retailerAddr);
      expect(event.args.scoreType).to.equal(9);
      expect(event.args.value).to.equal(6);

      const scores = await scoreEngine.getScores(retailerAddr);
      expect(scores.length).to.equal(1);
      expect(scores[0].scoreType).to.equal(9);
      expect(scores[0].value).to.equal(6);
      expect(scores[0].rater).to.equal(consumerAddr);

      const globalScore = await scoreEngine.globalScores(retailerAddr);
      expect(globalScore).to.equal(6);
    });

    it("reverts if a Consumer attempts to rate a Supplier", async function () {
      // Consumer is not allowed to rate a Supplier.
      await expect(
        scoreEngine.connect(consumer).rateStakeholder(await supplier.getAddress(), 0, 5)
      ).to.be.revertedWith("Invalid role or score type for this rating");
    });
  });

  describe("Score History and Lookup", function () {
    it("records a score and updates history, global score, and can be retrieved by getScoreById", async function () {
      const supplierAddr = await supplier.getAddress();
      const factoryAddr = await factory.getAddress();

      // Rate a score
      const tx = await scoreEngine.connect(factory).rateStakeholder(supplierAddr, 0, 8);
      const event = await getScoreAssignedEvent(tx);
      const scoreId = event.args.scoreId;

      // Global score check
      const globalScore = await scoreEngine.globalScores(supplierAddr);
      expect(globalScore).to.equal(8);

      // Check that the stakeholder's score IDs array contains the new score ID.
      const scoreIds = await scoreEngine.getStakeholderScoreIds(supplierAddr);
      expect(scoreIds.length).to.equal(1);
      expect(scoreIds[0]).to.equal(scoreId);

      // Retrieve the score using getScoreById.
      const score = await scoreEngine.getScoreById(scoreId);
      expect(score.value).to.equal(8);
      expect(score.scoreType).to.equal(0);
      expect(score.rater).to.equal(factoryAddr);
    });

    it("findScoreId returns the correct score id for a given rater, rated, and score type", async function () {
      const supplierAddr = await supplier.getAddress();
      const factoryAddr = await factory.getAddress();

      // Rate a score with DELIVERY_SPEED (score type 1) and value 9.
      await scoreEngine.connect(factory).rateStakeholder(supplierAddr, 1, 9);
      
      // Use findScoreId to get the score ID.
      const foundScoreId = await scoreEngine.findScoreId(factoryAddr, supplierAddr, 1);
      const score = await scoreEngine.getScoreById(foundScoreId);
      expect(score.value).to.equal(9);
      expect(score.scoreType).to.equal(1);
      expect(score.rater).to.equal(factoryAddr);
    });

    it("reverts when no matching score is found using findScoreId", async function () {
      const supplierAddr = await supplier.getAddress();
      const factoryAddr = await factory.getAddress();

      // Without rating for score type MATERIAL_QUALITY (2), expect revert.
      await expect(
        scoreEngine.findScoreId(factoryAddr, supplierAddr, 2)
      ).to.be.revertedWith("Score not found");
    });

    it("updates global score correctly after multiple ratings and records multiple score IDs", async function () {
      const supplierAddr = await supplier.getAddress();
      const factoryAddr = await factory.getAddress();

      // First rating: TRUST (score type 0) with score 8.
      await scoreEngine.connect(factory).rateStakeholder(supplierAddr, 0, 8);
      let globalScore = await scoreEngine.globalScores(supplierAddr);
      expect(globalScore).to.equal(8);

      // Second rating: DELIVERY_SPEED (score type 1) with score 6.
      await scoreEngine.connect(factory).rateStakeholder(supplierAddr, 1, 6);
      globalScore = await scoreEngine.globalScores(supplierAddr);
      // Expected average: (8 + 6) / 2 = 7 (integer division)
      expect(globalScore).to.equal(7);

      // Third rating: MATERIAL_QUALITY (score type 2) with score 10.
      await scoreEngine.connect(factory).rateStakeholder(supplierAddr, 2, 10);
      globalScore = await scoreEngine.globalScores(supplierAddr);
      // Expected average: (8 + 6 + 10) / 3 = 8
      expect(globalScore).to.equal(8);

      // Check that the stakeholder's score IDs array contains 3 entries.
      const scoreIds = await scoreEngine.getStakeholderScoreIds(supplierAddr);
      expect(scoreIds.length).to.equal(3);
    });
  });
});
