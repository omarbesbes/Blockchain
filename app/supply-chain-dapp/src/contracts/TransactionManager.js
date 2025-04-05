// src/contracts/StakeholderRegistry.js
import TransactionManagerArtifact from "../../../../artifacts/contracts/TransactionManager.sol/TransactionManager.json";

export const TransactionManagerAddress =
import.meta.env.VITE_TRANSACTION_MANAGER_ADDRESS || "0xFallbackAddress";
export const TransactionManagerABI = TransactionManagerArtifact.abi;
