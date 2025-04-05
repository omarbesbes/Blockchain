// src/hooks/useScoreEngine.js
import { getContract } from 'viem';
import { useWalletClient, usePublicClient } from 'wagmi';
import { scoreEngineAddress, scoreEngineABI } from '../contracts/ScoreEngine';

export function useScoreEngine() {
  // For sending transactions (writes)
  const { data: walletClient } = useWalletClient();
  // For read (view/pure) calls
  const publicClient = usePublicClient();

  // Create a contract instance for both read and write calls
  const scoreEngine = getContract({
    address: scoreEngineAddress,
    abi: scoreEngineABI,
    walletClient,  // for write functions
    publicClient,  // for read functions
  });

  /**
   * Rate a stakeholder (transaction)
   * @param {string} rated - the address being rated
   * @param {number} scoreType - the score type enum value (e.g., 0 for TRUST)
   * @param {number} value - the rating value (e.g., 1 to 10)
   */
  async function rateStakeholder(rated, scoreType, value) {
    if (!walletClient) throw new Error('No wallet connected');
    const txHash = await walletClient.writeContract({
      address: scoreEngineAddress,
      abi: scoreEngineABI,
      functionName: 'rateStakeholder',
      args: [rated, scoreType, value],
      account: walletClient.account, // ensure the sender is set
    });
    return publicClient.waitForTransactionReceipt({ hash: txHash });
  }

  /**
   * Get the global score for a stakeholder for a specific score type.
   * @param {string} stakeholder - the address to query
   * @param {number} scoreType - the score type enum value
   * @returns {Promise<bigint>} The score (scaled by PRECISION)
   */
  async function getGlobalScore(stakeholder, scoreType) {
    const score = await publicClient.readContract({
      address: scoreEngineAddress,
      abi: scoreEngineABI,
      functionName: 'globalScoresByType',
      args: [stakeholder, scoreType],
    });
    return score;
  }

  /**
   * Get all scores for a stakeholder.
   * @param {string} stakeholder - the address to query
   * @returns {Promise<Array>} An array of Score structs
   */
  async function getScores(stakeholder) {
    const scores = await publicClient.readContract({
      address: scoreEngineAddress,
      abi: scoreEngineABI,
      functionName: 'getScores',
      args: [stakeholder],
    });
    return scores;
  }

  /**
   * Get all score IDs for a stakeholder.
   * @param {string} stakeholder - the address to query
   * @returns {Promise<Array>} An array of score IDs (uint256[])
   */
  async function getStakeholderScoreIds(stakeholder) {
    const scoreIds = await publicClient.readContract({
      address: scoreEngineAddress,
      abi: scoreEngineABI,
      functionName: 'getStakeholderScoreIds',
      args: [stakeholder],
    });
    return scoreIds;
  }

  /**
   * Get a ScoreRecord by its ID.
   * @param {number|string} scoreId - the ID of the score record
   * @returns {Promise<Object>} The ScoreRecord struct
   */
  async function getScoreById(scoreId) {
    const scoreRecord = await publicClient.readContract({
      address: scoreEngineAddress,
      abi: scoreEngineABI,
      functionName: 'getScoreById',
      args: [scoreId],
    });
    return scoreRecord;
  }

  /**
   * Update the confidence score after a dispute (transaction).
   * Note: This function is intended for administrative use (onlyOwner).
   * @param {Object} dispute - The dispute struct as expected by the contract
   */
  async function updateConfidenceAfterDispute(dispute) {
    if (!walletClient) throw new Error('No wallet connected');
    const txHash = await walletClient.writeContract({
      address: scoreEngineAddress,
      abi: scoreEngineABI,
      functionName: 'updateConfidenceAfterDispute',
      args: [dispute],
      account: walletClient.account,
    });
    return publicClient.waitForTransactionReceipt({ hash: txHash });
  }

  /**
   * Set a manual score for a stakeholder (transaction).
   * This function is intended for administrative use (e.g., seeding data).
   * @param {string} stakeholder - the address of the stakeholder
   * @param {number} scoreType - the score type enum value
   * @param {bigint} newScore - the new score (should be scaled by PRECISION)
   */
  async function setManualScore(stakeholder, scoreType, newScore) {
    if (!walletClient) throw new Error('No wallet connected');
    const txHash = await walletClient.writeContract({
      address: scoreEngineAddress,
      abi: scoreEngineABI,
      functionName: 'setManualScore',
      args: [stakeholder, scoreType, newScore],
      account: walletClient.account,
    });
    return publicClient.waitForTransactionReceipt({ hash: txHash });
  }
  /**
   * Get applicable score types for a given stakeholder.
   * Calls the contract function getApplicableScoreTypes.
   * @param {string} stakeholder - the address to query.
   * @returns {Promise<Array<number>>} An array of applicable score types.
   */
  async function getApplicableScoreTypes(stakeholder) {
    const types = await publicClient.readContract({
      address: scoreEngineAddress,
      abi: scoreEngineABI,
      functionName: 'getApplicableScoreTypes',
      args: [stakeholder],
    });
    return types;
  }

  return {
    rateStakeholder,
    getGlobalScore,
    getScores,
    getStakeholderScoreIds,
    getScoreById,
    updateConfidenceAfterDispute,
    setManualScore,
    getApplicableScoreTypes
  };
}
