import { usePublicClient } from 'wagmi';
import { useEffect, useState } from 'react';

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
    <div>
      <p>Connected Chain ID: {chainId ? chainId : "Loading..."}</p>
      {chainId === 31337 ? (
        <p>Viem is connected to the Hardhat network.</p>
      ) : (
        <p>
          Warning: The chain ID does not match the Hardhat network (expected
          31337).
        </p>
      )}
    </div>
  );
}

export default ChainIdChecker;
