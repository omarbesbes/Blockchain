const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ScoreEngine.getApplicableScoreTypes", function () {
  let StakeholderRegistry, registry;
  let ScoreEngine, scoreEngine;
  let DisputeManager, disputeManager;

  let deployer, addr1, addr2, addr3, addr4, unregistered, others;

  before(async function () {
    [deployer, addr1, addr2, addr3, addr4, unregistered, ...others] = await ethers.getSigners();

    // Deploy the StakeholderRegistry contract.
    const StakeholderRegistryFactory = await ethers.getContractFactory("StakeholderRegistry");
    registry = await StakeholderRegistryFactory.deploy();
    await registry.waitForDeployment();

    // Register stakeholders with roles 1 through 4.
    await registry.connect(addr1).registerStakeholder(1, "ipfs://role1");
    await registry.connect(addr2).registerStakeholder(2, "ipfs://role2");
    await registry.connect(addr3).registerStakeholder(3, "ipfs://role3");
    await registry.connect(addr4).registerStakeholder(4, "ipfs://role4");

    const DisputeManager = await ethers.getContractFactory("DisputeManager");
    disputeManager = await DisputeManager.deploy(registry.getAddress());
    await disputeManager.waitForDeployment();
    // Deploy the ScoreEngine contract with the registry's address.
    const ScoreEngineFactory = await ethers.getContractFactory("ScoreEngine");
    scoreEngine = await ScoreEngineFactory.deploy(registry.getAddress(), disputeManager.getAddress());
    await scoreEngine.waitForDeployment();
  });

  it("should return [1, 2, 3] for a role 1 stakeholder", async function () {
    const types = await scoreEngine.getApplicableScoreTypes(addr1.address);
    // Compare directly as BigInts
    expect(types).to.deep.equal([1n, 2n, 3n]);
  });

  it("should return [4, 5, 6] for a role 2 stakeholder", async function () {
    const types = await scoreEngine.getApplicableScoreTypes(addr2.address);
    expect(types).to.deep.equal([4n, 5n, 6n]);
  });

  it("should return [7, 8, 9] for a role 3 stakeholder", async function () {
    const types = await scoreEngine.getApplicableScoreTypes(addr3.address);
    expect(types).to.deep.equal([7n, 8n, 9n]);
  });

  it("should return [10, 11, 12] for a role 4 stakeholder", async function () {
    const types = await scoreEngine.getApplicableScoreTypes(addr4.address);
    expect(types).to.deep.equal([10n, 11n, 12n]);
  });

  it("should return an empty array for an unregistered stakeholder", async function () {
    const types = await scoreEngine.getApplicableScoreTypes(unregistered.address);
    expect(types.length).to.equal(0);
  });
});
