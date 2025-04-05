//// filepath: d:\OneDrive - CentraleSupelec\2A\Blockchain\PROJECT\Blockchain\app\supply-chain-dapp\src\hooks\useProductManager.js
import { useWalletClient, usePublicClient, useReadContract } from 'wagmi';
import { productManagerAddress, productManagerABI } from '../contracts/ProductManager';

export function useProductManager() {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  async function mintProduct(metadataURI) {
    if (!walletClient) throw new Error('No wallet connected');
    const txHash = await walletClient.writeContract({
      address: productManagerAddress,
      abi: productManagerABI,
      functionName: 'mintProduct',
      args: [metadataURI],
      account: walletClient.account,
    });
    return publicClient.waitForTransactionReceipt({ hash: txHash });
  }

  async function transferProduct(toAddress, productId) {
    if (!walletClient) throw new Error('No wallet connected');
    const txHash = await walletClient.writeContract({
      address: productManagerAddress,
      abi: productManagerABI,
      functionName: 'transferProduct',
      args: [toAddress, BigInt(productId)],
      account: walletClient.account,
    });
    return publicClient.waitForTransactionReceipt({ hash: txHash });
  }

  async function buyProduct(productId) {
    if (!walletClient) throw new Error('No wallet connected');
    const buyerAddress = walletClient.account.address;
    const txHash = await walletClient.writeContract({
      address: productManagerAddress,
      abi: productManagerABI,
      functionName: 'transferProduct',
      args: [buyerAddress, BigInt(productId)],
      account: walletClient.account,
    });
    return publicClient.waitForTransactionReceipt({ hash: txHash });
  }

  async function getProductDetails(productId) {
    return publicClient.readContract({
      address: productManagerAddress,
      abi: productManagerABI,
      functionName: 'getProductDetails',
      args: [BigInt(productId)],
    });
  }

  async function updateProductMetadata(productId, newMetadata) {
    if (!walletClient) throw new Error('No wallet connected');
    const txHash = await walletClient.writeContract({
      address: productManagerAddress,
      abi: productManagerABI,
      functionName: 'updateProductMetadata',
      args: [BigInt(productId), newMetadata],
      account: walletClient.account,
    });
    return publicClient.waitForTransactionReceipt({ hash: txHash });
  }

  return {
    mintProduct,
    transferProduct,
    buyProduct,
    getProductDetails,
    updateProductMetadata,
  };
}

export function useGetProductsByOwner(ownerAddress) {
  const { data, error, isPending } = useReadContract({
    address: productManagerAddress,
    abi: productManagerABI,
    functionName: 'getProductsByOwner',
    args: [ownerAddress],
    query: {
      enabled: !!ownerAddress,
    },
  });

  return { products: data, error, isPending };
}