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

  async function finalizeDispute(disputeId) {
    if (!walletClient) throw new Error("No wallet connected");
    const txHash = await walletClient.writeContract({
      address: disputeManagerAddress,
      abi: disputeManagerABI,
      functionName: "finalizeDispute",
      args: [disputeId],
      account: walletClient.account,
    });
    return publicClient.waitForTransactionReceipt({ hash: txHash });
  }

  async function getDisputeDetails(disputeId) {
    return await publicClient.readContract({
      address: disputeManagerAddress,
      abi: disputeManagerABI,
      functionName: "getDisputeDetails",
      args: [disputeId],
    });
  }

  return {
    initiateDispute,
    respondToDispute,
    voteDispute,
    finalizeDispute,
    getDisputeDetails,
  };
}
