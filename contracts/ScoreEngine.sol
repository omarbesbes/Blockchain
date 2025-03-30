// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./StakeholderRegistry.sol";
import "./DisputeManager.sol";

/**
 * @title ScoreEngine
 * @dev This contract enforces who can rate whom and which score types are valid,
 *      based on the roles in the StakeholderRegistry.
 *      It now also tracks a "confidence score" for factories and retailers.
 *      The global score for each score type is updated using an exponential moving average (EMA)
 *      where the smoothing factor (alpha) is modified by the rater's confidence score.
 */
contract ScoreEngine is Ownable {
    // Reference to your StakeholderRegistry
    StakeholderRegistry private registry;

    // Reference to the DisputeManager (if needed)
    DisputeManager private disputeManager;

    // Constant base alpha, expressed as an integer percentage (e.g., 10 means 10%)
    uint256 public constant BASE_ALPHA = 10;

    /**
     * @dev Enum of all possible score types, consolidated from your table:
     *
     *  - Supplier (scored by Factory): TRUST, DELIVERY_SPEED, MATERIAL_QUALITY
     *  - Factory (scored by Consumer): PRODUCT_QUALITY, WARRANTY, ECO_RATING
     *  - Retailer (scored by Distributor): PACKAGING, TRANSPARENCY, ACCURACY
     *  - Distributor (scored by Consumer): DELIVERY, PRICE_FAIRNESS, RETURN_POLICY
     */
    enum ScoreType {
        TRUST,              // 0
        DELIVERY_SPEED,     // 1
        MATERIAL_QUALITY,   // 2

        PRODUCT_QUALITY,    // 3
        WARRANTY,           // 4
        ECO_RATING,         // 5

        PACKAGING,          // 6
        TRANSPARENCY,       // 7
        ACCURACY,           // 8

        DELIVERY,           // 9
        PRICE_FAIRNESS,     // 10
        RETURN_POLICY       // 11
    }

    /**
     * @dev Structure to hold an individual rating record.
     */
    struct Score {
        ScoreType scoreType;
        uint8 value;        // e.g., 1 to 10
        address rater;
        uint256 timestamp;
    }

    // Mapping: stakeholderAddress => array of all scores received.
    mapping(address => Score[]) private stakeholderScores;

    // Instead of a single global score, we track an EMA per score type.
    // globalScoresByType[stakeholder][scoreType] holds the EMA for that score type.
    mapping(address => mapping(ScoreType => uint256)) public globalScoresByType;
    // Count how many ratings have been applied for a given stakeholder and score type.
    mapping(address => mapping(ScoreType => uint256)) private scoreCountsByType;

    // Confidence score for factories and retailers.
    // Stored as an integer in [0..100] where 100 means full confidence.
    mapping(address => uint256) public confidenceScores;

    // Score history with unique IDs.
    uint256 private scoreIdCounter;
    struct ScoreRecord {
        ScoreType scoreType;
        uint8 value;
        address rater;
        uint256 timestamp;
    }
    mapping(uint256 => ScoreRecord) private scoreHistory;
    mapping(address => uint256[]) private stakeholderScoreIds;

    // Event emitted whenever a new score is assigned.
    event ScoreAssigned(
        address indexed rater,
        address indexed rated,
        ScoreType scoreType,
        uint8 value,
        uint256 timestamp,
        uint256 scoreId
    );

    /**
     * @dev The constructor expects the addresses of the deployed StakeholderRegistry
     *      and DisputeManager.
     */
    constructor (address _registryAddress, address _disputeManagerAddress) Ownable(msg.sender) {
        registry = StakeholderRegistry(_registryAddress);
        disputeManager = DisputeManager(payable(_disputeManagerAddress));
    }

    /**
     * @notice Rate a stakeholder with a specific score type and numeric value.
     *         The global score for that score type is updated using an exponential moving average.
     *         For raters that are Factories or Retailers, the smoothing factor is modified by the rater's confidence.
     * @param _rated Address of the stakeholder being rated.
     * @param _scoreType The type of score (must be valid for the roles).
     * @param _value A numeric value for the score (e.g., 1 to 10).
     */
    function rateStakeholder(
    address _rated,
    ScoreType _scoreType,
    uint8 _value
) external {
    require(_value > 0 && _value <= 10, "Score value must be between 1 and 10");
    require(registry.isRegistered(_rated), "Rated stakeholder not registered");

    // Identify roles of rater and rated.
    StakeholderRegistry.Role raterRole = registry.getRole(msg.sender);
    StakeholderRegistry.Role ratedRole = registry.getRole(_rated);

    require(raterRole != StakeholderRegistry.Role.None, "Rater not valid");
    require(ratedRole != StakeholderRegistry.Role.None, "Rated not valid");
    require(
        canRate(raterRole, ratedRole, _scoreType),
        "Invalid role or score type for this rating"
    );

    // Compute the new exponential moving average (EMA) for this score type.
    uint256 newEMA;
    if (scoreCountsByType[_rated][_scoreType] == 0) {
        // First rating: set EMA to the raw value.
        newEMA = _value;
    } else {
        uint effectiveAlpha;
        // For Factories or Retailers, adjust the base alpha by the rater's confidence.
        if (raterRole == StakeholderRegistry.Role.Factory || raterRole == StakeholderRegistry.Role.Retailer) {
            if (confidenceScores[msg.sender] == 0) {
                confidenceScores[msg.sender] = 100;
            }
            effectiveAlpha = (BASE_ALPHA * confidenceScores[msg.sender]) / 100;
        } else {
            effectiveAlpha = BASE_ALPHA;
        }
        // newEMA = (effectiveAlpha * newValue + (100 - effectiveAlpha) * oldEMA) / 100.
        newEMA = (effectiveAlpha * _value + (100 - effectiveAlpha) * globalScoresByType[_rated][_scoreType]) / 100;
    }
    // Update the EMA and count for this score type.
    globalScoresByType[_rated][_scoreType] = newEMA;
    scoreCountsByType[_rated][_scoreType]++;

    // Instead of pushing the raw _value, create a new Score record using the computed newEMA.
    Score memory newScore = Score({
        scoreType: _scoreType,
        value: uint8(newEMA),  // newEMA is stored as the updated moving average.
        rater: msg.sender,
        timestamp: block.timestamp
    });
    stakeholderScores[_rated].push(newScore);

    // Also update the score history mapping.
    scoreIdCounter++;
    uint256 newScoreId = scoreIdCounter;
    scoreHistory[newScoreId] = ScoreRecord({
        scoreType: _scoreType,
        value: uint8(newEMA),
        rater: msg.sender,
        timestamp: block.timestamp
    });
    stakeholderScoreIds[_rated].push(newScoreId);

    emit ScoreAssigned(msg.sender, _rated, _scoreType, uint8(newEMA), block.timestamp, newScoreId);
}


    /**
     * @dev After a dispute is finalized, call this function to update the rater's
     *      confidence score using the formula from your image.
     *
     * @param _dispute The dispute struct from DisputeManager.
     *
     * Requirements:
     * - The rater must be a Factory or Retailer.
     */
    function updateConfidenceAfterDispute(
        DisputeManager.Dispute memory _dispute
    ) external onlyOwner {
   
        address rater = _dispute.respondent;
        // Check that the rater is a Factory or Retailer.
        StakeholderRegistry.Role role = registry.getRole(rater);
        require(
            role == StakeholderRegistry.Role.Factory || role == StakeholderRegistry.Role.Retailer,
            "Confidence score only applies to factories/retailers"
        );

        if (confidenceScores[rater] == 0) {
            confidenceScores[rater] = 100;
        }

        uint votesAgainst = _dispute.votesForChallenger;
        uint totalVotes = _dispute.votesForChallenger + _dispute.votesForRespondent;
        if (totalVotes == 0) {
            return;
        }

        uint x = (votesAgainst * 100) / totalVotes;
       
        uint penaltyFactor = 2 * (x - 50);
        uint maxPenalty = 20;
        uint actualPenalty = (penaltyFactor * maxPenalty) / 100;
        uint oldConfidence = confidenceScores[rater];
        uint newConfidence = (oldConfidence * (100 - actualPenalty)) / 100;

        confidenceScores[rater] = newConfidence;
    }

    /**
     * @dev Returns the array of all scores received by a particular stakeholder.
     * @param _stakeholder The address of the stakeholder to query.
     */
    function getScores(address _stakeholder)
        external
        view
        returns (Score[] memory)
    {
        return stakeholderScores[_stakeholder];
    }

    /**
     * @dev Returns the score IDs associated with a stakeholder.
     */
    function getStakeholderScoreIds(address _stakeholder)
        external
        view
        returns (uint256[] memory)
    {
        return stakeholderScoreIds[_stakeholder];
    }

    /**
     * @dev Returns the ScoreRecord by ID.
     */
    function getScoreById(uint256 _scoreId)
        external
        view
        returns (ScoreRecord memory)
    {
        return scoreHistory[_scoreId];
    }

    /**
     * @dev Internal function to check if a given (raterRole, ratedRole, scoreType) combination is valid.
     */
    function canRate(
        StakeholderRegistry.Role raterRole,
        StakeholderRegistry.Role ratedRole,
        ScoreType scoreType
    ) internal pure returns (bool) {
        // Supplier (scored by Factory) => TRUST, DELIVERY_SPEED, MATERIAL_QUALITY.
        if (ratedRole == StakeholderRegistry.Role.Supplier && raterRole == StakeholderRegistry.Role.Factory) {
            return (
                scoreType == ScoreType.TRUST ||
                scoreType == ScoreType.DELIVERY_SPEED ||
                scoreType == ScoreType.MATERIAL_QUALITY
            );
        }
        // Factory (scored by Consumer) => PRODUCT_QUALITY, WARRANTY, ECO_RATING.
        if (ratedRole == StakeholderRegistry.Role.Factory && raterRole == StakeholderRegistry.Role.Consumer) {
            return (
                scoreType == ScoreType.PRODUCT_QUALITY ||
                scoreType == ScoreType.WARRANTY ||
                scoreType == ScoreType.ECO_RATING
            );
        }
        // Retailer (scored by Distributor) => PACKAGING, TRANSPARENCY, ACCURACY.
        if (ratedRole == StakeholderRegistry.Role.Distributor && raterRole == StakeholderRegistry.Role.Retailer) {
            return (
                scoreType == ScoreType.PACKAGING ||
                scoreType == ScoreType.TRANSPARENCY ||
                scoreType == ScoreType.ACCURACY
            );
        }
        // Distributor (scored by Consumer) => DELIVERY, PRICE_FAIRNESS, RETURN_POLICY.
        if (ratedRole == StakeholderRegistry.Role.Retailer && raterRole == StakeholderRegistry.Role.Consumer) {
            return (
                scoreType == ScoreType.DELIVERY ||
                scoreType == ScoreType.PRICE_FAIRNESS ||
                scoreType == ScoreType.RETURN_POLICY
            );
        }
        return false;
    }
}
