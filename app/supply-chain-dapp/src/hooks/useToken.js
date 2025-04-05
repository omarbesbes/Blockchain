import { getContract } from 'viem';
import { useWalletClient, usePublicClient } from 'wagmi';
// import { tokenAddress, tokenABI } from '../contracts/Token'; // adjust the import as needed

export function useToken() {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const tokenContract = getContract({
    // address: tokenAddress,
    // abi: tokenABI,
    walletClient,
    publicClient,
  });

  async function balanceOf(account) {
    return publicClient.readContract({
      functionName: 'balanceOf',
      args: [account],
    });
  }

  async function transfer(to, amount) {
    if (!walletClient) throw new Error('No wallet connected');
    const txHash = await walletClient.writeContract({
      functionName: 'transfer',
      args: [to, amount],
      account: walletClient.account,
    });
    return publicClient.waitForTransactionReceipt({ hash: txHash });
  }

  async function approve(spender, amount) {
    if (!walletClient) throw new Error('No wallet connected');
    const txHash = await walletClient.writeContract({
      functionName: 'approve',
      args: [spender, amount],
      account: walletClient.account,
    });
    return publicClient.waitForTransactionReceipt({ hash: txHash });
  }

  async function allowance(owner, spender) {
    return publicClient.readContract({
      functionName: 'allowance',
      args: [owner, spender],
    });
  }

  async function mint(to, amount) {
    if (!walletClient) throw new Error('No wallet connected');
    const txHash = await walletClient.writeContract({
      functionName: 'mint',
      args: [to, amount],
      account: walletClient.account,
    });
    return publicClient.waitForTransactionReceipt({ hash: txHash });
  }

  return {
    balanceOf,
    transfer,
    approve,
    allowance,
    mint,
  };
}
