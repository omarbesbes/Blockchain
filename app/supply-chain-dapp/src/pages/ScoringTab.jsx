// ScoringTab.jsx
import React, { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useGetProductsByOwner } from '../hooks/useProductManager';
import { useStakeholderRegistry } from '../hooks/useStakeholderRegistry';
import { useScoreEngine } from '../hooks/useScoreEngine';
import { useTransactionManager } from '../hooks/useTransactionManager';
import { useToken } from '../hooks/useToken';
import './ScoringTab.css';

const roleMapping = {
  1: 'Supplier',
  2: 'Factory',
  3: 'Distributor',
  4: 'Retailer',
  5: 'Consumer',
};

const allowedVoting = {
  2: 1,
  4: 3,
  5: 2,
};

// Constant reward amount (as defined in your contract: 10 * 1e18)
const REWARD_AMOUNT = "10000000000000000000"; 

export default function ScoringTab() {
  const { address } = useAccount();
  const { getStakeholderType } = useStakeholderRegistry();
  const { products, error: productsError, isPending: productsLoading } = useGetProductsByOwner(address);
  const { rateStakeholder, confirmSellOperation, getAllPendingTransactionsByProduct, getTransaction } = useTransactionManager();
  const { approve } = useToken();

  const [myRole, setMyRole] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [sellerAddress, setSellerAddress] = useState(null);
  const [scoreInputs, setScoreInputs] = useState({ score1: '', score2: '', score3: '' });
  const [message, setMessage] = useState('');
  const [pendingBuyRequests, setPendingBuyRequests] = useState([]);
  const [votableProducts, setVotableProducts] = useState([]);

  // Flags to ensure data is loaded only once per refresh
  const [votableFetched, setVotableFetched] = useState(false);
  const [pendingFetched, setPendingFetched] = useState(false);

  // Fetch the current stakeholder role (only once when address changes)
  useEffect(() => {
    async function fetchRole() {
      if (!address) return;
      try {
        const roleNum = await getStakeholderType(address);
        console.log('[DEBUG] Fetched role for', address, ':', roleNum);
        setMyRole(Number(roleNum));
      } catch (err) {
        console.error('Error fetching role:', err);
      }
    }
    if (myRole === null) {
      fetchRole();
    }
  }, [address, getStakeholderType, myRole]);

  const isAllowedToVote = () => myRole in allowedVoting;

  // Simulated helper: get seller address and role for a product.
  async function getSellerAndRole(productId) {
    console.log('[DEBUG] Getting seller/role for product:', productId);
    // For example: if the last digit is even, assume current user is the seller.
      console.log('[DEBUG] Product', productId, 'is owned by current user:', address);
      return {
        sellerAddress: address,
        sellerRole: myRole || 1,
      };
    
    }
  

  // Filter products eligible for voting (load only once)
  useEffect(() => {
    async function loadVotableProducts() {
      const filtered = [];
      for (const prodId of products) {
        const { sellerAddress: seller, sellerRole } = await getSellerAndRole(prodId);
        console.log('[DEBUG] Checking product:', prodId, 'Seller:', seller, 'Role:', sellerRole);
        if (seller.toLowerCase() !== address.toLowerCase() && sellerRole === allowedVoting[myRole]) {
          filtered.push(prodId);
        }
      }
      console.log('[DEBUG] Votable products:', filtered);
      setVotableProducts(filtered);
      setVotableFetched(true);
    }
    if (!votableFetched && products && products.length > 0 && isAllowedToVote()) {
      loadVotableProducts();
    }
  }, [products, myRole, votableFetched, address]);

  // Fetch pending transactions (load only once)
  useEffect(() => {
    async function fetchPendingTransactions() {
      if (!products || products.length === 0) {
        setPendingBuyRequests([]);
        return;
      }
      const pending = [];
      console.log('[DEBUG] Checking pending transactions for products:', products);
      for (const prodId of products) {
        const { sellerAddress: seller } = await getSellerAndRole(prodId);
        console.log('[DEBUG] Product:', prodId, 'Seller:', seller);
        if (seller.toLowerCase() === address.toLowerCase()) {
          try {
            // Get pending transaction IDs for this product
            const txIds = await getAllPendingTransactionsByProduct(prodId);
            console.log('[DEBUG] Raw txIds for product', prodId, ':', txIds);
            const transactionsArray = Array.isArray(txIds) ? txIds : txIds ? [txIds] : [];
            for (const txId of transactionsArray) {
              console.log('[DEBUG] Fetching transaction details for txId:', txId);
              const txDetails = await getTransaction(txId);
              console.log('[DEBUG] Details for txId', txId, ':', txDetails);
              pending.push({
                transactionId: txDetails[0],
                buyer: txDetails[1],
                rewardAmount: REWARD_AMOUNT,
                productId: prodId,
              });
            }
          } catch (e) {
            console.error('Error fetching pending transactions for product', prodId, e);
          }
        }
      }
      console.log('[DEBUG] Final pendingBuyRequests:', pending);
      setPendingBuyRequests(pending);
      setPendingFetched(true);
    }
    if (!pendingFetched && products && products.length > 0) {
      fetchPendingTransactions();
    }
  }, [products, address, pendingFetched, getAllPendingTransactionsByProduct, getTransaction]);

  const handleProductClick = async (productId) => {
    const { sellerAddress: sAddr } = await getSellerAndRole(productId);
    console.log('[DEBUG] Product clicked:', productId, 'Seller:', sAddr);
    setSellerAddress(sAddr);
    setSelectedProduct(productId);
  };

  const handleChange = (e) => {
    setScoreInputs({ ...scoreInputs, [e.target.name]: e.target.value });
  };

  const handleSubmit = async () => {
    if (!sellerAddress) return;
    const scoreTypes = [0, 1, 2];
    const scoreValues = [scoreInputs.score1, scoreInputs.score2, scoreInputs.score3];

    try {
      for (let i = 0; i < scoreTypes.length; i++) {
        const value = Number(scoreValues[i]);
        if (value < 1 || value > 10) {
          setMessage('Score values must be between 1 and 10.');
          return;
        }
        console.log('[DEBUG] Rating seller:', sellerAddress, 'ScoreType:', scoreTypes[i], 'Value:', value);
        await rateStakeholder(sellerAddress, scoreTypes[i], value);
      }
      setMessage('Scores submitted successfully!');
      setScoreInputs({ score1: '', score2: '', score3: '' });
      setSelectedProduct(null);
      setSellerAddress(null);
      setVotableProducts((prev) => prev.filter((id) => id !== selectedProduct));
    } catch (err) {
      console.error('Error submitting scores:', err);
      setMessage('Error submitting scores.');
    }
  };

  const handleConfirm = async (pendingTx) => {
    try {
      console.log('[DEBUG] Confirming transaction:', pendingTx);
      await confirmSellOperation(pendingTx.transactionId);
      const buyerRoleNum = await getStakeholderType(pendingTx.buyer);
      const buyerRole = Number(buyerRoleNum);
      console.log('[DEBUG] Buyer role for tx', pendingTx.transactionId, ':', buyerRole);
      if (!((myRole === 1 && buyerRole === 2) || (myRole === 2 && buyerRole === 1))) {
        console.log('[DEBUG] Approving reward for tx', pendingTx.transactionId, 'Amount:', pendingTx.rewardAmount);
        await approve(address, pendingTx.rewardAmount);
      }
      setMessage(`Transaction ${String(pendingTx.transactionId)} confirmed.`);
      setPendingBuyRequests((prev) => prev.filter((tx) => tx.transactionId !== pendingTx.transactionId));
    } catch (e) {
      console.error('Error confirming transaction', e);
      setMessage(`Error confirming transaction ${String(pendingTx.transactionId)}.`);
    }
  };

  const handleCancel = async (pendingTx) => {
    try {
      console.log('[DEBUG] Cancelling transaction:', pendingTx);
      // Implement actual cancellation if supported by your contract
      setMessage(`Transaction ${String(pendingTx.transactionId)} cancelled.`);
      setPendingBuyRequests((prev) => prev.filter((tx) => tx.transactionId !== pendingTx.transactionId));
    } catch (e) {
      console.error('Error cancelling transaction', e);
      setMessage(`Error cancelling transaction ${String(pendingTx.transactionId)}.`);
    }
  };

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
            <li key={String(prodId)} onClick={() => handleProductClick(prodId)}>
              Product #{String(prodId)}
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
            <input type="number" name="score1" value={scoreInputs.score1} onChange={handleChange} min="1" max="10" />
          </label>
          <label>
            Score 2:
            <input type="number" name="score2" value={scoreInputs.score2} onChange={handleChange} min="1" max="10" />
          </label>
          <label>
            Score 3:
            <input type="number" name="score3" value={scoreInputs.score3} onChange={handleChange} min="1" max="10" />
          </label>
          <button onClick={handleSubmit}>Submit Scores</button>
        </div>
      )}

      <h3>Pending Buy Requests</h3>
      {pendingBuyRequests.length > 0 ? (
        <ul className="pending-list">
          {pendingBuyRequests.map((pendingTx) => (
            <li key={`${String(pendingTx.transactionId)}-${String(pendingTx.productId)}`}>
              <p>
                Product #{String(pendingTx.productId)} - Transaction ID: {String(pendingTx.transactionId)}
              </p>
              <p>Buyer: {pendingTx.buyer}</p>
              <p>Reward: {String(pendingTx.rewardAmount)}</p>
              <button onClick={() => handleConfirm(pendingTx)}>Confirm</button>
              <button onClick={() => handleCancel(pendingTx)}>Cancel</button>
            </li>
          ))}
        </ul>
      ) : (
        <p>No pending buy requests for your products.</p>
      )}

      {message && <p className="message">{message}</p>}
    </div>
  );
}
