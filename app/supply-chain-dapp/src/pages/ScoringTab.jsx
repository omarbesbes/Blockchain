//// filepath: d:\OneDrive - CentraleSupelec\2A\Blockchain\PROJECT\Blockchain\app\supply-chain-dapp\src\pages\ScoringTab.jsx
import React, { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useGetProductsByOwner } from '../hooks/useProductManager';
import { useStakeholderRegistry } from '../hooks/useStakeholderRegistry';
import { useScoreEngine } from '../hooks/useScoreEngine';
import './ScoringTab.css';

const roleMapping = {
  1: 'Supplier',
  2: 'Factory',
  3: 'Distributor',
  4: 'Retailer',
  5: 'Consumer',
};

/**
 * Who can vote on which seller role:
 * Key: voter role (myRole),   Value: target role we're allowed to rate
 */
const allowedVoting = {
  2: 1, // Factory can vote on Supplier
  4: 3, // Retailer can vote on Distributor
  5: 2, // Consumer can vote on Factory
};

export default function ScoringTab() {
  const { address } = useAccount();
  const { getStakeholderType } = useStakeholderRegistry();
  const { products, error: productsError, isPending: productsLoading } = useGetProductsByOwner(address);
  const { rateStakeholder } = useScoreEngine();

  const [myRole, setMyRole] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [sellerAddress, setSellerAddress] = useState(null);
  const [scoreInputs, setScoreInputs] = useState({ score1: '', score2: '', score3: '' });
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function fetchRole() {
      if (!address) return;
      try {
        const roleNum = await getStakeholderType(address);
        setMyRole(Number(roleNum));
      } catch (err) {
        console.error('Error fetching role:', err);
      }
    }
    fetchRole();
  }, [address, getStakeholderType]);

  // Check if user is allowed to vote at all
  const isAllowedToVote = () => myRole in allowedVoting;

  /**
   * Placeholder function that simulates retrieving the seller’s address & role.
   * In a real scenario, you would get this from your product details or another contract call.
   */
  async function getSellerAndRole(productId) {
    // Example:
    // const details = await getProductDetails(productId);
    // const seller = details.previousOwner; // or similar
    // const sellerRoleNum = await getStakeholderType(seller);
    // return { sellerAddress: seller, sellerRole: Number(sellerRoleNum) };

    // For demonstration, always returning a "supplier" role:
    return {
      sellerAddress: '0xSellerAddressExample',
      sellerRole: 1, // 1 => 'Supplier'
    };
  }

  /**
   * We only show products if:
   * 1) We did not mint them ourselves (you actually bought them).
   * 2) The seller's role matches allowedVoting[myRole].
   */
  const filterVotableProducts = async (productList) => {
    const filtered = [];
    for (const prodId of productList) {
      const { sellerAddress: seller, sellerRole } = await getSellerAndRole(prodId);
      if (seller.toLowerCase() !== address.toLowerCase() && sellerRole === allowedVoting[myRole]) {
        filtered.push(prodId);
      }
    }
    return filtered;
  };

  // Track the filtered list of products the user can rate
  const [votableProducts, setVotableProducts] = useState([]);

  useEffect(() => {
    if (!products || products.length === 0) {
      setVotableProducts([]);
      return;
    }
    if (!isAllowedToVote()) {
      setVotableProducts([]);
      return;
    }
    // Filter out products the user is not supposed to rate
    (async () => {
      const results = await filterVotableProducts(products);
      setVotableProducts(results);
    })();
  }, [products, myRole]);

  // When a product is clicked, store relevant info for rating
  const handleProductClick = async (productId) => {
    const { sellerAddress: sAddr } = await getSellerAndRole(productId);
    setSellerAddress(sAddr);
    setSelectedProduct(productId);
  };

  // Handle score input change
  const handleChange = (e) => {
    setScoreInputs({ ...scoreInputs, [e.target.name]: e.target.value });
  };

  // Submit scores – calling the score engine for each score type (0,1,2 as example)
  const handleSubmit = async () => {
    if (!sellerAddress) return;
    const scoreTypes = [0, 1, 2]; // Adjust to your real scoring logic
    const scoreValues = [scoreInputs.score1, scoreInputs.score2, scoreInputs.score3];

    try {
      for (let i = 0; i < scoreTypes.length; i++) {
        const value = Number(scoreValues[i]);
        if (value < 1 || value > 10) {
          setMessage('Score values must be between 1 and 10.');
          return;
        }
        await rateStakeholder(sellerAddress, scoreTypes[i], value);
      }
      setMessage('Scores submitted successfully!');
      setScoreInputs({ score1: '', score2: '', score3: '' });
      setSelectedProduct(null);
      setSellerAddress(null);
      // Optionally remove this product from votableProducts if you only want one-time rating
      setVotableProducts((prev) => prev.filter((id) => id !== selectedProduct));
    } catch (err) {
      console.error('Error submitting scores:', err);
      setMessage('Error submitting scores.');
    }
  };

  // Render a message if the user is not allowed to vote
  if (!isAllowedToVote()) {
    return (
      <div className="voting-tab-container">
        <p>Your role ({roleMapping[myRole] || 'Unknown'}) is not permitted to vote.</p>
      </div>
    );
  }

  return (
    <div className="voting-tab-container">
      <h2>Scoring Tab</h2>
      <p>Your Role: {roleMapping[myRole]}</p>

      <h3>Your Products (Eligible for Voting)</h3>
      {productsLoading ? (
        <p>Loading products...</p>
      ) : productsError ? (
        <p>Error loading products.</p>
      ) : votableProducts.length > 0 ? (
        <ul className="product-list">
          {votableProducts.map((prodId) => (
            <li key={prodId.toString()} onClick={() => handleProductClick(prodId)}>
              Product #{prodId.toString()}
            </li>
          ))}
        </ul>
      ) : (
        <p>No products found that you can vote on.</p>
      )}

      {selectedProduct && sellerAddress && (
        <div className="score-form">
          <h3>Rate Seller: {sellerAddress}</h3>
          <p>Enter your scores for the seller (values between 1 and 10):</p>
          <label>
            Score 1:
            <input
              type="number"
              name="score1"
              value={scoreInputs.score1}
              onChange={handleChange}
              min="1"
              max="10"
            />
          </label>
          <label>
            Score 2:
            <input
              type="number"
              name="score2"
              value={scoreInputs.score2}
              onChange={handleChange}
              min="1"
              max="10"
            />
          </label>
          <label>
            Score 3:
            <input
              type="number"
              name="score3"
              value={scoreInputs.score3}
              onChange={handleChange}
              min="1"
              max="10"
            />
          </label>
          <button onClick={handleSubmit}>Submit Scores</button>
        </div>
      )}

      {message && <p className="message">{message}</p>}
    </div>
  );
}