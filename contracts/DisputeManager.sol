// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title DisputeManager
 * @dev Manages disputes between two parties. When a dispute is raised,
 * both the challenger and the respondent deposit funds. Then conflict resolvers (voters)
 * cast their votes. At finalization, funds are distributed according to the outcome:
 *
 * - If the respondent wins (i.e. votesForRespondent >= votesForChallenger):
 *     * Respondent receives: depositRespondent + (depositChallenger / 2)
 *     * The remaining half of challenger's deposit is distributed equally among voters who voted for the respondent.
 *
 * - If the challenger wins (votesForChallenger > votesForRespondent):
 *     * Challenger receives: depositChallenger + (depositRespondent / 2)
 *     * The remaining half of respondent's deposit is distributed equally among voters who voted for the challenger.
 *
 * The contract uses a fixed deposit amount and a fixed voting period.
 */
contract DisputeManager is Ownable {
    constructor() Ownable(msg.sender) {}
    uint public constant DEPOSIT_AMOUNT = 1 ether;
    uint public constant VOTING_PERIOD = 1 days;
    
    uint public disputeCounter;

    // Outcome values: 0 = Undecided, 1 = RespondentWins, 2 = ChallengerWins.
    enum DisputeOutcome { Undecided, RespondentWins, ChallengerWins }
    
    struct Dispute {
        uint disputeId;
        uint ratingId;         // external identifier for the rating (optional)
        address challenger;    // actor B who initiates the dispute
        address respondent;    // actor A who is being challenged
        uint depositChallenger;
        uint depositRespondent;
        uint votingDeadline;
        bool depositsComplete;
        DisputeOutcome outcome;
        uint votesForRespondent;
        uint votesForChallenger;
        address[] voters;      // list of addresses that voted
        bool finalized;
        bool exists;           // flag to indicate that the dispute exists
    }
    
    // Mapping from dispute id to dispute details.
    mapping(uint => Dispute) public disputes;
    // Track whether a given address has voted on a dispute.
    mapping(uint => mapping(address => bool)) public hasVoted;
    // Record the vote choice for each voter in a dispute:
    // true = vote for respondent, false = vote for challenger.
    mapping(uint => mapping(address => bool)) public disputeVoteChoice;
    
    event DisputeInitiated(uint disputeId, uint ratingId, address indexed challenger, address indexed respondent);
    event RespondedToDispute(uint disputeId, address indexed respondent);
    event VoteCast(uint disputeId, address indexed voter, bool supportRespondent);
    event DisputeFinalized(uint disputeId, DisputeOutcome outcome);

    /**
     * @notice Initiates a dispute.
     * @param _ratingId An identifier for the rating under dispute.
     * @param _respondent The address of the party being challenged.
     * @return disputeId The unique dispute identifier.
     *
     * Requirements:
     * - The challenger must send exactly DEPOSIT_AMOUNT.
     */
    function initiateDispute(uint _ratingId, address _respondent) external payable returns (uint) {
        require(msg.value == DEPOSIT_AMOUNT, "Challenger deposit must be equal to DEPOSIT_AMOUNT");
        require(_respondent != address(0), "Invalid respondent address");

        disputeCounter++;
        uint disputeId = disputeCounter;
        Dispute storage disp = disputes[disputeId];
        disp.disputeId = disputeId;
        disp.ratingId = _ratingId;
        disp.challenger = msg.sender;
        disp.respondent = _respondent;
        disp.depositChallenger = msg.value;
        disp.votingDeadline = block.timestamp + VOTING_PERIOD;
        disp.outcome = DisputeOutcome.Undecided;
        disp.depositsComplete = false;
        disp.finalized = false;
        disp.exists = true;
        
        emit DisputeInitiated(disputeId, _ratingId, msg.sender, _respondent);
        return disputeId;
    }
    
    /**
     * @notice The respondent must respond by depositing funds.
     * @param _disputeId The dispute identifier.
     *
     * Requirements:
     * - Only the respondent may call.
     * - Must send exactly DEPOSIT_AMOUNT.
     */
    function respondToDispute(uint _disputeId) external payable {
        require(disputes[_disputeId].exists, "Dispute does not exist");
        require(msg.sender == disputes[_disputeId].respondent, "Only respondent can respond");
        require(!disputes[_disputeId].depositsComplete, "Deposits already complete");
        require(msg.value == DEPOSIT_AMOUNT, "Respondent deposit must equal DEPOSIT_AMOUNT");

        disputes[_disputeId].depositRespondent = msg.value;
        disputes[_disputeId].depositsComplete = true;
        emit RespondedToDispute(_disputeId, msg.sender);
    }
    
    /**
     * @notice Allows a voter to cast a vote on the dispute.
     * @param _disputeId The dispute identifier.
     * @param supportRespondent True if voting in favor of the respondent, false otherwise.
     *
     * Requirements:
     * - Deposits must be complete.
     * - Voting must occur before the voting deadline.
     * - Each voter may vote only once per dispute.
     */
    function voteDispute(uint _disputeId, bool supportRespondent) external {
        require(disputes[_disputeId].exists, "Dispute does not exist");
        require(disputes[_disputeId].depositsComplete, "Deposits not complete yet");
        require(block.timestamp <= disputes[_disputeId].votingDeadline, "Voting period has ended");
        require(!hasVoted[_disputeId][msg.sender], "Voter has already voted");

        hasVoted[_disputeId][msg.sender] = true;
        disputeVoteChoice[_disputeId][msg.sender] = supportRespondent;
        disputes[_disputeId].voters.push(msg.sender);
        if (supportRespondent) {
            disputes[_disputeId].votesForRespondent++;
        } else {
            disputes[_disputeId].votesForChallenger++;
        }
        emit VoteCast(_disputeId, msg.sender, supportRespondent);
    }
    
    /**
     * @notice Finalizes the dispute after the voting period, tallying votes and distributing funds.
     * Redistribution logic:
     * - If votesForRespondent >= votesForChallenger, the respondent wins:
     *     * Respondent receives: depositRespondent + (depositChallenger / 2)
     *     * The remaining half of challenger's deposit is distributed equally among voters who voted for the respondent.
     * - If votesForChallenger > votesForRespondent, the challenger wins:
     *     * Challenger receives: depositChallenger + (depositRespondent / 2)
     *     * The remaining half of respondent's deposit is distributed equally among voters who voted for the challenger.
     *
     * Requirements:
     * - The voting period must be over.
     * - The dispute must not have been finalized already.
     */
    function finalizeDispute(uint _disputeId) external {
        require(disputes[_disputeId].exists, "Dispute does not exist");
        require(disputes[_disputeId].depositsComplete, "Deposits not complete");
        require(block.timestamp > disputes[_disputeId].votingDeadline, "Voting period not over");
        require(!disputes[_disputeId].finalized, "Dispute already finalized");

        if (disputes[_disputeId].votesForRespondent >= disputes[_disputeId].votesForChallenger) {
            disputes[_disputeId].outcome = DisputeOutcome.RespondentWins;
        } else {
            disputes[_disputeId].outcome = DisputeOutcome.ChallengerWins;
        }
        disputes[_disputeId].finalized = true;
        emit DisputeFinalized(_disputeId, disputes[_disputeId].outcome);
        
        if (disputes[_disputeId].outcome == DisputeOutcome.RespondentWins) {
            _finalizeRespondentWins(_disputeId);
        } else {
            _finalizeChallengerWins(_disputeId);
        }
    }
    
    /**
     * @dev Internal helper to finalize dispute when respondent wins.
     */
    function _finalizeRespondentWins(uint _disputeId) internal {
        uint amountForRespondent = disputes[_disputeId].depositRespondent + (disputes[_disputeId].depositChallenger / 2);
        uint rewardPool = disputes[_disputeId].depositChallenger / 2;
        uint voterCount = 0;
        uint len = disputes[_disputeId].voters.length;
        for (uint i = 0; i < len; i++) {
            if (disputeVoteChoice[_disputeId][disputes[_disputeId].voters[i]]) {
                voterCount++;
            }
        }
        uint rewardPerVoter = voterCount > 0 ? rewardPool / voterCount : 0;
        (bool success, ) = disputes[_disputeId].respondent.call{value: amountForRespondent}("");
        require(success, "Transfer to respondent failed");
        for (uint i = 0; i < len; i++) {
            if (disputeVoteChoice[_disputeId][disputes[_disputeId].voters[i]]) {
                (bool sent, ) = disputes[_disputeId].voters[i].call{value: rewardPerVoter}("");
                require(sent, "Reward transfer to voter failed");
            }
        }
    }
    
    /**
     * @dev Internal helper to finalize dispute when challenger wins.
     */
    function _finalizeChallengerWins(uint _disputeId) internal {
        uint amountForChallenger = disputes[_disputeId].depositChallenger + (disputes[_disputeId].depositRespondent / 2);
        uint rewardPool = disputes[_disputeId].depositRespondent / 2;
        uint voterCount = 0;
        uint len = disputes[_disputeId].voters.length;
        for (uint i = 0; i < len; i++) {
            if (!disputeVoteChoice[_disputeId][disputes[_disputeId].voters[i]]) {
                voterCount++;
            }
        }
        uint rewardPerVoter = voterCount > 0 ? rewardPool / voterCount : 0;
        (bool success, ) = disputes[_disputeId].challenger.call{value: amountForChallenger}("");
        require(success, "Transfer to challenger failed");
        for (uint i = 0; i < len; i++) {
            if (!disputeVoteChoice[_disputeId][disputes[_disputeId].voters[i]]) {
                (bool sent, ) = disputes[_disputeId].voters[i].call{value: rewardPerVoter}("");
                require(sent, "Reward transfer to voter failed");
            }
        }
    }
    
    /**
     * @notice Returns the dispute details.
     */
    function getDisputeDetails(uint _disputeId) external view returns (
        uint disputeId,
        uint ratingId,
        address challenger,
        address respondent,
        uint depositChallenger,
        uint depositRespondent,
        uint votingDeadline,
        bool depositsComplete,
        DisputeOutcome outcome,
        uint votesForRespondent,
        uint votesForChallenger,
        address[] memory voters,
        bool finalized
    ) {
        require(disputes[_disputeId].exists, "Dispute does not exist");
        Dispute storage disp = disputes[_disputeId];
        return (
            disp.disputeId,
            disp.ratingId,
            disp.challenger,
            disp.respondent,
            disp.depositChallenger,
            disp.depositRespondent,
            disp.votingDeadline,
            disp.depositsComplete,
            disp.outcome,
            disp.votesForRespondent,
            disp.votesForChallenger,
            disp.voters,
            disp.finalized
        );
    }
    
    // Allow the contract to receive ETH.
    receive() external payable {}
}
