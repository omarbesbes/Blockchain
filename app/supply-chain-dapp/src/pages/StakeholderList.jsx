// src/pages/StakeholderList.jsx
import React, { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useStakeholderRegistry } from '../hooks/useStakeholderRegistry';
import { useProductManager, useGetProductsByOwner } from '../hooks/useProductManager';
import { useScoreEngine } from '../hooks/useScoreEngine';
import './StakeholderList.css';

export default function StakeholderList() {
  const { address } = useAccount();
  const { getAllStakeholders, getStakeholderType } = useStakeholderRegistry();
  const { getGlobalScore, getScores } = useScoreEngine();
  const { buyProduct } = useProductManager(); // Added buyProduct
  const [myRole, setMyRole] = useState(null);
  const [visibleStakeholders, setVisibleStakeholders] = useState([]);
  const [selectedStakeholder, setSelectedStakeholder] = useState(null);
  const [selectedAddress, setSelectedAddress] = useState(null);
  const { products: selectedStakeholderProducts, error: productsError, isPending: productsLoading } =
    useGetProductsByOwner(selectedAddress);

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
  // Role labels
  const roleLabels = {
    0: 'None',
    1: 'Supplier',
    2: 'Factory',
    3: 'Distributor',
    4: 'Retailer',
    5: 'Consumer',
  };

  // ====== 1) Fetch my role ======
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
    fetchMyRole();
  }, [address, getStakeholderType]);

  // ==================
  // 2) Load Stakeholders
  // ==================
  useEffect(() => {
    async function loadAndFilterStakeholders() {
      if (!address || myRole === null) return;

      // Decide role to see
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

      let allAddrs = [];
      try {
        allAddrs = await getAllStakeholders();
      } catch (err) {
        console.error('Error fetching all stakeholders:', err);
        return;
      }

      const finalList = [];
      for (const sAddr of allAddrs) {
        try {
          const rNum = await getStakeholderType(sAddr);
          if (Number(rNum) === allowedRole) {
            // fetch 3 example scores
            const trustRaw = await getGlobalScore(sAddr, 0); // TRUST
            const productQualityRaw = await getGlobalScore(sAddr, 3); // PRODUCT_QUALITY
            const deliveryRaw = await getGlobalScore(sAddr, 9); // DELIVERY

            const allScores = await getScores(sAddr);
            const ratingCount = allScores.length;

            // Convert
            const trustScore = Number(trustRaw) / 1e18;
            const productQualityScore = Number(productQualityRaw) / 1e18;
            const deliveryScore = Number(deliveryRaw) / 1e18;

            finalList.push({
              address: sAddr,
              role: Number(rNum),
              trustScore: trustScore.toFixed(2),
              productQualityScore: productQualityScore.toFixed(2),
              deliveryScore: deliveryScore.toFixed(2),
              ratingCount,
            });
          }
        } catch (err) {
          console.error(`Could not fetch data for stakeholder ${sAddr}`, err);
        }
      }

      setVisibleStakeholders(finalList);
    }

    loadAndFilterStakeholders();
  }, [address, myRole, getAllStakeholders, getStakeholderType, getGlobalScore, getScores]);

  // ====== 3) On stakeholder card click ======
  function handleSelectStakeholder(stakeholderAddress) {
    setSelectedStakeholder(stakeholderAddress);
    // Also set for the hook
    setSelectedAddress(stakeholderAddress);
  }
  function handleBuyProduct(productId) {
    // Call the buyProduct function to transfer ownership from the seller to the buyer
    buyProduct(productId)
      .then((receipt) => {
        alert(`Product #${productId} purchased successfully!`);
        // Optionally refresh product list or update UI after purchase
      })
      .catch((err) => {
        console.error('Failed to purchase product:', err);
        alert('Failed to purchase product.');
      });
  }

  // =======================
  // RENDER
  // =======================
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
                <div className="scores-container">
                  <p>Trust: <strong>{st.trustScore}</strong></p>
                  <p>Product Quality: <strong>{st.productQualityScore}</strong></p>
                  <p>Delivery: <strong>{st.deliveryScore}</strong></p>
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
          {productsError && <p>Error fetching products: {productsError.message}</p>}
          {selectedStakeholderProducts && selectedStakeholderProducts.length > 0 ? (
            <ul className="products-list">
              {selectedStakeholderProducts.map((prodId) => {
                const idStr = prodId.toString();
                return (
                  <li key={idStr} className="products-list-item">
                    <div>
                      <span className="product-label">Product #{idStr}</span>
                    </div>
                    <button onClick={() => handleBuyProduct(idStr)} className="buy-btn">
                      Buy This
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
  );}
