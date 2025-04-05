// src/contracts/ProductManager.js
import ProductManagerArtifact from "../../../../artifacts/contracts/ProductManager.sol/ProductManager.json";

export const productManagerAddress =
  import.meta.env.VITE_PRODUCT_MANAGER_ADDRESS || "0xFallbackAddress";
export const productManagerABI = ProductManagerArtifact.abi;
