import React from 'react';
import '@rainbow-me/rainbowkit/styles.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createPublicClient, http } from 'viem';
import { createConfig, WagmiProvider } from 'wagmi';
import { RainbowKitProvider, getDefaultConfig } from '@rainbow-me/rainbowkit';

// Define your custom chain for Hardhat with chain ID 31137
const localHardhatChain = {
  id: 31337,
  name: 'Local Hardhat',
  network: 'localhost',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://192.168.249.92:8545'] } },
  blockExplorers: {
    default: { name: 'Hardhat Explorer', url: 'http://192.168.249.92:8545' },
  },
};

const chains = [localHardhatChain];

const publicClient = createPublicClient({
  chain: localHardhatChain,
  transport: http(localHardhatChain.rpcUrls.default.http[0]),
});

const config = getDefaultConfig({
  appName: 'My Local DApp',
  projectId: '1b3897e0f01173ffec0628c6168ec762', // Replace with your WalletConnect project ID if needed
  chains,
  publicClient,
  walletConnectOptions: {
    metadata: {
      name: 'My Local DApp',
      description: 'A local DApp for testing',
      url: 'http://localhost:5173/',
      icons: ['https://example.com/icon.png'], // Replace with your actual icon URL
    },
  },
});

const queryClient = new QueryClient();

export function Web3Provider({ children }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider chains={chains}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
