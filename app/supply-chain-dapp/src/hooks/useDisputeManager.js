//// filepath: d:\OneDrive - CentraleSupelec\2A\Blockchain\PROJECT\Blockchain\app\supply-chain-dapp\src\hooks\useDisputeManager.js
// src/hooks/useDisputeManager.js
import { getContract } from "viem";
import { useWalletClient, usePublicClient } from "wagmi";
import {
  disputeManagerAddress,
  disputeManagerABI,
} from "../contracts/DisputeManager";

export function useDisputeManager() {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  async function initiateDispute(ratingId, scoreType, respondent, depositAmount) {
    if (!walletClient) throw new Error("No wallet connected");
    const txHash = await walletClient.writeContract({
      address: disputeManagerAddress,
      abi: disputeManagerABI,
      functionName: "initiateDispute",
      args: [ratingId, scoreType, respondent],
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
    return publicClient.readContract({
      address: disputeManagerAddress,
      abi: disputeManagerABI,
      functionName: "getDisputeDetails",
      args: [disputeId],
    });
  }

  async function recordPurchase(buyer, seller) {
    if (!walletClient) throw new Error("No wallet connected");
    const txHash = await walletClient.writeContract({
      address: disputeManagerAddress,
      abi: disputeManagerABI,
      functionName: "recordPurchase",
      args: [buyer, seller],
      account: walletClient.account,
    });
    return publicClient.waitForTransactionReceipt({ hash: txHash });
  }

  // Get eligible disputes for voting
  async function getEligibleDisputes(voterAddress) {
    if (!voterAddress) throw new Error("Voter address is required");
    
    return publicClient.readContract({
      address: disputeManagerAddress,
      abi: disputeManagerABI,
      functionName: "getEligibleDisputes",
      args: [voterAddress],
    });
  }

  // Get disputes where the user is the respondent (needs to respond)
  async function getRespondentDisputes(respondentAddress) {
    if (!respondentAddress) throw new Error("Respondent address is required");
    
    return publicClient.readContract({
      address: disputeManagerAddress,
      abi: disputeManagerABI,
      functionName: "getRespondentDisputes",
      args: [respondentAddress],
    });
  }

  // Get disputes initiated by a user
  async function getUserDisputes(challengerAddress) {
    if (!challengerAddress) throw new Error("Challenger address is required");
    
    return publicClient.readContract({
      address: disputeManagerAddress,
      abi: disputeManagerABI,
      functionName: "getUserDisputes",
      args: [challengerAddress],
    });
  }

  // Check if there's an active dispute for a rating and score type
  async function hasActiveDispute(ratingId, scoreType) {
    return publicClient.readContract({
      address: disputeManagerAddress,
      abi: disputeManagerABI,
      functionName: "hasActiveDispute",
      args: [ratingId, scoreType],
    });
  }

  return {
    initiateDispute,
    respondToDispute,
    voteDispute,
    finalizeDispute,
    getDisputeDetails,
    recordPurchase,
    getEligibleDisputes,
    getUserDisputes,
    getRespondentDisputes,
    hasActiveDispute
  };
}