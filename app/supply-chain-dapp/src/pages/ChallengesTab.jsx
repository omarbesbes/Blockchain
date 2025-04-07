//// filepath: d:\OneDrive - CentraleSupelec\2A\Blockchain\PROJECT\Blockchain\app\supply-chain-dapp\src\pages\ChallengesTab.jsx
import React, { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useTransactionManager } from '../hooks/useTransactionManager';
import { useDisputeManager } from '../hooks/useDisputeManager';
import { useToken } from '../hooks/useToken';
import { useScoreEngine } from '../hooks/useScoreEngine';
import './ChallengesTab.css';

// Helper mapping from score type IDs to human-readable names
const scoreTypeNames = {
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

export default function ChallengesTab() {
  const { address } = useAccount();
  const {
    getPendingRatedTransactions,
    getTransaction,
    updateRatingStatus,
  } = useTransactionManager();
  const { initiateDispute } = useDisputeManager();
  const { decimals } = useToken();
  const { getScores } = useScoreEngine();

  const [pendingRatings, setPendingRatings] = useState([]);
  const [sellerScores, setSellerScores] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // When address changes, load pending ratings and seller scores.
  useEffect(() => {
    if (address) {
      fetchPendingRatings();
    }
  }, [address]);

  async function fetchPendingRatings() {
    setLoading(true);
    setError('');
    try {
      // Get pending transaction IDs for this seller.
      const pendingTxIds = await getPendingRatedTransactions(address);
      // Fetch details for each pending transaction.
      const details = await Promise.all(
        pendingTxIds.map(async (txId) => await getTransaction(txId))
      );
      setPendingRatings(details);
      
      // Additionally, fetch all score records for this seller.
      const scores = await getScores(address);
      console.log("Score records:", scores);
      setSellerScores(scores || []);
    } catch (err) {
      console.error(err);
      setError('Failed to load pending ratings.');
    }
    setLoading(false);
  }

  async function handleAcknowledge(txId) {
    setError('');
    try {
      // Update rating status to accepted (true)
      await updateRatingStatus(txId, true);
      await fetchPendingRatings();
    } catch (err) {
      console.error(err);
      setError('Error acknowledging rating.');
    }
  }

  async function handleDispute(txId) {
    setError('');
    try {
      // Update rating status to disputed (false)
      await updateRatingStatus(txId, false);
      // Get transaction details to obtain the seller (respondent) address.
      const txDetail = await getTransaction(txId);
      // txDetail[1] is the seller address.
      const respondent = txDetail[1];
      // Use token decimals to calculate the deposit amount in token units.
      const tokenDecimals = await decimals();
      // Deposit 1 token: equal to 1 * 10^(tokenDecimals)
      const depositAmount = (BigInt(1) * (BigInt(10) ** BigInt(tokenDecimals))).toString();
      // Initiate dispute via dispute manager.
      await initiateDispute(txId, respondent, depositAmount);
      await fetchPendingRatings();
    } catch (err) {
      console.error(err);
      setError('Error disputing rating.');
    }
  }

  return (
    <div className="challenges-container">
      <h2 className="challenges-title">Pending Received Ratings</h2>
      
      {loading && (
        <div className="status-message loading">Loading pending ratings...</div>
      )}
      
      {error && (
        <div className="status-message error">{error}</div>
      )}
      
      {(!loading && pendingRatings.length === 0) && (
        <div className="status-message empty">No pending ratings to review.</div>
      )}
      
      {pendingRatings.length > 0 && (
        <ul className="ratings-list">
          {pendingRatings.map((txDetail, index) => {
            // Each txDetail is a tuple: [transactionId, seller, buyer, productId, timestamp, status]
            const txId = txDetail[0];
            
            // Filter sellerScores to display only scores for the current transaction.
            let ratingDetails = [];
            
            if (sellerScores && sellerScores.length) {
              // Try to find scores with matching transactionId
              ratingDetails = sellerScores.filter(score => {
                // If score is an object with a transactionId property
                if (score && typeof score === 'object' && 'transactionId' in score) {
                  return score.transactionId.toString() === txId.toString();
                }
                // If score is an array and the last element might be transactionId
                else if (Array.isArray(score) && score.length >= 7) {
                  return score[6].toString() === txId.toString();
                }
                // If there's no clear transactionId, default to showing all scores
                return true; 
              });
            }
            
            return (
              <li key={index} className="rating-item">
                <div className="rating-header">
                  <span className="transaction-id">Transaction #{txId.toString()}</span>
                  <span className={`transaction-status ${txDetail[5] === 1 ? 'validated' : 'pending'}`}>
                    {txDetail[5] === 1 ? 'Validated' : 'Pending'}
                  </span>
                </div>
                
                <div className="transaction-detail">
                  <span className="detail-label">Product ID:</span>
                  <span className="detail-value">{txDetail[3].toString()}</span>
                </div>
                
                <div className="transaction-detail">
                  <span className="detail-label">Buyer:</span>
                  <span className="detail-value">{txDetail[2]}</span>
                </div>
                
                <div className="rating-details-section">
                  <h4 className="rating-details-title">Ratings Received</h4>
                  {ratingDetails && ratingDetails.length > 0 ? (
                    <ul className="ratings-detail-list">
                      {ratingDetails.map((score, i) => {
                        // Handle different potential score structures
                        let scoreType, scoreValue;
                        
                        if (typeof score === 'object' && !Array.isArray(score)) {
                          // If score is a regular object
                          scoreType = score.scoreType !== undefined ? score.scoreType : 'Unknown';
                            scoreValue = score.value !== undefined ? (Number(score.value) / 1e17).toString() : (score.scoreValue !== undefined ? score.scoreValue : 'N/A');
                        } else if (Array.isArray(score)) {
                          // If score is an array: try to extract scoreType and value from appropriate indices
                          scoreType = score[3] !== undefined ? score[3] : 'Unknown';
                          scoreValue = score[4] !== undefined ? score[4] : 'N/A';
                        }
                        
                        const scoreTypeName = scoreTypeNames[scoreType] || `Type ${scoreType}`;
                        
                        return (
                          <li key={i} className="rating-detail-item">
                            <span className="rating-type">{scoreTypeName}</span>
                            <span className="rating-value">{(Number(scoreValue)/10).toString()}</span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="empty-ratings">No rating details found for this transaction.</p>
                  )}
                </div>
                
                <div className="actions-container">
                  <button 
                    className="action-button acknowledge-button"
                    onClick={() => handleAcknowledge(txId)}
                  >
                    Acknowledge
                  </button>
                  <button 
                    className="action-button dispute-button"
                    onClick={() => handleDispute(txId)}
                  >
                    Dispute
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}