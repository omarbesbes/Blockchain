// filepath: d:\OneDrive - CentraleSupelec\2A\Blockchain\PROJECT\Blockchain\app\supply-chain-dapp\src\pages\ScoringTab.jsx
import React, { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useGetProductsByOwner } from '../hooks/useProductManager';
import { useStakeholderRegistry } from '../hooks/useStakeholderRegistry';
import { useTransactionManager } from '../hooks/useTransactionManager';
import { TransactionManagerAddress } from '../contracts/TransactionManager';
import { useToken } from '../hooks/useToken';
import './ScoringTab.css';

const roleMapping = {
  1: 'Supplier',
  2: 'Factory',
  3: 'Distributor',
  4: 'Retailer',
  5: 'Consumer',
};

// Modified allowedVoting to support Consumer rating both Retailer and Factory
const allowedVoting = {
  2: 1, // Factory can rate Supplier
  4: 3, // Retailer can rate Distributor
  5: [4, 2] // Consumer can rate both Retailer and Factory
};

// Enhanced helper function to get product manufacturer (factory)
// Enhanced helper function to get product manufacturer (factory)
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


  async function getProductManufacturer(productId) {
    try {
      // Start with the most recent transaction
      let txId = await getLastTransactionId(productId);
      let factoryAddress = null;
      let factoryRole = null;
      
      // Follow the transaction chain backwards until we find a Factory (role 2)
      while (txId && Number(txId) > 0) {
        // Get current transaction details
        const txDetails = await getTransaction(txId);
        const sellerAddr = txDetails[1]; // Seller in this transaction
        const sellerRoleNum = await getStakeholderType(sellerAddr);
        const sellerRole = Number(sellerRoleNum);
        
        // If we found a factory (role 2), store it and break
        if (sellerRole === 2) {
          factoryAddress = sellerAddr;
          factoryRole = sellerRole;
          break;
        }
        
        // Get the previous transaction ID using the dedicated function
        txId = await getPreviousTransactionId(txId);
      }
      
      return {
        factoryAddress,
        factoryRole
      };
    } catch (err) {
      console.error('Error finding product manufacturer:', err);
      return {
        factoryAddress: null,
        factoryRole: null
      };
    }
  }
  

  const {
    getLastTransactionId,
    confirmSellOperation,
    getAllPendingTransactionsByProduct,
    getTransaction,
    buyerRateSeller,
    getPreviousTransactionId,
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
  const [selectedRatingTarget, setSelectedRatingTarget] = useState(null); // 'retailer' or 'factory'

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
  async function canRateStakeholder(productId, txId, stakeholderAddress, stakeholderRole) {
    if (!stakeholderAddress) return false;
    
    const requiredScoreTypes = getRoleBasedScoreTypes(stakeholderRole);
    for (const typeId of requiredScoreTypes) {
      const rated = await isSellerRated(txId, typeId);
      if (rated) return false;
    }
    
    return true;
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
          const { sellerAddress: seller, sellerRole } = await getSellerAndRole(prodId);
          if (!sellerRole) continue;
    
          // Special handling for consumers (role 5)
          if (myRole === 5) {
            // For consumers, we need to check both retailer and factory
            const retailerCanBeRated = await canRateStakeholder(prodId, txId, sellerAddr, 4); // Retailer role = 4
            const { factoryAddress } = await getProductManufacturer(prodId);
            console.log('[DEBUG] Factory address:', factoryAddress);
            const factoryCanBeRated = factoryAddress && 
              await canRateStakeholder(prodId, txId, factoryAddress, 2); // Factory role = 2
    
            if (retailerCanBeRated || factoryCanBeRated) {
              newVotable.push({
                productId: prodId,
                retailer: retailerCanBeRated ? sellerAddr : null,
                factory: factoryCanBeRated ? factoryAddress : null,
                txId
              });
            }
          } else {
            // Standard voting logic for non-consumers
            // Check if the user's role is allowed to vote for the seller's role
            if (Array.isArray(allowedVoting[myRole])) {
              if (!allowedVoting[myRole].includes(sellerRole)) continue;
            } else {
              if (allowedVoting[myRole] !== sellerRole) continue;
            }
    
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
              newVotable.push({
                productId: prodId,
                seller: sellerAddr,
                sellerRole,
                txId
              });
            }
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
    
  }, [address, products, getLastTransactionId, getTransaction, isSellerRated, votableFetched, myRole]);
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
        console.log('[DEBUG] Checking if user is the seller for product:', prodId);
        console.log('[DEBUG] Seller Address:', seller);
        console.log('[DEBUG] User Address:', address);
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

  const handleProductClick = async (product) => {
    // product now contains details about both retailer and factory
    if (selectedProduct === product.productId) {
      // Toggle off
      setSelectedProduct(null);
      setSellerAddress(null);
      setSelectedSellerRole(null);
      setSelectedRatingTarget(null);
    } else {
      setSelectedProduct(product.productId);
      setSelectedRatingTarget(null); // Reset rating target
      
      // For consumers, they need to choose which entity to rate
      if (myRole === 5) {
        // We don't set sellerAddress yet - user must choose first
        setSellerAddress(null);
        setSelectedSellerRole(null);
      } else {
        // For other roles, just rate the direct seller
        setSellerAddress(product.seller);
        setSelectedSellerRole(product.sellerRole);
      }
    }
  };
  
  // New function to choose rating target (for consumers)
  const handleSelectRatingTarget = (product, targetType) => {
    setSelectedRatingTarget(targetType);
    
    if (targetType === 'retailer') {
      setSellerAddress(product.retailer);
      setSelectedSellerRole(4); // Retailer role
    } else if (targetType === 'factory') {
      setSellerAddress(product.factory);
      setSelectedSellerRole(2); // Factory role
    }
    
    // Reset score inputs
    setScoreInputs({});
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
        const isConsumerRatingFactory = myRole === 5 && selectedSellerRole === 2;
        await buyerRateSeller(Number(lastTxId), typeId, userValue, selectedProduct, isConsumerRatingFactory);
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
      
      const buyerRoleNum = await getStakeholderType(pendingTx.buyer);
      const buyerRole = Number(buyerRoleNum);
      console.log('[DEBUG] Buyer role for tx', pendingTx.transactionId, ':', buyerRole);
      
      // Approve token transfer if not Supplier-Factory or Factory-Supplier
      if (!((myRole === 1 && buyerRole === 2) || (myRole === 2 && buyerRole === 1))) {
        console.log('[DEBUG] Approving reward for tx', pendingTx.transactionId, 'Amount:', pendingTx.rewardAmount);
        await approve(TransactionManagerAddress, pendingTx.rewardAmount);
      }
      
      console.log('[DEBUG] Confirming transaction:', pendingTx);
      await confirmSellOperation(pendingTx.transactionId);
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
    {votableProducts.map((product) => (
      <li key={String(product.productId)} 
          className={selectedProduct === product.productId ? 'selected-product' : ''}
      >
        <div className="product-header" onClick={() => handleProductClick(product)}>
          Product #{String(product.productId)}
          {myRole === 5 && (
            <span className="rating-options">
              {product.retailer && !selectedRatingTarget && " (Can rate retailer)"}
              {product.factory && !selectedRatingTarget && " (Can rate factory)"}
            </span>
          )}
        </div>
        
        {selectedProduct === product.productId && (
          <div className="score-form">
            {/* For consumers, show options to rate retailer or factory */}
            {myRole === 5 && !selectedRatingTarget && (
              <div className="rating-target-selection">
                <h3>Choose who to rate:</h3>
                {product.retailer && (
                  <button 
                    onClick={() => handleSelectRatingTarget(product, 'retailer')}
                    className="target-btn"
                  >
                    Rate Retailer
                  </button>
                )}
                {product.factory && (
                  <button 
                    onClick={() => handleSelectRatingTarget(product, 'factory')}
                    className="target-btn"
                  >
                    Rate Factory
                  </button>
                )}
              </div>
            )}
            
            {/* Show rating form once seller is selected */}
            {sellerAddress && (
              <>
                <h3>Rate {selectedRatingTarget === 'factory' ? 'Factory' : 'Seller'}: {sellerAddress}</h3>
                <p>Enter your scores (values between 1 and 10):</p>
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
              </>
            )}
          </div>
        )}
      </li>
    ))}
  </ul>
) : (
  <p>No products found that you can vote on.</p>
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
        {/* Remove or comment out the reward amount */}
        {/* <p>Reward: {String(pendingTx.rewardAmount)}</p> */}
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
