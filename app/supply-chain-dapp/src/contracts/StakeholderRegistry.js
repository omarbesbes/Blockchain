// src/contracts/StakeholderRegistry.js
import StakeholderRegistryArtifact from "../../../../artifacts/contracts/StakeholderRegistry.sol/StakeholderRegistry.json";

export const stakeholderRegistryAddress =
import.meta.env.VITE_STAKEHOLDER_REGISTRY_ADDRESS || "0xFallbackAddress";
export const stakeholderRegistryABI = StakeholderRegistryArtifact.abi;
