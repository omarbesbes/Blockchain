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

  // Buyer initiates a transaction (recordBuyOperation)
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

  // Seller confirms the transaction (confirmSellOperation)
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

  // Buyer rates the seller (buyerRateSeller)
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

  // Get a pending transaction by product ID (read-only)
  async function getPendingTransactionByProduct(productId) {
    return await publicClient.readContract({
      address: TransactionManagerAddress,
      abi: TransactionManagerABI,
      functionName: "getPendingTransactionByProduct",
      args: [productId],
    });
  }

  // Get all pending transactions for a product (read-only)
  async function getAllPendingTransactionsByProduct(productId) {
    return await publicClient.readContract({
      address: TransactionManagerAddress,
      abi: TransactionManagerABI,
      functionName: "getAllPendingTransactionsByProduct",
      args: [productId],
    });
  }

  // Check if a pending transaction exists for a product (read-only)
  async function hasPendingTransaction(productId) {
    return await publicClient.readContract({
      address: TransactionManagerAddress,
      abi: TransactionManagerABI,
      functionName: "hasPendingTransaction",
      args: [productId],
    });
  }

  // Get a transaction's details using getTransaction (read-only)
  async function getTransaction(txId) {
    return await publicClient.readContract({
      address: TransactionManagerAddress,
      abi: TransactionManagerABI,
      functionName: "getTransaction",
      args: [txId],
    });
  }

  // Get the last transaction ID for a given product (read-only)
  async function getLastTransactionId(productId) {
    return await publicClient.readContract({
      address: TransactionManagerAddress,
      abi: TransactionManagerABI,
      functionName: "getLastTransactionId",
      args: [productId],
    });
  }

  // Check if the seller has been rated for a given score type (read-only)
  async function isSellerRated(transactionId, scoreType) {
    return await publicClient.readContract({
      address: TransactionManagerAddress,
      abi: TransactionManagerABI,
      functionName: "isSellerRated",
      args: [transactionId, scoreType],
    });
  }

  // Check if the factory has been rated for a given score type (read-only)
  async function isFactoryRated(transactionId, scoreType) {
    return await publicClient.readContract({
      address: TransactionManagerAddress,
      abi: TransactionManagerABI,
      functionName: "isFactoryRated",
      args: [transactionId, scoreType],
    });
  }

  // Get all pending rated transactions for a given seller (read-only)
  async function getPendingRatedTransactions(seller) {
    return await publicClient.readContract({
      address: TransactionManagerAddress,
      abi: TransactionManagerABI,
      functionName: "getPendingRatedTransactions",
      args: [seller],
    });
  }

  async function updateRatingStatus(transactionId, scoreType, accepted) {
    if (!walletClient) throw new Error("No wallet connected");
  
    const txHash = await walletClient.writeContract({
      address: TransactionManagerAddress,
      abi: TransactionManagerABI,
      functionName: "updateRatingStatus",
      args: [transactionId, scoreType, accepted],
      account: walletClient.account,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    return receipt;
  }
  
  // Add the new isScoreTypeProcessed function:
  async function isScoreTypeProcessed(transactionId, scoreType) {
    return await publicClient.readContract({
      address: TransactionManagerAddress,
      abi: TransactionManagerABI,
      functionName: "isScoreTypeProcessed",
      args: [transactionId, scoreType],
    });
  }

  // Get all buyers for a given seller (read-only)
  async function getBuyersForSeller(seller) {
    return await publicClient.readContract({
      address: TransactionManagerAddress,
      abi: TransactionManagerABI,
      functionName: "getBuyersForSeller",
      args: [seller],
    });
  }
  /**
 * Get the previous transaction ID for a transaction.
 * @param {number} transactionId - The current transaction ID
 * @returns {Promise<number>} - Previous transaction ID or 0 if none
 */
async function getPreviousTransactionId(transactionId) {
  return publicClient.readContract({
    address: TransactionManagerAddress,
    abi: TransactionManagerABI,
    functionName: 'getPreviousTransactionId',
    args: [transactionId],
  });
}

  // Check if a buyer has purchased from a seller (read-only)
  async function hasBoughtFromSeller(seller, buyer) {
    return await publicClient.readContract({
      address: TransactionManagerAddress,
      abi: TransactionManagerABI,
      functionName: "hasBoughtFromSeller",
      args: [seller, buyer],
    });
  }

  // Get the number of buyers for a seller (read-only)
  async function getSellerBuyerCount(seller) {
    return await publicClient.readContract({
      address: TransactionManagerAddress,
      abi: TransactionManagerABI,
      functionName: "getSellerBuyerCount",
      args: [seller],
    });
  }

  // Get a buyer at a specific index for a seller (read-only)
  async function getSellerBuyerAtIndex(seller, index) {
    return await publicClient.readContract({
      address: TransactionManagerAddress,
      abi: TransactionManagerABI,
      functionName: "getSellerBuyerAtIndex",
      args: [seller, index],
    });


    
  }
  
  async function getTransactionScore(transactionId, scoreType, isFactory = false) {
    return await publicClient.readContract({
      address: TransactionManagerAddress,
      abi: TransactionManagerABI,
      functionName: "getTransactionScore",
      args: [transactionId, scoreType, isFactory],
    });}

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
    getPendingRatedTransactions,
    updateRatingStatus,
    getBuyersForSeller,
    hasBoughtFromSeller,
    getSellerBuyerCount,
    getSellerBuyerAtIndex,
    getTransactionScore,
    getPreviousTransactionId,
    isScoreTypeProcessed,

  };
}