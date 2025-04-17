import React, { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useStakeholderRegistry } from '../hooks/useStakeholderRegistry';
import { useGetProductsByOwner } from '../hooks/useProductManager';
import { useScoreEngine } from '../hooks/useScoreEngine';
import { useTransactionManager } from '../hooks/useTransactionManager';
import './StakeholderList.css';

export default function StakeholderList() {
  const { address, isConnected } = useAccount();
  const { getAllStakeholders, getStakeholderType } = useStakeholderRegistry();
  const { getGlobalScore, getScores, getConfidenceScore } = useScoreEngine(); 
  const { recordBuyOperation, hasPendingTransaction } = useTransactionManager();
  
  const [myRole, setMyRole] = useState(null);
  const [visibleStakeholders, setVisibleStakeholders] = useState([]);
  const [selectedStakeholder, setSelectedStakeholder] = useState(null);
  const [selectedAddress, setSelectedAddress] = useState(null);
  const { products: selectedStakeholderProducts, error: productsError, isPending: productsLoading } =
    useGetProductsByOwner(selectedAddress);
  
  // Track product transaction status
  const [pendingProducts, setPendingProducts] = useState({});
  const [isCheckingPending, setIsCheckingPending] = useState(false);

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
    12: 'Customer service'
  };
  
  // Role labels
  const roleLabels = {
    0: 'None',
    1: 'Supplier',
    2: 'Factory',
    3: 'Distributor',
    4: 'Retailer',
    5: 'Consumer',
  };

  // Fetch my role (only if not already fetched)
  useEffect(() => {
    async function fetchMyRole() {
      if (!address) return;
      try {
        const roleNum = await getStakeholderType(address);
        setMyRole(Number(roleNum));
      } catch (err) {
        console.error('Error fetching my role:', err);
      }
    }
    if (myRole === null) {
      fetchMyRole();
    }
  }, [address, getStakeholderType, myRole]);

  // Load Stakeholders (only once, if not already loaded)
  useEffect(() => {
    async function loadAndFilterStakeholders() {
      if (!address || myRole === null) return;

      // Decide role to see based on current user's role
      let allowedRole = null;
      switch (myRole) {
        case 2: // I'm a Factory => see Suppliers
          allowedRole = 1;
          break;
        case 3: // I'm a Distributor => see Factories
          allowedRole = 2;
          break;
        case 4: // I'm a Retailer => see Distributors
          allowedRole = 3;
          break;
        case 5: // I'm a Consumer => see Retailers
          allowedRole = 4;
          break;
        default:
          allowedRole = null;
      }

      if (!allowedRole) {
        // If user is Supplier or None => empty
        setVisibleStakeholders([]);
        return;
      }

      // Determine score types based on allowedRole:
      // For Supplier (role 1): score types [0, 1, 2]
      // For Factory (role 2): score types [4, 5, 6]
      // For Distributor (role 3): score types [7, 8, 9]
      // For Retailer (role 4): score types [10, 11, 12]
      let scoreTypes = [];
      if (allowedRole === 1) {
        scoreTypes = [0, 1, 2];
      } else if (allowedRole === 2) {
        scoreTypes = [4, 5, 3];
      } else if (allowedRole === 3) {
        scoreTypes = [7, 8, 6];
      } else if (allowedRole === 4) {
        scoreTypes = [10, 11, 9];
      }

      let allAddrs = [];
      try {
        allAddrs = await getAllStakeholders();
      } catch (err) {
        console.error('Error fetching all stakeholders:', err);
        return;
      }

// In the loadAndFilterStakeholders function:
const finalList = [];
for (const sAddr of allAddrs) {
  try {
    const rNum = await getStakeholderType(sAddr);
    if (Number(rNum) === allowedRole) {
      // Fetch scores based on the scoreTypes for this role
      const score1Raw = await getGlobalScore(sAddr, scoreTypes[0]);
      const score2Raw = await getGlobalScore(sAddr, scoreTypes[1]);
      const score3Raw = await getGlobalScore(sAddr, scoreTypes[2]);

      const allScores = await getScores(sAddr);
      const ratingCount = allScores.length;

      // Get confidence score
      const confidenceScoreRaw = await getConfidenceScore(sAddr);
      const confidenceScore = Number(confidenceScoreRaw);

      // Convert values 
      const score1 = Number(score1Raw) / 1e18;
      const score2 = Number(score2Raw) / 1e18;
      const score3 = Number(score3Raw) / 1e18;

      finalList.push({
        address: sAddr,
        role: Number(rNum),
        score1: score1.toFixed(2),
        score2: score2.toFixed(2),
        score3: score3.toFixed(2),
        score1Type: scoreTypes[0],
        score2Type: scoreTypes[1],
        score3Type: scoreTypes[2],
        ratingCount,
        confidenceScore: confidenceScore.toFixed(0) 
      });
    }
  } catch (err) {
    console.error(`Could not fetch data for stakeholder ${sAddr}`, err);
  }
}

setVisibleStakeholders(finalList);
    }

    if (visibleStakeholders.length === 0) {
      loadAndFilterStakeholders();
    }
  }, [address, myRole, getAllStakeholders, getStakeholderType, getGlobalScore, getScores, visibleStakeholders]);

  // Check for pending transactions when products load
  useEffect(() => {
    async function checkPendingTransactions() {
      if (!selectedStakeholderProducts || selectedStakeholderProducts.length === 0) return;
      
      setIsCheckingPending(true);
      const pendingStatusMap = {};
      
      try {
        for (const prodId of selectedStakeholderProducts) {
          const isPending = await hasPendingTransaction(prodId.toString());
          pendingStatusMap[prodId.toString()] = isPending;
        }
        setPendingProducts(pendingStatusMap);
      } catch (err) {
        console.error('Error checking pending transactions:', err);
      } finally {
        setIsCheckingPending(false);
      }
    }
    
    checkPendingTransactions();
  }, [selectedStakeholderProducts]); 

  //  On stakeholder card click
  function handleSelectStakeholder(stakeholderAddress) {
    setSelectedStakeholder(stakeholderAddress);
    setSelectedAddress(stakeholderAddress);
    setPendingProducts({});
  }
  
  // Handle buy product
  async function handleBuyProduct(productId) {
    try {
      if (!window.confirm(`Are you sure you want to purchase Product #${productId}?`)) {
        return;
      }
      
      console.log("Starting purchase for product:", productId);
      console.log("Selected stakeholder:", selectedStakeholder);
      console.log("Wallet connected:", isConnected);
      await recordBuyOperation(selectedStakeholder, productId);
      
      console.log("Purchase recorded successfully");
      
      setPendingProducts(prev => ({
        ...prev,
        [productId]: true
      }));
      
      alert(`Purchase request for Product #${productId} has been recorded. Waiting for seller confirmation.`);
    } catch (err) {
      console.error('Failed to record buy operation:', err);
      
      const errorMessage = err.message || 'Unknown error';
      const userMessage = errorMessage.includes('wallet') || errorMessage.includes('network') 
        ? errorMessage 
        : 'Failed to process your purchase. Please try again.';
        
      alert(userMessage);
    }
  }


  return (
    <div className="stakeholder-list-container">
      <header>
        <h2 className="section-title">Stakeholder List</h2>
        <p>
          Your role: <span className="highlight">{roleLabels[myRole] || 'None'}</span>
        </p>
      </header>
      <section className="stakeholder-section">
        <h3 className="section-subtitle">Visible Stakeholders</h3>
        {visibleStakeholders.length === 0 ? (
          <p>No stakeholders to display for your role.</p>
        ) : (
          <div className="stakeholder-grid">
  {visibleStakeholders.map((st) => (
    <div
    key={st.address}
    className="stakeholder-card"
    onClick={() => handleSelectStakeholder(st.address)}
  >
    <p className="card-label">Address:</p>
    <p className="card-value">{st.address}</p>
    <p className="card-label">
      Type: <span className="card-value-inline">{roleLabels[st.role]}</span>
    </p>
    <div className="scores-container">
      <p>{scoreTypeMapping[st.score1Type]}: <strong>{st.score1}</strong></p>
      <p>{scoreTypeMapping[st.score2Type]}: <strong>{st.score2}</strong></p>
      <p>{scoreTypeMapping[st.score3Type]}: <strong>{st.score3}</strong></p>
      <p>Confidence Score: <strong>{st.confidenceScore || 'N/A'}</strong></p> 
    </div>
    <div className="rating-count">
      <small>({st.ratingCount} total ratings)</small>
    </div>
  </div>
  ))}
</div>
        )}
      </section>
      
      {selectedStakeholder && (
        <section className="stakeholder-section">
          <h3 className="section-subtitle">
            Products owned by <span className="highlight">{selectedStakeholder}</span>
          </h3>
          {productsLoading && <p>Loading products...</p>}
          {isCheckingPending && <p>Checking transaction status...</p>}
          {productsError && <p>Error fetching products: {productsError.message}</p>}
          {selectedStakeholderProducts && selectedStakeholderProducts.length > 0 ? (
            <ul className="products-list">
              {selectedStakeholderProducts.map((prodId) => {
                const idStr = prodId.toString();
                const isPending = pendingProducts[idStr];
                return (
                  <li key={idStr} className="products-list-item">
                    <div>
                      <span className="product-label">Product #{idStr}</span>
                      {isPending && <span className="pending-badge">PENDING</span>}
                    </div>
                    <button 
                      onClick={() => handleBuyProduct(idStr)} 
                      className={`buy-btn ${isPending ? 'disabled' : ''}`}
                      disabled={isPending}
                    >
                      {isPending ? 'Pending' : 'Buy This'}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            !productsLoading && <p>No products found.</p>
          )}
        </section>
      )}
    </div>
  );
}
