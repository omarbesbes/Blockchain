// src/contracts/StakeholderRegistry.js
import TokenArtifact from "../../../../artifacts/contracts/Token.sol/Token.json";

export const TokenAddress =
import.meta.env.VITE_TOKEN_ADDRESS || "0xFallbackAddress";
export const TokenABI = TokenArtifact.abi;
