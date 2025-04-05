// src/contracts/DisputeManager.js
import DisputeManagerArtifact from "../../../../artifacts/contracts/DisputeManager.sol/DisputeManager.json";

export const disputeManagerAddress =
import.meta.env.VITE_DISPUTE_MANAGER_ADDRESS || "0xFallbackAddress";

export const disputeManagerABI = DisputeManagerArtifact.abi;
