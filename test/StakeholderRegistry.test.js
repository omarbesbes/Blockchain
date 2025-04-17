const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StakeholderRegistry", function () {
  let StakeholderRegistry, registry;
  let owner, addr1, addr2, addr3;

  beforeEach(async function () {
    [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
    StakeholderRegistry = await ethers.getContractFactory("StakeholderRegistry");
    registry = await StakeholderRegistry.deploy();
    await registry.waitForDeployment();
  });

  describe("Registration", function () {
    it("Should allow a stakeholder to register", async function () {
      // Register addr1 as a Factory (enum value 2) with metadata
      await registry.connect(addr1).registerStakeholder(2, "ipfs://factory1");
      const role = await registry.getRole(addr1.address);
      expect(role).to.equal(2);
      const isReg = await registry.isRegistered(addr1.address);
      expect(isReg).to.equal(true);
    });

    it("Should not allow re-registration by the same address", async function () {
      await registry.connect(addr1).registerStakeholder(2, "ipfs://factory1");
      await expect(
        registry.connect(addr1).registerStakeholder(2, "ipfs://factory1")
      ).to.be.revertedWith("Already registered");
    });

    it("Should revert when registering with Role.None (0)", async function () {
      await expect(
        registry.connect(addr1).registerStakeholder(0, "ipfs://none")
      ).to.be.revertedWith("Invalid role");
    });
  });

  describe("Metadata Update", function () {
    it("Should allow a registered stakeholder to update metadata", async function () {
      await registry.connect(addr1).registerStakeholder(3, "ipfs://oldmetadata");
      await registry.connect(addr1).updateMetadata("ipfs://newmetadata");
      const metadata = await registry.getMetadata(addr1.address);
      expect(metadata).to.equal("ipfs://newmetadata");
    });

    it("Should revert metadata update if not registered", async function () {
      await expect(
        registry.connect(addr1).updateMetadata("ipfs://newmetadata")
      ).to.be.revertedWith("Stakeholder not registered");
    });
  });

  describe("Total Registered by Role", function () {
    it("Should correctly count registered stakeholders per role", async function () {
      await registry.connect(addr1).registerStakeholder(2, "ipfs://factory1");
      await registry.connect(addr2).registerStakeholder(2, "ipfs://factory2");
      await registry.connect(addr3).registerStakeholder(3, "ipfs://distributor");
      const totalFactory = await registry.totalRegisteredByRole(2);
      const totalDistributor = await registry.totalRegisteredByRole(3);
      expect(totalFactory).to.equal(2);
      expect(totalDistributor).to.equal(1);
    });
  });

  describe("Stakeholder Removal", function () {
    it("Should allow the owner to remove a stakeholder", async function () {
      await registry.connect(addr1).registerStakeholder(4, "ipfs://retailer");
      expect(await registry.isRegistered(addr1.address)).to.equal(true);
      await registry.removeStakeholder(addr1.address);
      expect(await registry.isRegistered(addr1.address)).to.equal(false);
    });

    it("Should revert removal if called by a non-owner", async function () {
      await registry.connect(addr1).registerStakeholder(4, "ipfs://retailer");
      await expect(
        registry.connect(addr1).removeStakeholder(addr1.address)
      ).to.be.reverted;
    });
  });

  describe("Stakeholder Role Transfer", function () {
    it("Should allow a registered stakeholder to transfer their role", async function () {
      await registry.connect(addr1).registerStakeholder(5, "ipfs://consumer");
      await registry.connect(addr1).transferStakeholderRole(addr2.address);
      
      // addr2 should now be registered, addr1 should not.
      expect(await registry.isRegistered(addr2.address)).to.equal(true);
      expect(await registry.isRegistered(addr1.address)).to.equal(false);
      const role = await registry.getRole(addr2.address);
      expect(role).to.equal(5);
    });

    it("Should revert transfer if recipient is already registered", async function () {
      await registry.connect(addr1).registerStakeholder(2, "ipfs://factory");
      await registry.connect(addr2).registerStakeholder(3, "ipfs://distributor");
      await expect(
        registry.connect(addr1).transferStakeholderRole(addr2.address)
      ).to.be.revertedWith("Recipient already registered");
    });
  });

  describe("Get All Stakeholders", function () {
    it("Should return all registered stakeholder addresses", async function () {
      await registry.connect(addr1).registerStakeholder(2, "ipfs://factory1");
      await registry.connect(addr2).registerStakeholder(3, "ipfs://distributor");
      const stakeholdersList = await registry.getAllStakeholders();
      expect(stakeholdersList).to.include(addr1.address);
      expect(stakeholdersList).to.include(addr2.address);
    });
  });
});