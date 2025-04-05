//// filepath: d:\OneDrive - CentraleSupelec\2A\Blockchain\PROJECT\Blockchain\app\supply-chain-dapp\src\pages\Dashboard.jsx
import React, { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useStakeholderRegistry } from '../hooks/useStakeholderRegistry';
import { useGetProductsByOwner, useProductManager } from '../hooks/useProductManager';
import { useScoreEngine } from '../hooks/useScoreEngine';
import { useToken } from '../hooks/useToken';
import './Dashboard.css';

export default function Dashboard() {
  const { address, isConnected } = useAccount();
  const { getStakeholderType } = useStakeholderRegistry();
  const { getGlobalScore, getApplicableScoreTypes } = useScoreEngine();
  

  // Product Manager hooks
  const { products, error: productsError, isPending: productsLoading } = useGetProductsByOwner(address);
  const { updateProductMetadata, getProductDetails, mintProduct } = useProductManager();

  // State for role, stakeholder errors, etc.
  const [role, setRole] = useState('');
  const [stakeholderError, setStakeholderError] = useState(null);

  // States for updating/creating product metadata
  const [productIdInput, setProductIdInput] = useState('');
  const [productMetadataInput, setProductMetadataInput] = useState('');
  const [newProductMetadata, setNewProductMetadata] = useState('');

  // State for scores
  const [scores, setScores] = useState([]);

  // Array to hold product details (including metadata)
  const [productDetailsList, setProductDetailsList] = useState([]);

  // State for token balance and buying tokens
  const [tokenBalance, setTokenBalance] = useState(0);
  const [buyAmount, setBuyAmount] = useState('');
  const [message, setMessage] = useState('');

  // Score type mapping
  const scoreTypeMapping = {
    0: 'Trust',
    1: 'Delivery speed',
    2: 'Material quality',
    3: 'Product quality',
    4: 'Warranty',
    5: 'Eco rating',
    6: 'Packaging',
    7: 'Transparency',
    8: 'Accuracy',
    9: 'Delivery',
    10: 'Price fairness',
    11: 'Return policy',
  };

  // Token hooks
  const { balanceOf, buy } = useToken();

  // 1) Fetch user's stakeholder role (dependency: address only)
  useEffect(() => {
    async function fetchDetails() {
      if (!address) return;
      try {
        const typeNum = await getStakeholderType(address);
        const roleMapping = {
          0: 'None',
          1: 'Supplier',
          2: 'Factory',
          3: 'Distributor',
          4: 'Retailer',
          5: 'Consumer',
        };
        setRole(roleMapping[Number(typeNum)] || 'Unknown');
      } catch (err) {
        console.error('Failed to get stakeholder type:', err);
        setStakeholderError('Stakeholder not registered');
        setRole('Not Registered');
      }
    }
    fetchDetails();
  }, [address]); // Removed getStakeholderType from dependencies

  // 2) Fetch scores (dependency: address only)
  useEffect(() => {
    async function fetchApplicableScores() {
      if (!address) return;
      try {
        const applicableTypes = await getApplicableScoreTypes(address);
        const scoresData = await Promise.all(
          applicableTypes.map(async (scoreId) => {
            const rawScore = await getGlobalScore(address, scoreId);
            return { name: scoreTypeMapping[scoreId] || `Score ${scoreId}`, value: rawScore };
          })
        );
        setScores(scoresData);
      } catch (err) {
        console.error('Error fetching scores:', err);
      }
    }
    fetchApplicableScores();
  }, [address]); // Removed getGlobalScore and getApplicableScoreTypes

  // 3) Fetch product details when products update (dependency: products, productsLoading, productsError)
  useEffect(() => {
    async function fetchAllProductDetails() {
      if (!products || products.length === 0) {
        setProductDetailsList([]);
        return;
      }
      try {
        const detailsArray = await Promise.all(
          products.map(async (productId) => {
            const details = await getProductDetails(productId);
            return { id: productId.toString(), metadataURI: details.metadataURI };
          })
        );
        setProductDetailsList(detailsArray);
      } catch (err) {
        console.error('Error fetching product details:', err);
        setProductDetailsList([]);
      }
    }
    if (!productsLoading && !productsError) {
      fetchAllProductDetails();
    }
  }, [products, productsLoading, productsError]); // Removed getProductDetails

  // 4) Fetch token balance when role is "Factory" (dependency: role, address)
  useEffect(() => {
    async function fetchBalance() {
      if (role === 'Factory' && address) {
        try {
          const balance = await balanceOf(address);
          setTokenBalance(Number(balance));
        } catch (err) {
          console.error('Error fetching balance:', err);
        }
      }
    }
    fetchBalance();
  }, [role, address, balanceOf]);

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>Please connect your wallet to view your dashboard.</p>
      </div>
    );
  }

  // Handler for updating product metadata (factory only)
  const handleUpdateProductMetadata = async () => {
    try {
      if (role !== 'Factory') {
        alert('Only a Factory can update product metadata!');
        return;
      }
      if (!productIdInput) {
        alert('Please enter a product ID');
        return;
      }
      await updateProductMetadata(productIdInput, productMetadataInput);
      alert(`Product metadata updated for Product #${productIdInput}`);
    } catch (err) {
      console.error('Failed to update product metadata:', err);
      alert('Metadata update failed!');
    }
  };

  // Handler to mint a new product with the given metadata
  const handleMintProduct = async () => {
    try {
      if (!newProductMetadata) {
        alert('Please enter metadata before minting');
        return;
      }
      await mintProduct(newProductMetadata);
      alert('Product minted successfully!');
    } catch (err) {
      console.error('Error minting product:', err);
      alert('Mint product failed!');
    }
  };

  // Handler to buy tokens
  //// filepath: d:\OneDrive - CentraleSupelec\2A\Blockchain\PROJECT\Blockchain\app\supply-chain-dapp\src\pages\Dashboard.jsx
// Handler to buy tokens
const handleBuyTokens = async () => {
  if (!buyAmount || isNaN(buyAmount) || Number(buyAmount) <= 0) {
    setMessage('Enter a valid token amount.');
    return;
  }
  
  try {
    // Convert to BigInt for the transaction
    const amountBigInt = BigInt(buyAmount); // Assuming 18 decimals
    
    // Call buy with just the amount (not the address)
    // The contract will use msg.sender as recipient
    await buy(amountBigInt); 
    
    // Refresh balance after purchase
    const newBalance = await balanceOf(address);
    setTokenBalance(Number(newBalance)); 
    
    setMessage(`Successfully bought ${buyAmount} tokens.`);
    setBuyAmount('');
  } catch (err) {
    console.error('Error buying tokens:', err);
    setMessage('Transaction failed: ' + err.message);
  }
};
  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Dashboard</h1>
        <div>
          <span className="role-badge">Role: {role || 'Loading...'}</span>
          <p className="account-address">Account: {address}</p>
          {stakeholderError && <p className="error-message">{stakeholderError}</p>}
        </div>
      </header>

      {/* Section: Display the user's products, with ID + metadata */}
      <section className="dashboard-section">
        <h2>Your Products</h2>
        {productsLoading ? (
          <p>Loading products...</p>
        ) : productsError ? (
          <p className="error-message">Failed to load products: {productsError.message}</p>
        ) : productDetailsList && productDetailsList.length > 0 ? (
          <ul>
            {productDetailsList.map((item) => (
              <li key={item.id}>
                <p>
                  <strong>Product ID:</strong> {item.id}
                </p>
                <p>
                  <strong>Metadata:</strong> {item.metadataURI}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p>No products found.</p>
        )}
      </section>

      {/* Section: Show applicable scores for this stakeholder */}
      <section className="dashboard-section">
        <h2>Your scores</h2>
        {scores.length === 0 ? (
          <p>Loading scores...</p>
        ) : (
          <ul>
            {scores.map((score, index) => (
              <li key={index}>
                <strong>{score.name}:</strong> {score.value.toString()}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Section: Mint a new product */}
      <section className="dashboard-section">
        <h2>Mint a New Product</h2>
        <div className="metadata-update">
          <input
            type="text"
            className="dashboard-input"
            value={newProductMetadata}
            onChange={(e) => setNewProductMetadata(e.target.value)}
            placeholder="Enter product metadata URI"
          />
          <button className="btn btn-primary" onClick={handleMintProduct}>
            Mint Product
          </button>
        </div>
      </section>

      {/* Section: Update product metadata (Factory only) */}
      {role === 'Factory' && (
        <section className="dashboard-section">
          <h2>Update Product Metadata</h2>
          <div className="metadata-update">
            <input
              type="text"
              className="dashboard-input"
              value={productIdInput}
              onChange={(e) => setProductIdInput(e.target.value)}
              placeholder="Enter product ID"
            />
            <input
              type="text"
              className="dashboard-input"
              value={productMetadataInput}
              onChange={(e) => setProductMetadataInput(e.target.value)}
              placeholder="Enter new metadata URI"
            />
            <button className="btn btn-primary" onClick={handleUpdateProductMetadata}>
              Update Product Metadata
            </button>
          </div>
        </section>
      )}

      {/* Section: Buy tokens (Factory only) */}
      {role === 'Factory' && (
        <section className="dashboard-section token-section">
          <h2>Your Token Balance</h2>
          <p>Balance: {tokenBalance}</p>
          <div className="token-buy">
            <input
              type="text"
              className="dashboard-input"
              placeholder="Amount of tokens to buy"
              value={buyAmount}
              onChange={(e) => setBuyAmount(e.target.value)}
            />
            <button className="btn btn-primary" onClick={handleBuyTokens}>
              Buy Tokens
            </button>
          </div>
          {message && <p>{message}</p>}
        </section>
      )}
    </div>
  );
}
