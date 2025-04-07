// filepath: d:\OneDrive - CentraleSupelec\2A\Blockchain\PROJECT\Blockchain\app\supply-chain-dapp\src\pages\ScoringTab.jsx
import React, { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useGetProductsByOwner } from '../hooks/useProductManager';
import { useStakeholderRegistry } from '../hooks/useStakeholderRegistry';
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

function getRoleBasedScoreTypes(role) {
  switch (role) {
    case 1: // Supplier
      return [0, 1, 2];
    case 2: // Factory
      return [3, 4, 5];
    case 3: // Distributor
      return [6, 7, 8];
    case 4: // Retailer
      return [9, 10, 11];
    default:
      return [];
  }
}

const scoreTypeMapping = {
  0: 'Trust',
  1: 'Quality',
  2: 'Timeliness',
  3: 'Efficiency',
  4: 'Responsiveness',
  5: 'Communication',
  6: 'Innovation',
  7: 'Reliability',
  8: 'Support',
  9: 'Professionalism',
  10: 'Expertise',
  11: 'Customer Service'
};

// Constant reward amount (as defined in your contract: 10 * 1e18)
const REWARD_AMOUNT = '10000000000000000000';

export default function ScoringTab() {
  const { address } = useAccount();
  const { getStakeholderType } = useStakeholderRegistry();
  const {
    products,
    error: productsError,
    isPending: productsLoading
  } = useGetProductsByOwner(address);

  const {
    getLastTransactionId,
    confirmSellOperation,
    getAllPendingTransactionsByProduct,
    getTransaction,
    buyerRateSeller,
    isSellerRated
  } = useTransactionManager();

  const { approve } = useToken();

  const [myRole, setMyRole] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [sellerAddress, setSellerAddress] = useState(null);
  const [selectedSellerRole, setSelectedSellerRole] = useState(null);
  const [scoreInputs, setScoreInputs] = useState({});
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

  // Helper to get the seller address and role from the last transaction
  async function getSellerAndRole(productId) {
    console.log('[DEBUG] Getting seller/role for product:', productId);
    try {
      const txId = await getLastTransactionId(productId);
      if (!txId || Number(txId) === 0) {
        console.log('[DEBUG] No transaction found for product:', productId);
        return {
          sellerAddress: null,
          sellerRole: null
        };
      }
      // Transaction details typically [id, seller, buyer, ...]
      const txDetails = await getTransaction(txId);
      const realSeller = txDetails[1];
      console.log('[DEBUG] Found seller address from transaction:', realSeller);

      // Now find the correct role for that seller
      const sellerRoleNum = await getStakeholderType(realSeller);
      return {
        sellerAddress: realSeller,
        sellerRole: Number(sellerRoleNum)
      };
    } catch (err) {
      console.error('Error fetching seller address/role:', err);
      return {
        sellerAddress: null,
        sellerRole: null
      };
    }
  }

  // Filter products eligible for voting (load only once)
  useEffect(() => {
    async function loadVotableProducts() {
      if (!address || !products) return;
      const newVotable = [];

      for (const prodId of products) {
        // Get the last transaction ID for this product
        const txId = await getLastTransactionId(prodId);
        console.log('[DEBUG] Product ID:', prodId, 'Last Transaction ID:', txId);
        if (!txId || Number(txId) === 0) continue;

        const txDetails = await getTransaction(txId);
        const buyerAddress = txDetails[2];
        const sellerAddr = txDetails[1];
        console.log('[DEBUG] Buyer address:', buyerAddress, 'Seller address:', sellerAddr);

        // Product is votable if user is the buyer, and the seller is different
        if (
          buyerAddress?.toLowerCase() === address.toLowerCase() &&
          sellerAddr?.toLowerCase() !== address.toLowerCase()
        ) {
          // Get seller's role from last transaction info
          const { sellerRole } = await getSellerAndRole(prodId);
          if (!sellerRole) continue;
          // Determine required score types based on seller's role
          const requiredScoreTypes = getRoleBasedScoreTypes(sellerRole);
          let alreadyRated = false;
          for (const typeId of requiredScoreTypes) {
            const rated = await isSellerRated(txId, typeId);
            if (rated) {
              alreadyRated = true;
              break;
            }
          }
          if (!alreadyRated) {
            newVotable.push(prodId);
          }
        }
      }

      console.log('[DEBUG] Votable products:', newVotable);
      setVotableProducts(newVotable);
      setVotableFetched(true);
    }

    if (!votableFetched) {
      loadVotableProducts();
    }
  }, [address, products, getLastTransactionId, getTransaction, isSellerRated, votableFetched]);

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

        // If we are the seller, gather any pending transaction requests
        if (seller && seller.toLowerCase() === address.toLowerCase()) {
          try {
            const txIds = await getAllPendingTransactionsByProduct(prodId);
            const transactionsArray = Array.isArray(txIds) ? txIds : txIds ? [txIds] : [];
            for (const txId of transactionsArray) {
              console.log('[DEBUG] Fetching transaction details for txId:', txId);
              const txDetails = await getTransaction(txId);
              pending.push({
                transactionId: txDetails[0],
                buyer: txDetails[2],
                rewardAmount: REWARD_AMOUNT,
                productId: prodId
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
    const { sellerAddress: sAddr, sellerRole: sRole } = await getSellerAndRole(productId);
    console.log('[DEBUG] Product clicked:', productId, 'Seller:', sAddr, 'SellerRole:', sRole);
    setSellerAddress(sAddr);
    setSelectedProduct(productId);
    setSelectedSellerRole(sRole);
  };

  const handleChange = (e) => {
    setScoreInputs({ ...scoreInputs, [e.target.name]: e.target.value });
  };

  const handleSubmit = async () => {
    if (!selectedProduct || !selectedSellerRole) return;
    setMessage('');

    try {
      // Retrieve the last transaction ID for the selected product
      const lastTxId = await getLastTransactionId(selectedProduct);
      if (!lastTxId || Number(lastTxId) === 0) {
        setMessage('No valid transaction found for this product.');
        return;
      }

      // Score types based on the seller's role
      const types = getRoleBasedScoreTypes(selectedSellerRole);
      for (const typeId of types) {
        const userValue = Number(scoreInputs[`score_${typeId}`]);
        if (userValue < 1 || userValue > 10) {
          setMessage(`Score for ${scoreTypeMapping[typeId]} must be between 1 and 10.`);
          return;
        }
        console.log(`Score for type ${typeId}:`, userValue);
        await buyerRateSeller(Number(lastTxId), typeId, userValue, selectedProduct, false);
      }

      setMessage('Scores submitted successfully!');
      setScoreInputs({});
      setSelectedProduct(null);
      setSellerAddress(null);
      setSelectedSellerRole(null);

      // Remove from the votable list
      setVotableProducts((prev) => prev.filter((p) => p !== selectedProduct));
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

      // Approve token transfer if not Supplier-Factory or Factory-Supplier
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
      // If contract supports actual cancellation, call it here
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
            <li
              key={String(prodId)}
              onClick={() => handleProductClick(prodId)}
              className={selectedProduct === prodId ? 'selected-product' : ''}
            >
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
          {getRoleBasedScoreTypes(selectedSellerRole).map((typeId) => (
            <label key={typeId} style={{ display: 'block', marginBottom: '8px' }}>
              {scoreTypeMapping[typeId]}:
              <input
                type="number"
                name={`score_${typeId}`}
                value={scoreInputs[`score_${typeId}`] ?? ''}
                onChange={handleChange}
                min="1"
                max="10"
                style={{ marginLeft: '8px' }}
              />
            </label>
          ))}
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
