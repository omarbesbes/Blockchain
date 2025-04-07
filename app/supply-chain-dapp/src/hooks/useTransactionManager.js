//// filepath: d:\OneDrive - CentraleSupelec\2A\Blockchain\PROJECT\Blockchain\app\supply-chain-dapp\src\hooks\useTransactionManager.js
import { useWalletClient, usePublicClient } from "wagmi";
import {
  TransactionManagerAddress,
  TransactionManagerABI,
} from "../contracts/TransactionManager";

export function useTransactionManager() {
  // For write operations (transactions)
  const { data: walletClient } = useWalletClient();
  // For read-only (view/pure calls)
  const publicClient = usePublicClient();

  // 1. Buyer initiates a transaction (recordBuyOperation)
  async function recordBuyOperation(seller, productId) {
    console.log("walletClient", walletClient);
    if (!walletClient) throw new Error("No wallet connected");

    const txHash = await walletClient.writeContract({
      address: TransactionManagerAddress,
      abi: TransactionManagerABI,
      functionName: "recordBuyOperation",
      args: [seller, productId],
      account: walletClient.account,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    return receipt;
  }

  // 2. Seller confirms the transaction (confirmSellOperation)
  async function confirmSellOperation(transactionId) {
    if (!walletClient) throw new Error("No wallet connected");

    const txHash = await walletClient.writeContract({
      address: TransactionManagerAddress,
      abi: TransactionManagerABI,
      functionName: "confirmSellOperation",
      args: [transactionId],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    return receipt;
  }

  // 3. Buyer rates the seller (buyerRateSeller)
  async function buyerRateSeller(
    transactionId,
    scoreType,
    scoreValue,
    productIdForRating,
    ratingFactory
  ) {
    if (!walletClient) throw new Error("No wallet connected");

    const txHash = await walletClient.writeContract({
      address: TransactionManagerAddress,
      abi: TransactionManagerABI,
      functionName: "buyerRateSeller",
      args: [transactionId, scoreType, scoreValue, productIdForRating, ratingFactory],
      account: walletClient.account,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    return receipt;
  }

  // 4. Get a pending transaction by product ID (read-only)
  async function getPendingTransactionByProduct(productId) {
    return await publicClient.readContract({
      address: TransactionManagerAddress,
      abi: TransactionManagerABI,
      functionName: "getPendingTransactionByProduct",
      args: [productId],
    });
  }

  // 5. Get all pending transactions for a product (read-only)
  async function getAllPendingTransactionsByProduct(productId) {
    return await publicClient.readContract({
      address: TransactionManagerAddress,
      abi: TransactionManagerABI,
      functionName: "getAllPendingTransactionsByProduct",
      args: [productId],
    });
  }

  // 6. Check if a pending transaction exists for a product (read-only)
  async function hasPendingTransaction(productId) {
    return await publicClient.readContract({
      address: TransactionManagerAddress,
      abi: TransactionManagerABI,
      functionName: "hasPendingTransaction",
      args: [productId],
    });
  }

  // 7. Get a transaction's details using getTransaction (read-only)
  async function getTransaction(txId) {
    return await publicClient.readContract({
      address: TransactionManagerAddress,
      abi: TransactionManagerABI,
      functionName: "getTransaction",
      args: [txId],
    });
  }

  // 8. Get the last transaction ID for a given product (read-only)
  async function getLastTransactionId(productId) {
    return await publicClient.readContract({
      address: TransactionManagerAddress,
      abi: TransactionManagerABI,
      functionName: "getLastTransactionId",
      args: [productId],
    });
  }

  // 9. Check if the seller has been rated for a given score type (read-only)
  async function isSellerRated(transactionId, scoreType) {
    return await publicClient.readContract({
      address: TransactionManagerAddress,
      abi: TransactionManagerABI,
      functionName: "isSellerRated",
      args: [transactionId, scoreType],
    });
  }

  // 10. Check if the factory has been rated for a given score type (read-only)
  async function isFactoryRated(transactionId, scoreType) {
    return await publicClient.readContract({
      address: TransactionManagerAddress,
      abi: TransactionManagerABI,
      functionName: "isFactoryRated",
      args: [transactionId, scoreType],
    });
  }

  // NEW 11. Get all pending rated transactions for a given seller (read-only)
  async function getPendingRatedTransactions(seller) {
    return await publicClient.readContract({
      address: TransactionManagerAddress,
      abi: TransactionManagerABI,
      functionName: "getPendingRatedTransactions",
      args: [seller],
    });
  }

  // NEW 12. Update the rating status (accepted or disputed) for a given transaction.
  async function updateRatingStatus(transactionId, accepted) {
    if (!walletClient) throw new Error("No wallet connected");

    const txHash = await walletClient.writeContract({
      address: TransactionManagerAddress,
      abi: TransactionManagerABI,
      functionName: "updateRatingStatus",
      args: [transactionId, accepted],
      account: walletClient.account,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    return receipt;
  }

  return {
    recordBuyOperation,
    confirmSellOperation,
    buyerRateSeller,
    getPendingTransactionByProduct,
    getAllPendingTransactionsByProduct,
    hasPendingTransaction,
    getTransaction,
    getLastTransactionId,
    isSellerRated,
    isFactoryRated,
    getPendingRatedTransactions, // NEW
    updateRatingStatus,         // NEW
  };
}