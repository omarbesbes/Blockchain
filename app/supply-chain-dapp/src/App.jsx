// src/App.jsx
import React, { useEffect, useState } from 'react';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { usePublicClient } from 'wagmi';

import RootLayout from './layouts/RootLayout';
import Dashboard from './pages/Dashboard';
import StakeholderList from './pages/StakeholderList';
import VotingTab from './pages/ScoringTab';
import ChallengesTab from './pages/ChallengesTab';
import NotFound from './pages/NotFound';

// Create router for app routes.
const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" /> },
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'stakeholders', element: <StakeholderList /> },
      { path: 'Scoring', element: <VotingTab /> },
      { path: 'challenges', element: <ChallengesTab /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

// Component to check and display the chain ID.
function ChainIdChecker() {
  const publicClient = usePublicClient();
  const [chainId, setChainId] = useState(null);

  useEffect(() => {
    async function fetchChainId() {
      try {
        const id = await publicClient.getChainId();
        setChainId(id);
      } catch (error) {
        console.error("Failed to get chain id:", error);
      }
    }
    fetchChainId();
  }, [publicClient]);

  return (
    <div style={{ padding: "1rem", background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
      <p>
        Connected Chain ID: {chainId ? chainId : "Loading..."}
      </p>
      {chainId === 31337 ? (
        <p style={{ color: "green" }}>Viem is connected to the Hardhat network.</p>
      ) : (
        <p style={{ color: "red" }}>
          Warning: The chain ID does not match the Hardhat network (expected 31337).
        </p>
      )}
    </div>
  );
}

export default function App() {
  return (
    <div>
      <ChainIdChecker />
      <RouterProvider router={router} />
    </div>
  );
}
