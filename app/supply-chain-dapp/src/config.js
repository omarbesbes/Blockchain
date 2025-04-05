// src/config.ts
export const addresses = {
  StakeholderRegistry: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  DisputeManager: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
  ProductManager: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
  ScoreEngine: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
};

// Below, you should paste each contract's ABI
export { default as StakeholderRegistryABI } from '../../../artifacts/contracts/StakeholderRegistry.sol/StakeholderRegistry.json';
export { default as DisputeManagerABI } from '../../../artifacts/contracts/DisputeManager.sol/DisputeManager.json';
export { default as ProductManagerABI } from '../../../artifacts/contracts/ProductManager.sol/ProductManager.json';
export { default as ScoreEngineABI } from '../../../artifacts/contracts/ScoreEngine.sol/ScoreEngine.json';
