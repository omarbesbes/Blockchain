//// filepath: d:\OneDrive - CentraleSupelec\2A\Blockchain\PROJECT\Blockchain\app\supply-chain-dapp\src\layouts\RootLayout.jsx
import React from 'react';
import { Link, Outlet } from 'react-router-dom';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import './RootLayout.css';

export default function RootLayout() {
  const { isConnected } = useAccount();
  const { connect, connectors, isLoading: connectLoading, pendingConnector } = useConnect();
  const { disconnect } = useDisconnect();

  // If not connected, show ONLY the MetaMask connector
  if (!isConnected) {
    // Find the MetaMask connector in your Wagmi config
    const metamaskConnector = connectors.find((c) => c.id === 'metaMask');

    return (
      <div style={{ padding: '1rem' }}>
        <h2>Please connect your MetaMask wallet:</h2>
        {metamaskConnector ? (
          <button
            className="connect-wallet-button"

            // disabled={!metamaskConnector.ready || connectLoading}
            onClick={() => connect({ connector: metamaskConnector })}
            style={{ marginRight: '0.5rem' }}
          >
            {metamaskConnector.name}
            {connectLoading && metamaskConnector.id === pendingConnector?.id && ' (connecting)'}
          </button>
        ) : (
          <p>MetaMask connector not found. Please install MetaMask.</p>
        )}
      </div>
    );
  }

  // Otherwise, show the site with a "Disconnect" button
  return (
    <div>
      <nav>
        <button style={{ float: 'right' }} onClick={() => disconnect()} className="connect-wallet-button"
        >
          
          Disconnect
        </button>
        <Link to="/dashboard">Dashboard</Link>
        <Link to="/stakeholders">Stakeholders</Link>
        <Link to="/scoring">Scoring</Link>
        <Link to="/challenges">Challenges</Link>
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  );
}