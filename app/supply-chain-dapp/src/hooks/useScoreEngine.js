//// filepath: d:\OneDrive - CentraleSupelec\2A\Blockchain\PROJECT\Blockchain\app\supply-chain-dapp\src\hooks\useScoreEngine.js
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
   * Transaction: rate a stakeholder for a given score type.
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
   * Read: get the aggregated global score for a stakeholder for a specific score type.
   * @param {string} stakeholder - the address to query
   * @param {number} scoreType - the score type enum value
   * @returns {Promise<bigint>} The raw score (scaled by PRECISION, e.g. 1e18)
   */
  async function getGlobalScore(stakeholder, scoreType) {
    return publicClient.readContract({
      address: scoreEngineAddress,
      abi: scoreEngineABI,
      functionName: 'globalScoresByType',
      args: [stakeholder, scoreType],
    });
  }

  /**
   * Read: get an array of all Score records for a stakeholder (Score structs).
   * @param {string} stakeholder - the address to query
   * @returns {Promise<Array>} An array of Score structs
   */
  async function getScores(stakeholder) {
    return publicClient.readContract({
      address: scoreEngineAddress,
      abi: scoreEngineABI,
      functionName: 'getScores',
      args: [stakeholder],
    });
  }

  /**
   * Read: get an array of score IDs belonging to a stakeholder.
   * @param {string} stakeholder - the address to query
   * @returns {Promise<Array<number>>} An array of score record IDs
   */
  async function getStakeholderScoreIds(stakeholder) {
    return publicClient.readContract({
      address: scoreEngineAddress,
      abi: scoreEngineABI,
      functionName: 'getStakeholderScoreIds',
      args: [stakeholder],
    });
  }

  /**
   * Read: retrieve a specific ScoreRecord by its ID.
   * @param {number} scoreId - the ID of the score record
   * @returns {Promise<Object>} The ScoreRecord struct
   */
  async function getScoreById(scoreId) {
    return publicClient.readContract({
      address: scoreEngineAddress,
      abi: scoreEngineABI,
      functionName: 'getScoreById',
      args: [scoreId],
    });
  }
  /**
 * Read: get the confidence score for a stakeholder.
 * @param {string} stakeholder - the address to query
 * @returns {Promise<number>} The confidence score (0 to 100)
 */
async function getConfidenceScore(stakeholder) {
  return publicClient.readContract({
    address: scoreEngineAddress,
    abi: scoreEngineABI,
    functionName: 'getConfidenceScore',
    args: [stakeholder],
  });
}



  /**
   * Transaction: update confidence scores after a dispute.
   * (Typically requires special permissions, e.g., onlyOwner.)
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
   * Transaction: manually set a score for a stakeholder (for admin / seeding).
   * @param {string} stakeholder - stakeholder address
   * @param {number} scoreType - score enum value
   * @param {bigint} newScore - raw score (scaled by PRECISION)
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
   * Read: get the array of applicable score types for a stakeholder.
   * @param {string} stakeholder - address to query
   * @returns {Promise<Array<number>>} Score type IDs the contract deems "applicable"
   */
  async function getApplicableScoreTypes(stakeholder) {
    return publicClient.readContract({
      address: scoreEngineAddress,
      abi: scoreEngineABI,
      functionName: 'getApplicableScoreTypes',
      args: [stakeholder],
    });
  }

 // Expose all relevant ScoreEngine functions
return {
  rateStakeholder,
  getGlobalScore,
  getScores,
  getStakeholderScoreIds,
  getScoreById,
  updateConfidenceAfterDispute,
  setManualScore,
  getApplicableScoreTypes,
  getConfidenceScore, // Add the new function here
};
}