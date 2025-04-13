// filepath: d:\OneDrive - CentraleSupelec\2A\Blockchain\PROJECT\Blockchain\app\supply-chain-dapp\src\pages\Dashboard.jsx
import React, { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useStakeholderRegistry } from '../hooks/useStakeholderRegistry';
import { useTransactionManager } from '../hooks/useTransactionManager';
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
  const [role, setRole] = useState(null);
  const [stakeholderError, setStakeholderError] = useState(null);

  // States for updating/creating product metadata
  const [productIdInput, setProductIdInput] = useState('');
  const [productMetadataInput, setProductMetadataInput] = useState('');
  const [newProductMetadata, setNewProductMetadata] = useState('');

  // State for scores
  const [scores, setScores] = useState([]);
  const [scoresFetched, setScoresFetched] = useState(false);

  // Array to hold product details (including metadata)
  const [productDetailsList, setProductDetailsList] = useState([]);
  const [detailsFetched, setDetailsFetched] = useState(false);

  // State for token balance and buying tokens
  const [tokenBalance, setTokenBalance] = useState(0);
  const [balanceFetched, setBalanceFetched] = useState(false);
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

  // 1) Fetch user's stakeholder role (only once per address)
  useEffect(() => {
    async function fetchDetails() {
      if (!address) return;
      try {
        const typeNum = await getStakeholderType(address);
        const roleMap = {
          0: 'None',
          1: 'Supplier',
          2: 'Factory',
          3: 'Distributor',
          4: 'Retailer',
          5: 'Consumer',
        };
        setRole(roleMap[Number(typeNum)] || 'Unknown');
      } catch (err) {
        console.error('Failed to get stakeholder type:', err);
        setStakeholderError('Stakeholder not registered');
        setRole('Not Registered');
      }
    }
    if (role === null) {
      fetchDetails();
    }
  }, [address, getStakeholderType, role]);

  // 2) Fetch scores (only once per address)
  useEffect(() => {
    async function fetchApplicableScores() {
      if (!address) return;
      try {
        const applicableTypes = await getApplicableScoreTypes(address);
        const scoresData = await Promise.all(
          applicableTypes.map(async (scoreId) => {
            const rawScore = await getGlobalScore(address, scoreId);
            const formattedScore = Number(rawScore) / 1e18;
            return { name: scoreTypeMapping[scoreId] || `Score ${scoreId}`, value: formattedScore };
          })
        );
        console.log(scoresData);
        setScores(scoresData);
        setScoresFetched(true);
      } catch (err) {
        console.error('Error fetching scores:', err);
      }
    }
    if (!scoresFetched) {
      fetchApplicableScores();
    }
  }, [address, getApplicableScoreTypes, getGlobalScore, scoresFetched, scoreTypeMapping]);

  // 3) Fetch product details when products update (only once)
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
        setDetailsFetched(true);
      } catch (err) {
        console.error('Error fetching product details:', err);
        setProductDetailsList([]);
      }
    }
    if (!productsLoading && !productsError && !detailsFetched) {
      fetchAllProductDetails();
    }
  }, [products, productsLoading, productsError, getProductDetails, detailsFetched]);

  // 4) Fetch token balance when role is "Factory" (only once)
  useEffect(() => {
    async function fetchBalance() {
      if (role === 'Factory' && address) {
        try {
          const balance = await balanceOf(address);
          setTokenBalance(Number(balance)/1e18);
          setBalanceFetched(true);
        } catch (err) {
          console.error('Error fetching balance:', err);
        }
      }
    }
    if (role === 'Factory' && !balanceFetched) {
      fetchBalance();
    }
  }, [role, address, balanceOf, balanceFetched]);

  if (!isConnected) {
    return (
      <div className="dashboard-container">
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
  const handleBuyTokens = async () => {
    if (!buyAmount || isNaN(buyAmount) || Number(buyAmount) <= 0) {
      setMessage('Enter a valid token amount.');
      return;
    }
    
    try {
      // Convert to BigInt for the transaction (assuming 18 decimals)
      const amountBigInt = BigInt(buyAmount*1e18);
      await buy(amountBigInt); // Adjust for decimals
      const newBalance = await balanceOf(address);
      setTokenBalance(Number(newBalance)/1e18); 
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
        <div className="user-info">
          <span className="role-badge">Role: {role || 'Loading...'}</span>
          <p className="account-address">Account: {address}</p>
          {stakeholderError && <p className="error-message">{stakeholderError}</p>}
        </div>
      </header>

      {/* Section: Display the user's products as cards */}
      <section className="dashboard-section">
        <h2>Your Products</h2>
        {productsLoading ? (
          <p>Loading products...</p>
        ) : productsError ? (
          <p className="error-message">Failed to load products: {productsError.message}</p>
        ) : productDetailsList && productDetailsList.length > 0 ? (
          <div className="cards-container">
            {productDetailsList.map((item) => (
              <div key={item.id} className="product-card">
                <p className="product-id"><strong>Product ID:</strong> {item.id}</p>
                <p className="product-metadata"><strong>Metadata:</strong> {item.metadataURI}</p>
              </div>
            ))}
          </div>
        ) : (
          <p>No products found.</p>
        )}
      </section>

      {/* Section: Show applicable scores for this stakeholder */}
      <section className="dashboard-section">
        <h2>Your Scores</h2>
        {scores.length === 0 ? (
          <p>Loading scores...</p>
        ) : (
          <ul className="scores-list">
            {scores.map((score, index) => (
              <li key={index} className="score-item">
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
          {message && <p className="message">{message}</p>}
        </section>
      )}
    </div>
  );
}
