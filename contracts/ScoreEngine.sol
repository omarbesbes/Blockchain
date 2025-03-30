// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./StakeholderRegistry.sol";

/**
 * @title ScoreEngine
 * @dev This contract enforces who can rate whom and which score types are valid,
 *      based on the roles in the StakeholderRegistry. It now also maintains a global history
 *      of scores using unique score IDs.
 */
contract ScoreEngine is Ownable {
    // Reference to your StakeholderRegistry
    StakeholderRegistry private registry;

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

    // Mapping: stakeholderAddress => array of all scores received
    mapping(address => Score[]) private stakeholderScores;

    // Global score calculation variables
    mapping(address => uint256) public globalScores;
    mapping(address => uint256) private scoreSums;
    mapping(address => uint256) private scoreCounts;

    // Mapping for score histories: score ID => Score struct
    mapping(uint256 => Score) private scoreHistory;
    // Mapping: stakeholderAddress => array of score IDs received
    mapping(address => uint256[]) private stakeholderScoreIds;
    // Counter for generating unique score IDs
    uint256 private scoreIdCounter;

    // Event emitted whenever a new score is assigned
    event ScoreAssigned(
        address indexed rater,
        address indexed rated,
        ScoreType scoreType,
        uint8 value,
        uint256 timestamp,
        uint256 scoreId
    );

    /**
     * @dev The constructor expects the address of the deployed StakeholderRegistry.
     */
    constructor (address _registryAddress) Ownable(msg.sender) {
        registry = StakeholderRegistry(_registryAddress);
    }

    /**
     * @notice Rate a stakeholder with a specific score type and numeric value.
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

        // Identify the roles of rater and rated from the registry
        StakeholderRegistry.Role raterRole = registry.getRole(msg.sender);
        StakeholderRegistry.Role ratedRole = registry.getRole(_rated);

        // Enforce that both parties are valid (not None)
        require(raterRole != StakeholderRegistry.Role.None, "Rater not valid");
        require(ratedRole != StakeholderRegistry.Role.None, "Rated not valid");

        // Check if the (raterRole, ratedRole, scoreType) combination is allowed
        require(
            canRate(raterRole, ratedRole, _scoreType),
            "Invalid role or score type for this rating"
        );

        // Create the new score
        Score memory newScore = Score({
            scoreType: _scoreType,
            value: _value,
            rater: msg.sender,
            timestamp: block.timestamp
        });

        // Record the score in the stakeholder's score array
        stakeholderScores[_rated].push(newScore);

        // Update global score calculation
        scoreSums[_rated] += _value;
        scoreCounts[_rated] += 1;
        globalScores[_rated] = scoreSums[_rated] / scoreCounts[_rated];

        // Update the score history mapping using a unique score ID
        scoreIdCounter++;
        uint256 newScoreId = scoreIdCounter;
        scoreHistory[newScoreId] = newScore;
        stakeholderScoreIds[_rated].push(newScoreId);

        emit ScoreAssigned(msg.sender, _rated, _scoreType, _value, block.timestamp, newScoreId);
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
     * @notice Returns the Score struct associated with a given score ID.
     * @param _scoreId The ID of the score to retrieve.
     * @return The Score struct.
     */
    function getScoreById(uint256 _scoreId) external view returns (Score memory) {
        return scoreHistory[_scoreId];
    }

    /**
     * @notice Returns the array of score IDs associated with a stakeholder.
     * @param _stakeholder The address of the stakeholder.
     * @return An array of score IDs.
     */
    function getStakeholderScoreIds(address _stakeholder) external view returns (uint256[] memory) {
        return stakeholderScoreIds[_stakeholder];
    }

    /**
     * @notice Finds and returns a score ID by matching rater, rated, and score type.
     * @param _rater The address of the rater.
     * @param _rated The address of the rated stakeholder.
     * @param _scoreType The score type.
     * @return The score ID of the first matching score.
     */
    function findScoreId(
        address _rater,
        address _rated,
        ScoreType _scoreType
    ) external view returns (uint256) {
        uint256[] memory ids = stakeholderScoreIds[_rated];
        for (uint256 i = 0; i < ids.length; i++) {
            uint256 id = ids[i];
            Score memory score = scoreHistory[id];
            if (score.rater == _rater && score.scoreType == _scoreType) {
                return id;
            }
        }
        revert("Score not found");
    }

    /**
     * @dev Internal function to check if a given (raterRole, ratedRole, scoreType) combination is valid.
     *      Adjust this logic if you rename roles or want different constraints.
     */
    function canRate(
        StakeholderRegistry.Role raterRole,
        StakeholderRegistry.Role ratedRole,
        ScoreType scoreType
    ) internal pure returns (bool) {
        /**
         * Supplier (scored by Factory) => TRUST, DELIVERY_SPEED, MATERIAL_QUALITY
         */
        if (ratedRole == StakeholderRegistry.Role.Supplier && raterRole == StakeholderRegistry.Role.Factory) {
            return (
                scoreType == ScoreType.TRUST ||
                scoreType == ScoreType.DELIVERY_SPEED ||
                scoreType == ScoreType.MATERIAL_QUALITY
            );
        }

        /**
         * Factory (scored by Consumer) => PRODUCT_QUALITY, WARRANTY, ECO_RATING
         */
        if (ratedRole == StakeholderRegistry.Role.Factory && raterRole == StakeholderRegistry.Role.Consumer) {
            return (
                scoreType == ScoreType.PRODUCT_QUALITY ||
                scoreType == ScoreType.WARRANTY ||
                scoreType == ScoreType.ECO_RATING
            );
        }

        /**
         * Retailer (scored by Distributor) => PACKAGING, TRANSPARENCY, ACCURACY
         */
        if (ratedRole == StakeholderRegistry.Role.Distributor && raterRole == StakeholderRegistry.Role.Retailer) {
            return (
                scoreType == ScoreType.PACKAGING ||
                scoreType == ScoreType.TRANSPARENCY ||
                scoreType == ScoreType.ACCURACY
            );
        }

        /**
         * Distributor (scored by Consumer) => DELIVERY, PRICE_FAIRNESS, RETURN_POLICY
         */
        if (ratedRole == StakeholderRegistry.Role.Retailer && raterRole == StakeholderRegistry.Role.Consumer) {
            return (
                scoreType == ScoreType.DELIVERY ||
                scoreType == ScoreType.PRICE_FAIRNESS ||
                scoreType == ScoreType.RETURN_POLICY
            );
        }

        // If none of the above conditions are met, it's not allowed
        return false;
    }
}
