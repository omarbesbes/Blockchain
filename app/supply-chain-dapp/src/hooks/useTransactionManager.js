import { getContract } from 'viem';
import { useWalletClient, usePublicClient } from 'wagmi';
import { TransactionManagerAddress, TransactionManagerABI } from '../contracts/TransactionManager';

export function useTransactionManager() {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  // Create a contract instance for interacting with the TransactionManager
  const transactionManager = getContract({
    address: TransactionManagerAddress,
    abi: TransactionManagerABI,
    walletClient,
    publicClient,
  });

  // Buyer records a buy operation
  async function recordBuyOperation(seller, productId) {
    if (!walletClient) throw new Error('No wallet connected');
    const txHash = await walletClient.writeContract({
      address: TransactionManagerAddress,
      abi: TransactionManagerABI,
      functionName: 'recordBuyOperation',
      args: [seller, productId],
      account: walletClient.account,
    });
    return publicClient.waitForTransactionReceipt({ hash: txHash });
  }

  // Seller confirms the sale operation
  async function confirmSellOperation(transactionId) {
    if (!walletClient) throw new Error('No wallet connected');
    const txHash = await walletClient.writeContract({
      address: TransactionManagerAddress,
      abi: TransactionManagerABI,
      functionName: 'confirmSellOperation',
      args: [transactionId],
      account: walletClient.account,
    });
    return publicClient.waitForTransactionReceipt({ hash: txHash });
  }

  // Buyer rates the seller
  async function buyerRateSeller(transactionId, scoreType, scoreValue, productIdForRating, ratingFactory) {
    if (!walletClient) throw new Error('No wallet connected');
    const txHash = await walletClient.writeContract({
      address: TransactionManagerAddress,
      abi: TransactionManagerABI,
      functionName: 'buyerRateSeller',
      args: [transactionId, scoreType, scoreValue, productIdForRating, ratingFactory],
      account: walletClient.account,
    });
    return publicClient.waitForTransactionReceipt({ hash: txHash });
  }

  // View function: get the pending transaction for a specific product
  async function getPendingTransactionByProduct(productId) {
    return publicClient.readContract({
      address: TransactionManagerAddress,
      abi: TransactionManagerABI,
      functionName: 'getPendingTransactionByProduct',
      args: [productId],
    });
  }

  // View function: get all pending transactions for a specific product
  async function getAllPendingTransactionsByProduct(productId) {
    return publicClient.readContract({
      address: TransactionManagerAddress,
      abi: TransactionManagerABI,
      functionName: 'getAllPendingTransactionsByProduct',
      args: [productId],
    });
  }

  // View function: check if there is any pending transaction for a specific product
  async function hasPendingTransaction(productId) {
    return publicClient.readContract({
      address: TransactionManagerAddress,
      abi: TransactionManagerABI,
      functionName: 'hasPendingTransaction',
      args: [productId],
    });
  }

  return {
    recordBuyOperation,
    confirmSellOperation,
    buyerRateSeller,
    getPendingTransactionByProduct,
    getAllPendingTransactionsByProduct,
    hasPendingTransaction,
  };
}
