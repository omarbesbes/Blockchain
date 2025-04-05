// src/components/ConnectWallet.jsx
import React from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';

export default function ConnectWallet() {
  const { address, isConnected } = useAccount();

  return (
    <div>
      {isConnected ? (
        <div>
          <p>Connected: {address}</p>
        </div>
      ) : (
        <ConnectButton />
      )}
    </div>
  );
}
