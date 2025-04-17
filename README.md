
# Decentralized Supply Chain Platform

This project is a blockchain-based supply chain management platform using Ethereum smart contracts. It enables stakeholders such as suppliers, factories, distributors, retailers, and consumers to interact transparently, track product history, perform transactions, rate partners, and handle disputes in a decentralized manner.

---

## 🏗️ Architecture

### Smart Contracts

| Contract              | Purpose                                                                 |
|-----------------------|-------------------------------------------------------------------------|
| `StakeholderRegistry` | Register and manage roles of stakeholders (Supplier, Factory, etc.)     |
| `ProductManager`      | Mint, transfer, and manage product NFTs                                 |
| `TransactionManager`  | Record, confirm, and validate buy/sell operations                        |
| `ScoreEngine`         | Calculate and update stakeholder scores using exponential moving average |
| `Token`               | ERC-20 token for incentives and deposits                                |
| `DisputeManager`      | Manage dispute resolution via voting                                     |

---

## 📦 Project Structure

```
/contracts        -> Solidity smart contracts
/test             -> Hardhat test cases (Mocha + Chai)
/app
  /hooks          -> React custom hooks to interact with smart contracts
  /contracts      -> ABI & contract address exports
```

---

## 🚀 Features

- Role-based stakeholder registry
- Product minting and transfer with NFT tracking
- Secure transaction flow with buyer/seller confirmation
- EMA-based scoring system across multiple criteria
- On-chain dispute resolution with staking and voting
- Consumer rewards via token incentives

---

## 🧪 Testing

All smart contracts are fully unit-tested using Hardhat. Run:

```bash
npx hardhat test
```

Includes:
- Role registration and validation
- Product minting & history tracking
- Transaction validations
- Stakeholder scoring (with EMA updates)
- End-to-end supply chain simulation
- Dispute lifecycle (initiate → respond → vote → finalize)

---

## 🌐 Frontend Integration

The `app/hooks` directory contains React hooks (using `wagmi` and `viem`) to interact with contracts:

- `useProductManager.js`: Mint, transfer, and fetch product data
- `useTransactionManager.js`: Handle buy/sell operations, ratings
- `useStakeholderRegistry.js`: Role registration and metadata management
- `useScoreEngine.js`: Stakeholder rating and score retrieval
- `useToken.js`: ERC20 token functions (transfer, mint, burn, etc.)
- `useDisputeManager.js`: Voting, initiating, and resolving disputes

---

## 🧠 Simulation

Run the simulation suite to mimic real-world flows:

```bash
npx hardhat test test/Simulation.test.js
```

This covers multi-actor interactions from suppliers to consumers with full rating and transfer validation.
