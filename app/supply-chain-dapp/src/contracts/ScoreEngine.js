// src/contracts/ScoreEngine.js
import ScoreEngineArtifact from "../../../../artifacts/contracts/ScoreEngine.sol/ScoreEngine.json";

export const scoreEngineAddress =
    import.meta.env.VITE_SCORE_ENGINE_ADDRESS || "0xFallbackAddress";

export const scoreEngineABI = ScoreEngineArtifact.abi;
