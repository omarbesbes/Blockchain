import { getContract } from 'viem';
import { useWalletClient, usePublicClient } from 'wagmi';
import { TokenAddress, TokenABI } from '../contracts/Token';

export function useToken() {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  // Helper: create contract instance if needed.
  const tokenContract = getContract({
    address: TokenAddress,
    abi: TokenABI,
    walletClient,
    publicClient,
  });

  // Read functions
  async function name() {
    return publicClient.readContract({
      address: TokenAddress,
      abi: TokenABI,
      functionName: 'name',
      args: [],
    });
  }

  async function symbol() {
    return publicClient.readContract({
      address: TokenAddress,
      abi: TokenABI,
      functionName: 'symbol',
      args: [],
    });
  }

  async function decimals() {
    return publicClient.readContract({
      address: TokenAddress,
      abi: TokenABI,
      functionName: 'decimals',
      args: [],
    });
  }

  async function totalSupply() {
    return publicClient.readContract({
      address: TokenAddress,
      abi: TokenABI,
      functionName: 'totalSupply',
      args: [],
    });
  }

  async function balanceOf(account) {
    return publicClient.readContract({
      address: TokenAddress,
      abi: TokenABI,
      functionName: 'balanceOf',
      args: [account],
    });
  }

  async function allowance(owner, spender) {
    return publicClient.readContract({
      address: TokenAddress,
      abi: TokenABI,
      functionName: 'allowance',
      args: [owner, spender],
    });
  }

  // Write functions
  async function transfer(to, amount) {
    if (!walletClient) throw new Error('No wallet connected');
    const txHash = await walletClient.writeContract({
      address: TokenAddress,
      abi: TokenABI,
      functionName: 'transfer',
      args: [to, amount],
      account: walletClient.account,
    });
    return publicClient.waitForTransactionReceipt({ hash: txHash });
  }

  async function approve(spender, amount) {
    if (!walletClient) throw new Error('No wallet connected');
    const txHash = await walletClient.writeContract({
      address: TokenAddress,
      abi: TokenABI,
      functionName: 'approve',
      args: [spender, amount],
      account: walletClient.account,
    });
    return publicClient.waitForTransactionReceipt({ hash: txHash });
  }

  async function transferFrom(from, to, amount) {
    if (!walletClient) throw new Error('No wallet connected');
    const txHash = await walletClient.writeContract({
      address: TokenAddress,
      abi: TokenABI,
      functionName: 'transferFrom',
      args: [from, to, amount],
      account: walletClient.account,
    });
    return publicClient.waitForTransactionReceipt({ hash: txHash });
  }

  async function mint(to, amount) {
    if (!walletClient) throw new Error('No wallet connected');
    const txHash = await walletClient.writeContract({
      address: TokenAddress,
      abi: TokenABI,
      functionName: 'mint',
      args: [to, amount],
      account: walletClient.account,
    });
    return publicClient.waitForTransactionReceipt({ hash: txHash });
  }
  //// filepath: d:\OneDrive - CentraleSupelec\2A\Blockchain\PROJECT\Blockchain\app\supply-chain-dapp\src\hooks\useToken.js
  async function buy(amount) {
    if (!walletClient) throw new Error('No wallet connected');
    // amount should be in token's smallest units (wei)
    const value = BigInt(amount) / 1000n;
    const txHash = await walletClient.writeContract({
      address: TokenAddress,
      abi: TokenABI,
      functionName: 'buy',
      args: [amount],
      account: walletClient.account,
      value: value,
    });
    return publicClient.waitForTransactionReceipt({ hash: txHash });
  }

  async function burn(amount) {
    if (!walletClient) throw new Error('No wallet connected');
    const txHash = await walletClient.writeContract({
      address: TokenAddress,
      abi: TokenABI,
      functionName: 'burn',
      args: [amount],
      account: walletClient.account,
    });
    return publicClient.waitForTransactionReceipt({ hash: txHash });
  }

  return {
    name,
    symbol,
    decimals,
    totalSupply,
    balanceOf,
    transfer,
    approve,
    allowance,
    buy,
    transferFrom,
    mint,
    burn,
  };
}
