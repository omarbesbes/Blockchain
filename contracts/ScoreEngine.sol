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
    uint256 public constant BASE_ALPHA = 1;
    // Precision constant for fixed-point arithmetic
    uint256 public constant PRECISION = 1e18;

    /**
     * @dev Enum of all possible score types.
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
        uint256 value;        // Using uint256 for fixed-point values
        address rater;
        uint256 timestamp;
    }

    // Mapping from stakeholderAddress to array of all scores received.
    mapping(address => Score[]) private stakeholderScores;

    // Global score per score type, tracked as an EMA.
    mapping(address => mapping(ScoreType => uint256)) public globalScoresByType;
    // Count of ratings for each stakeholder and score type.
    mapping(address => mapping(ScoreType => uint256)) private scoreCountsByType;

    // Confidence score for factories and retailers (0..100).
    mapping(address => uint256) public confidenceScores;

    // Score history with unique IDs.
    uint256 private scoreIdCounter;
    struct ScoreRecord {
        ScoreType scoreType;
        uint256 value;
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
        uint256 value,
        uint256 timestamp,
        uint256 scoreId
    );

    /**
     * @dev Constructor sets references to StakeholderRegistry and DisputeManager.
     */
    constructor (address _registryAddress, address _disputeManagerAddress) Ownable(msg.sender) {
        registry = StakeholderRegistry(_registryAddress);
        disputeManager = DisputeManager(payable(_disputeManagerAddress));
    }

    /**
     * @notice Rate a stakeholder with a specific score type and numeric value.
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

        uint256 newEMA;
        if (scoreCountsByType[_rated][_scoreType] == 0) {
            if (raterRole == StakeholderRegistry.Role.Factory || raterRole == StakeholderRegistry.Role.Retailer) {
                if (confidenceScores[msg.sender] == 0) {
                    confidenceScores[msg.sender] = 100;
                }
            }
            newEMA = uint256(_value) * PRECISION;
        } else {
            uint effectiveAlpha;
            if (raterRole == StakeholderRegistry.Role.Factory || raterRole == StakeholderRegistry.Role.Retailer) {
                if (confidenceScores[msg.sender] == 0) {
                    confidenceScores[msg.sender] = 100;
                }
                effectiveAlpha = (BASE_ALPHA * confidenceScores[msg.sender]) / 100;
            } else {
                effectiveAlpha = BASE_ALPHA;
            }
            newEMA = (effectiveAlpha * (uint256(_value) * PRECISION) + (100 - effectiveAlpha) * globalScoresByType[_rated][_scoreType]) / 100;
        }
        globalScoresByType[_rated][_scoreType] = newEMA;
        scoreCountsByType[_rated][_scoreType]++;

        Score memory newScore = Score({
            scoreType: _scoreType,
            value: newEMA,
            rater: msg.sender,
            timestamp: block.timestamp
        });
        stakeholderScores[_rated].push(newScore);

        scoreIdCounter++;
        uint256 newScoreId = scoreIdCounter;
        scoreHistory[newScoreId] = ScoreRecord({
            scoreType: _scoreType,
            value: newEMA,
            rater: msg.sender,
            timestamp: block.timestamp
        });
        stakeholderScoreIds[_rated].push(newScoreId);

        emit ScoreAssigned(msg.sender, _rated, _scoreType, newEMA, block.timestamp, newScoreId);
    }

    /**
     * @notice Updates the rater's confidence score after a dispute.
     */
    function updateConfidenceAfterDispute(
        DisputeManager.Dispute memory _dispute
    ) external onlyOwner {
        address rater = _dispute.respondent;
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
     * @notice Returns all scores received by a stakeholder.
     */
    function getScores(address _stakeholder)
        external
        view
        returns (Score[] memory)
    {
        return stakeholderScores[_stakeholder];
    }

    /**
     * @notice Returns score IDs for a stakeholder.
     */
    function getStakeholderScoreIds(address _stakeholder)
        external
        view
        returns (uint256[] memory)
    {
        return stakeholderScoreIds[_stakeholder];
    }

    /**
     * @notice Returns a ScoreRecord by its ID.
     */
    function getScoreById(uint256 _scoreId)
        external
        view
        returns (ScoreRecord memory)
    {
        return scoreHistory[_scoreId];
    }

    /**
     * @dev Checks if a given (raterRole, ratedRole, scoreType) combination is valid.
     */
    function canRate(
        StakeholderRegistry.Role raterRole,
        StakeholderRegistry.Role ratedRole,
        ScoreType scoreType
    ) internal pure returns (bool) {
        if (ratedRole == StakeholderRegistry.Role.Supplier && raterRole == StakeholderRegistry.Role.Factory) {
            return (
                scoreType == ScoreType.TRUST ||
                scoreType == ScoreType.DELIVERY_SPEED ||
                scoreType == ScoreType.MATERIAL_QUALITY
            );
        }
        if (ratedRole == StakeholderRegistry.Role.Factory && raterRole == StakeholderRegistry.Role.Consumer) {
            return (
                scoreType == ScoreType.PRODUCT_QUALITY ||
                scoreType == ScoreType.WARRANTY ||
                scoreType == ScoreType.ECO_RATING
            );
        }
        if (ratedRole == StakeholderRegistry.Role.Distributor && raterRole == StakeholderRegistry.Role.Retailer) {
            return (
                scoreType == ScoreType.PACKAGING ||
                scoreType == ScoreType.TRANSPARENCY ||
                scoreType == ScoreType.ACCURACY
            );
        }
        if (ratedRole == StakeholderRegistry.Role.Retailer && raterRole == StakeholderRegistry.Role.Consumer) {
            return (
                scoreType == ScoreType.DELIVERY ||
                scoreType == ScoreType.PRICE_FAIRNESS ||
                scoreType == ScoreType.RETURN_POLICY
            );
        }
        return false;
    }

    /**
     * @notice Sets a manual score for a stakeholder without any verification.
     *         This function is intended for administrative use (e.g., seeding the database).
     * @param _stakeholder The address of the stakeholder.
     * @param _scoreType The score type.
     * @param _newScore The new score value (should be scaled by PRECISION, e.g., 8 * PRECISION for a score of 8).
     */
    function setManualScore(
        address _stakeholder,
        ScoreType _scoreType,
        uint256 _newScore
    ) external {
        // Set the global score manually
        globalScoresByType[_stakeholder][_scoreType] = _newScore;
        // Reset the count for this score type (or set it to 1 to indicate manual update)
        scoreCountsByType[_stakeholder][_scoreType] = 1;

        // Record a manual score entry in the score history
        scoreIdCounter++;
        uint256 manualScoreId = scoreIdCounter;
        scoreHistory[manualScoreId] = ScoreRecord({
            scoreType: _scoreType,
            value: _newScore,
            rater: msg.sender,
            timestamp: block.timestamp
        });
        stakeholderScoreIds[_stakeholder].push(manualScoreId);

        emit ScoreAssigned(msg.sender, _stakeholder, _scoreType, _newScore, block.timestamp, manualScoreId);
    }


    /**
 * @dev Returns an array of applicable score type IDs for the given stakeholder address.
 * For example, if the stakeholder is a retailer (role = 4), it returns [10, 11, 12].
 * You can extend this function to support additional roles.
 * @param stakeholder The address of the stakeholder.
 * @return An array of score type IDs.
 */
function getApplicableScoreTypes(address stakeholder) public view returns (uint8[] memory) {
    uint256 role = uint256(registry.getRole(stakeholder));
    uint8[] memory scoreTypes;

    if (role == 1) {
    scoreTypes = new uint8[](3);
        scoreTypes[0] = 0;
        scoreTypes[1] = 1;
        scoreTypes[2] = 2;
    } else if (role == 2) {
        scoreTypes = new uint8[](3);
        scoreTypes[0] = 3;
        scoreTypes[1] = 4;
        scoreTypes[2] = 5;
    } else if (role == 3) {
        scoreTypes = new uint8[](3);
        scoreTypes[0] = 6;
        scoreTypes[1] = 7;
        scoreTypes[2] = 8;
    } else if (role == 4) {
        scoreTypes = new uint8[](3);
        scoreTypes[0] = 9;
        scoreTypes[1] = 10;
        scoreTypes[2] = 11;
    } 
    return scoreTypes;

}
/**
 * @notice Returns an array of global scores for the given stakeholder based on the applicable score types.
 * @param stakeholder The address of the stakeholder.
 * @return An array of global score values.
 */
function getStakeholderGlobalScores(address stakeholder) external view returns (uint256[] memory) {
    // Retrieve the applicable score types for the stakeholder.
    uint8[] memory types = getApplicableScoreTypes(stakeholder);
    // Create an array to hold the global scores for these score types.
    uint256[] memory scores = new uint256[](types.length);
    
    // Loop over the applicable score types.
    for (uint256 i = 0; i < types.length; i++) {
        // Convert the uint8 score type to the ScoreType enum and retrieve the global score.
        scores[i] = globalScoresByType[stakeholder][ScoreType(types[i])];
    }
    
    return scores;
}

}








