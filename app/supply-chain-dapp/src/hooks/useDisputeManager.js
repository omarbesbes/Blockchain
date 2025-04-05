// src/hooks/useDisputeManager.js
import { getContract } from "viem";
import { useWalletClient, usePublicClient } from "wagmi";
import {
  disputeManagerAddress,
  disputeManagerABI,
} from "../contracts/DisputeManager";

export function useDisputeManager() {
  // For writes (transactions)
  const { data: walletClient } = useWalletClient();
  // For reads (view/pure calls)
  const publicClient = usePublicClient();

  // Write functions now all use walletClient.writeContract

  async function initiateDispute(ratingId, respondent, depositAmount) {
    if (!walletClient) throw new Error("No wallet connected");
    const txHash = await walletClient.writeContract({
      address: disputeManagerAddress,
      abi: disputeManagerABI,
      functionName: "initiateDispute",
      args: [ratingId, respondent],
      value: depositAmount,
      account: walletClient.account,
    });
    return publicClient.waitForTransactionReceipt({ hash: txHash });
  }

  async function respondToDispute(disputeId, depositAmount) {
    if (!walletClient) throw new Error("No wallet connected");
    const txHash = await walletClient.writeContract({
      address: disputeManagerAddress,
      abi: disputeManagerABI,
      functionName: "respondToDispute",
      args: [disputeId],
      value: depositAmount,
      account: walletClient.account,
    });
    return publicClient.waitForTransactionReceipt({ hash: txHash });
  }

  async function voteDispute(disputeId, voteForRespondent) {
    if (!walletClient) throw new Error("No wallet connected");
    const txHash = await walletClient.writeContract({
      address: disputeManagerAddress,
      abi: disputeManagerABI,
      functionName: "voteDispute",
      args: [disputeId, voteForRespondent],
      account: walletClient.account,
    });
    return publicClient.waitForTransactionReceipt({ hash: txHash });
  }

  // New functions for Challenges

  // 1. Get all scores where the given address has been scored.
  async function getScoresAgainstYou(userAddress) {
    return await publicClient.readContract({
      address: disputeManagerAddress,
      abi: disputeManagerABI,
      functionName: "getScoresAgainstYou",
      args: [userAddress],
    });
  }

  // 2. Challenge a score by initiating a dispute. Deposit amount must be provided.
  async function challengeScore(scoreId, scorer, depositAmount) {
    if (!walletClient) throw new Error("No wallet connected");
    // Assuming we use the same initiateDispute function for challenges,
    // where scoreId is used as ratingId and scorer is the respondent.
    const txHash = await walletClient.writeContract({
      address: disputeManagerAddress,
      abi: disputeManagerABI,
      functionName: "initiateDispute",
      args: [scoreId, scorer],
      value: depositAmount,
      account: walletClient.account,
    });
    return publicClient.waitForTransactionReceipt({ hash: txHash });
  }

  // 3. Get ongoing challenges relevant to the user.
  async function getOngoingChallenges(userAddress) {
    return await publicClient.readContract({
      address: disputeManagerAddress,
      abi: disputeManagerABI,
      functionName: "getOngoingChallenges",
      args: [userAddress],
    });
  }

  // 4. Acknowledge a challenge (vote in favor of the challenged score).
  async function acknowledgeChallenge(challengeId) {
    if (!walletClient) throw new Error("No wallet connected");
    const txHash = await walletClient.writeContract({
      address: disputeManagerAddress,
      abi: disputeManagerABI,
      functionName: "acknowledgeChallenge",
      args: [challengeId],
      account: walletClient.account,
    });
    return publicClient.waitForTransactionReceipt({ hash: txHash });
  }

  // 5. Deny a challenge (vote against the challenged score).
  async function denyChallenge(challengeId) {
    if (!walletClient) throw new Error("No wallet connected");
    const txHash = await walletClient.writeContract({
      address: disputeManagerAddress,
      abi: disputeManagerABI,
      functionName: "denyChallenge",
      args: [challengeId],
      account: walletClient.account,
    });
    return publicClient.waitForTransactionReceipt({ hash: txHash });
  }

  return {
    initiateDispute,
    respondToDispute,
    voteDispute,
    getScoresAgainstYou,
    challengeScore,
    getOngoingChallenges,
    acknowledgeChallenge,
    denyChallenge,
  };
}
