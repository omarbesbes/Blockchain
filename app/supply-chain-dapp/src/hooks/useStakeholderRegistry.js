// src/hooks/useStakeholderRegistry.js
import { getContract } from "viem";
import { useWalletClient, usePublicClient } from "wagmi";
import {
  stakeholderRegistryAddress,
  stakeholderRegistryABI,
} from "../contracts/StakeholderRegistry";

export function useStakeholderRegistry() {
  // For writes (transactions):
  const { data: walletClient } = useWalletClient();

  // For reads (pure/view calls):
  const publicClient = usePublicClient();

  // 1. Register stakeholder (transaction)
  async function registerStakeholder(role, metadataURI) {
    if (!walletClient) throw new Error("No wallet connected");

    const registry = getContract({
      address: stakeholderRegistryAddress,
      abi: stakeholderRegistryABI,
      walletClient, // needed for write ops
    });

    const txHash = await registry.write.registerStakeholder([role, metadataURI]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    return receipt;
  }

  // 2. Update metadata (transaction)
  async function updateMetadata(newMetadata) {
    if (!walletClient) throw new Error("No wallet connected");

    const registry = getContract({
      address: stakeholderRegistryAddress,
      abi: stakeholderRegistryABI,
      walletClient,
    });

    const txHash = await registry.write.updateMetadata([newMetadata]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    return receipt;
  }

  // 3. Check if user is registered (read-only)
  async function isRegistered(address) {
    return await publicClient.readContract({
      address: stakeholderRegistryAddress,
      abi: stakeholderRegistryABI,
      functionName: "isRegistered",
      args: [address],
    });
  }

  // 4. Get Stakeholder Type (read-only)
  async function getStakeholderType(address) {
    return await publicClient.readContract({
      address: stakeholderRegistryAddress,
      abi: stakeholderRegistryABI,
      functionName: "getStakeholderType",
      args: [address],
    });
  }

  // 5. Get all stakeholders (read-only)
  async function getAllStakeholders() {
    return await publicClient.readContract({
      address: stakeholderRegistryAddress,
      abi: stakeholderRegistryABI,
      functionName: "getAllStakeholders",
      args: [],
    });
  }

  return {
    registerStakeholder,
    updateMetadata,
    isRegistered,
    getStakeholderType,
    getAllStakeholders,
  };
}
