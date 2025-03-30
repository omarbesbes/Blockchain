const { expect } = require("chai");
const { ethers } = require("hardhat");

// Helper function to decode event arguments from receipt.logs.
function getEventArgs(receipt, eventName, iface) {
  // Loop over all logs and try to parse them.
  for (let i = 0; i < receipt.logs.length; i++) {
    try {
      const parsedLog = iface.parseLog(receipt.logs[i]);
      if (parsedLog.name === eventName) {
        return parsedLog.args;
      }
    } catch (e) {
      // If parsing fails, skip this log.
    }
  }
  return null;
}

describe("DisputeManager", function () {
  let DisputeManager, disputeManager;
  let owner, actorA, actorB, voter1, voter2, voter3;
  // ethers.parseEther is used in ethers v6; for ethers v5 use ethers.utils.parseEther.
  const DEPOSIT_AMOUNT = ethers.parseEther("1");

  beforeEach(async function () {
    [owner, actorA, actorB, voter1, voter2, voter3, ...addrs] = await ethers.getSigners();
    // In our scenario: actorA is the respondent and actorB is the challenger.
    DisputeManager = await ethers.getContractFactory("DisputeManager");
    disputeManager = await DisputeManager.deploy();
    await disputeManager.waitForDeployment();
  });

  describe("initiateDispute", function () {
    it("should allow a challenger to initiate a dispute with correct deposit", async function () {
      const tx = await disputeManager.connect(actorB).initiateDispute(123, actorA.address, { value: DEPOSIT_AMOUNT });
      const receipt = await tx.wait();
      // Use helper to get event arguments.
      const eventArgs = getEventArgs(receipt, "DisputeInitiated", disputeManager.interface);
      expect(eventArgs).to.not.be.null;
      expect(eventArgs.disputeId).to.equal(1);
      expect(eventArgs.ratingId).to.equal(123);
      expect(eventArgs.challenger).to.equal(actorB.address);
      expect(eventArgs.respondent).to.equal(actorA.address);
    });

    it("should revert if deposit is not equal to DEPOSIT_AMOUNT", async function () {
      await expect(
        disputeManager.connect(actorB).initiateDispute(123, actorA.address, { value: ethers.parseEther("0.5") })
      ).to.be.revertedWith("Challenger deposit must be equal to DEPOSIT_AMOUNT");
    });
  });

  describe("respondToDispute", function () {
    beforeEach(async function () {
      await disputeManager.connect(actorB).initiateDispute(456, actorA.address, { value: DEPOSIT_AMOUNT });
    });

    it("should allow the respondent to respond with correct deposit", async function () {
      await expect(
        disputeManager.connect(actorA).respondToDispute(1, { value: DEPOSIT_AMOUNT })
      ).to.emit(disputeManager, "RespondedToDispute").withArgs(1, actorA.address);
    });

    it("should revert if a non-respondent tries to respond", async function () {
      await expect(
        disputeManager.connect(actorB).respondToDispute(1, { value: DEPOSIT_AMOUNT })
      ).to.be.revertedWith("Only respondent can respond");
    });

    it("should revert if deposit is incorrect", async function () {
      await expect(
        disputeManager.connect(actorA).respondToDispute(1, { value: ethers.parseEther("0.5") })
      ).to.be.revertedWith("Respondent deposit must equal DEPOSIT_AMOUNT");
    });
  });

  describe("voteDispute", function () {
    beforeEach(async function () {
      await disputeManager.connect(actorB).initiateDispute(789, actorA.address, { value: DEPOSIT_AMOUNT });
      await disputeManager.connect(actorA).respondToDispute(1, { value: DEPOSIT_AMOUNT });
    });

    it("should allow voters to cast their vote", async function () {
      await expect(disputeManager.connect(voter1).voteDispute(1, true))
        .to.emit(disputeManager, "VoteCast")
        .withArgs(1, voter1.address, true);
      await expect(disputeManager.connect(voter2).voteDispute(1, false))
        .to.emit(disputeManager, "VoteCast")
        .withArgs(1, voter2.address, false);
    });

    it("should revert if a voter votes twice", async function () {
      await disputeManager.connect(voter1).voteDispute(1, true);
      await expect(disputeManager.connect(voter1).voteDispute(1, false))
        .to.be.revertedWith("Voter has already voted");
    });
  });

  describe("finalizeDispute", function () {
    beforeEach(async function () {
      // Initiate dispute and respond.
      await disputeManager.connect(actorB).initiateDispute(101, actorA.address, { value: DEPOSIT_AMOUNT });
      await disputeManager.connect(actorA).respondToDispute(1, { value: DEPOSIT_AMOUNT });
    });

    it("should revert finalizeDispute if voting period not over", async function () {
      await expect(disputeManager.finalizeDispute(1)).to.be.revertedWith("Voting period not over");
    });

    it("should finalize dispute in favor of respondent when votesForRespondent >= votesForChallenger", async function () {
      // Two voters vote for respondent and one votes for challenger.
      await disputeManager.connect(voter1).voteDispute(1, true);
      await disputeManager.connect(voter2).voteDispute(1, true);
      await disputeManager.connect(voter3).voteDispute(1, false);

      // Increase time to after the voting period.
      await ethers.provider.send("evm_increaseTime", [86400 + 1]); // 1 day + 1 second
      await ethers.provider.send("evm_mine", []);

      await expect(disputeManager.finalizeDispute(1))
        .to.emit(disputeManager, "DisputeFinalized")
        .withArgs(1, 1); // Outcome: RespondentWins (enum value 1)

      const disputeDetails = await disputeManager.getDisputeDetails(1);
      expect(disputeDetails.outcome).to.equal(1);
    });

    it("should finalize dispute in favor of challenger when votesForChallenger > votesForRespondent", async function () {
      // Two voters vote for challenger and one for respondent.
      await disputeManager.connect(voter1).voteDispute(1, false);
      await disputeManager.connect(voter2).voteDispute(1, false);
      await disputeManager.connect(voter3).voteDispute(1, true);

      // Increase time to after the voting period.
      await ethers.provider.send("evm_increaseTime", [86400 + 1]);
      await ethers.provider.send("evm_mine", []);

      await expect(disputeManager.finalizeDispute(1))
        .to.emit(disputeManager, "DisputeFinalized")
        .withArgs(1, 2); // Outcome: ChallengerWins (enum value 2)

      const disputeDetails = await disputeManager.getDisputeDetails(1);
      expect(disputeDetails.outcome).to.equal(2);
    });
  });
});
