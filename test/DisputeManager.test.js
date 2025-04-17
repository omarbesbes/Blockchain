const { expect } = require("chai");
const { ethers } = require("hardhat");

// Helper to decode event logs
function getEventArgs(receipt, eventName, iface) {
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed.name === eventName) {
        return parsed.args;
      }
    } catch (err) {
    }
  }
  return null;
}

describe("DisputeManager with Retailer→Distributor purchase", function () {
  let owner, actorA, actorB, voter1, voter2, voter3;
  // actorA => Retailer (role=4)
  // actorB => Distributor (role=3)
  let registry, productManager, token, scoreEngine, transactionManager, disputeManager;
  let ratingId;
  let disputeId;
  const Role = { None: 0, Supplier: 1, Factory: 2, Distributor: 3, Retailer: 4, Consumer: 5 };
  const DEPOSIT_AMOUNT = ethers.parseEther("1");
  const REWARD_AMOUNT = ethers.parseEther("10");

  beforeEach(async function () {
    [owner, actorA, actorB, voter1, voter2, voter3] = await ethers.getSigners();

    const StakeholderRegistry = await ethers.getContractFactory("StakeholderRegistry");
    registry = await StakeholderRegistry.deploy();
    await registry.waitForDeployment();

    await registry.connect(actorA).registerStakeholder(Role.Retailer, "Retailer A");
    await registry.connect(actorB).registerStakeholder(Role.Distributor, "Distributor B");

    await registry.connect(voter1).registerStakeholder(Role.Distributor, "voter1");
    await registry.connect(voter2).registerStakeholder(Role.Distributor, "voter2");
    await registry.connect(voter3).registerStakeholder(Role.Distributor, "voter3");

    const ProductManager = await ethers.getContractFactory("ProductManager");
    productManager = await ProductManager.deploy();
    await productManager.waitForDeployment();

    const Token = await ethers.getContractFactory("Token");
    token = await Token.deploy();
    await token.waitForDeployment();

    const ScoreEngine = await ethers.getContractFactory("ScoreEngine");
    scoreEngine = await ScoreEngine.deploy(
      registry.getAddress(),
      token.getAddress(),
      productManager.getAddress()
    );
    await scoreEngine.waitForDeployment();

    const DisputeManager = await ethers.getContractFactory("DisputeManager");
    disputeManager = await DisputeManager.deploy(registry.getAddress(), scoreEngine.getAddress());
    await disputeManager.waitForDeployment();

    const TransactionManager = await ethers.getContractFactory("TransactionManager");
    transactionManager = await TransactionManager.deploy(
      registry.getAddress(),
      productManager.getAddress(),
      scoreEngine.getAddress(),
      token.getAddress(),
      disputeManager.getAddress()
    );
    await transactionManager.waitForDeployment();

    await token.transfer(await actorA.getAddress(), ethers.parseEther("500"));
    await token.transfer(await actorB.getAddress(), ethers.parseEther("500"));
    await token.transfer(await voter1.getAddress(), ethers.parseEther("500"));
    await token.transfer(await voter2.getAddress(), ethers.parseEther("500"));
    await token.transfer(await voter3.getAddress(), ethers.parseEther("500"));
    await token.transfer(scoreEngine.getAddress(), ethers.parseEther("1000"));

    let tx = await transactionManager
      .connect(actorA)
      .recordBuyOperation(await actorB.getAddress(), 0);
    await tx.wait();

    await token.connect(actorB).approve(transactionManager.getAddress(), REWARD_AMOUNT);
    await transactionManager.connect(actorB).confirmSellOperation(1);

    tx = await transactionManager
      .connect(actorA)
      .buyerRateSeller(
        1,         // transactionId
        6,         // scoreType
        6,         // scoreValue
        0,         // productId=0 
        false      // ratingFactory=false
      );
    const rateReceipt = await tx.wait();
    const scoreIface = (await ethers.getContractFactory("ScoreEngine")).interface;
    const ev = getEventArgs(rateReceipt, "ScoreAssigned", scoreIface);
    ratingId = ev.scoreId;
  });

  it("should allow the rated stakeholder (Distributor) to initiate a dispute with correct deposit", async function () {
    const tx = await disputeManager
      .connect(actorB)
      .initiateDispute(ratingId, scoretype=6, await actorA.getAddress(), { value: DEPOSIT_AMOUNT });
    const receipt = await tx.wait();
    const eargs = getEventArgs(receipt, "DisputeInitiated", disputeManager.interface);

    expect(eargs.disputeId).to.equal(1);
    expect(eargs.ratingId).to.equal(ratingId);
    expect(eargs.challenger).to.equal(await actorB.getAddress());
    expect(eargs.respondent).to.equal(await actorA.getAddress());
  });

  it("should revert if deposit is incorrect", async function () {
    await expect(
      disputeManager
        .connect(actorB)
        .initiateDispute(ratingId, scoretype=6, await actorA.getAddress(), { value: ethers.parseEther("0.5") })
    ).to.be.revertedWith("Challenger deposit must be equal to DEPOSIT_AMOUNT");
  });

  describe("respondToDispute", function () {
    beforeEach(async function () {
      const tx = await disputeManager
        .connect(actorB)
        .initiateDispute(ratingId, scoretype=6, await actorA.getAddress(), { value: DEPOSIT_AMOUNT });
      const rx = await tx.wait();
      disputeId = getEventArgs(rx, "DisputeInitiated", disputeManager.interface).disputeId;
    });

    it("should allow respondent (actorA) to respond with correct deposit", async function () {
      await expect(
        disputeManager.connect(actorA).respondToDispute(disputeId, { value: DEPOSIT_AMOUNT })
      )
        .to.emit(disputeManager, "RespondedToDispute")
        .withArgs(disputeId, await actorA.getAddress());
    });
  });

  describe("voteDispute", function () {
    beforeEach(async function () {
      const tx1 = await disputeManager
        .connect(actorB)
        .initiateDispute(ratingId, scoretype=6, await actorA.getAddress(), { value: DEPOSIT_AMOUNT });
      const rx1 = await tx1.wait();
      disputeId = getEventArgs(rx1, "DisputeInitiated", disputeManager.interface).disputeId;

      await disputeManager.connect(actorA).respondToDispute(disputeId, { value: DEPOSIT_AMOUNT });
    });

    it("should allow voters to vote if they purchased from the challenger (actorB)", async function () {
      await disputeManager.recordPurchase(await voter1.getAddress(), await actorB.getAddress());

      await expect(disputeManager.connect(voter1).voteDispute(disputeId, true))
        .to.emit(disputeManager, "VoteCast")
        .withArgs(disputeId, await voter1.getAddress(), true);
    });
  });

  describe("finalizeDispute", function () {
    beforeEach(async function () {
      const tx1 = await disputeManager
        .connect(actorB)
        .initiateDispute(ratingId, scoretype=6, await actorA.getAddress(), { value: DEPOSIT_AMOUNT });
      const rx1 = await tx1.wait();
      disputeId = getEventArgs(rx1, "DisputeInitiated", disputeManager.interface).disputeId;

      await disputeManager.connect(actorA).respondToDispute(disputeId, { value: DEPOSIT_AMOUNT });
    });

    it("should finalize dispute in favor of respondent if votesForRespondent >= votesForChallenger", async function () {
      await disputeManager.recordPurchase(await voter1.getAddress(), await actorB.getAddress());
      await disputeManager.recordPurchase(await voter2.getAddress(), await actorB.getAddress());
      await disputeManager.recordPurchase(await voter3.getAddress(), await actorB.getAddress());

      await disputeManager.connect(voter1).voteDispute(disputeId, true);  // true => support respondent (actorA)
      await disputeManager.connect(voter2).voteDispute(disputeId, true);
      await disputeManager.connect(voter3).voteDispute(disputeId, false);

      await ethers.provider.send("evm_increaseTime", [86400 + 1]);
      await ethers.provider.send("evm_mine", []);

      const txFinal = await disputeManager.finalizeDispute(disputeId);
      const rxFinal = await txFinal.wait();
      const finalEv = getEventArgs(rxFinal, "DisputeFinalized", disputeManager.interface);
      expect(finalEv.outcome).to.equal(1); // RespondentWins
    });
  });

  it("Full rating dispute flow in one go", async function () {
    const tx1 = await disputeManager
      .connect(actorB)
      .initiateDispute(ratingId, scoretype=6, await actorA.getAddress(), { value: DEPOSIT_AMOUNT });
    const rx1 = await tx1.wait();
    disputeId = getEventArgs(rx1, "DisputeInitiated", disputeManager.interface).disputeId;

    await disputeManager.connect(actorA).respondToDispute(disputeId, { value: DEPOSIT_AMOUNT });

    await disputeManager.recordPurchase(voter1.address, actorB.address);
    await disputeManager.recordPurchase(voter2.address, actorB.address);
    await disputeManager.recordPurchase(voter3.address, actorB.address);

    await disputeManager.connect(voter1).voteDispute(disputeId, false); // false => for challenger
    await disputeManager.connect(voter2).voteDispute(disputeId, false);
    await disputeManager.connect(voter3).voteDispute(disputeId, true);

    await ethers.provider.send("evm_increaseTime", [86400 + 1]);
    await ethers.provider.send("evm_mine", []);

    const txFinal = await disputeManager.finalizeDispute(disputeId);
    const rxFinal = await txFinal.wait();
    const finalEv = getEventArgs(rxFinal, "DisputeFinalized", disputeManager.interface);
    expect(finalEv.outcome).to.equal(2); // ChallengerWins
  });
});
