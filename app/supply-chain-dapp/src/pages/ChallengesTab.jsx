import React, { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useTransactionManager } from '../hooks/useTransactionManager';
import { useDisputeManager } from '../hooks/useDisputeManager';
import { useToken } from '../hooks/useToken';
import './ChallengesTab.css';

// Helper mapping from score type IDs to human-readable names
const scoreTypeNames = {
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

// Enum for dispute outcomes
const DisputeOutcome = {
  PENDING: 0,
  RESPONDENT_WINS: 1,
  CHALLENGER_WINS: 2,
};

export default function ChallengesTab() {
  const DEPOSIT_AMOUNT = 1; 

  const { address } = useAccount();
  const {
    getPendingRatedTransactions,
    getTransaction,
    updateRatingStatus,
    getBuyersForSeller,
    isSellerRated,
    getTransactionScore,
    isScoreTypeProcessed,
  } = useTransactionManager();
  const { 
    initiateDispute, 
    recordPurchase,
    voteDispute,
    respondToDispute,
    getDisputeDetails,
    getEligibleDisputes,
    getUserDisputes,
    getRespondentDisputes,
    finalizeDispute,
    hasActiveDispute
  } = useDisputeManager();
  const { decimals } = useToken();

  const [individualRatings, setIndividualRatings] = useState([]);
  const [eligibleDisputes, setEligibleDisputes] = useState([]);
  const [myDisputes, setMyDisputes] = useState([]);
  const [respondToDisputes, setRespondToDisputes] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [disputesLoading, setDisputesLoading] = useState(false);
  const [myDisputesLoading, setMyDisputesLoading] = useState(false);
  const [respondDisputesLoading, setRespondDisputesLoading] = useState(false);
  const [processingDispute, setProcessingDispute] = useState(false);
  const [processingRatingId, setProcessingRatingId] = useState(null);
  const [votingDisputeId, setVotingDisputeId] = useState(null);
  const [respondingDisputeId, setRespondingDisputeId] = useState(null);
  const [finalizingDisputeId, setFinalizingDisputeId] = useState(null);

  // When address changes, load all relevant data
  useEffect(() => {
    if (address) {
      fetchPendingRatings();
      fetchEligibleDisputes();
      fetchMyDisputes();
      fetchRespondToDisputes();
    }
  }, [address]);

  // Set up a refresh interval for disputes to update time remaining
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (address) {
        fetchMyDisputes();
        fetchEligibleDisputes();
      }
    }, 60000); // update every minute
    return () => clearInterval(intervalId);
  }, [address]);


  // Fetch disputes initiated by the current user (challenger)
  async function fetchMyDisputes() {
    setMyDisputesLoading(true);
    try {
      const userDisputeIds = await getUserDisputes(address);
      if (userDisputeIds.length === 0) {
        setMyDisputes([]);
        setMyDisputesLoading(false);
        return;
      }
      const disputeDetailsPromises = userDisputeIds.map(async (disputeId) => {
        try {
          const disputeDetails = await getDisputeDetails(disputeId);
          const txId = disputeDetails[1]; // ratingId stored here
          const scoreType = disputeDetails[13]; 
          let scoreValue = null;
          try {
            scoreValue = await getTransactionScore(txId, scoreType, false);
          } catch (error) {
            console.error(`Error getting score value for txId ${txId}, scoreType ${scoreType}:`, error);
          }
          const now = Math.floor(Date.now() / 1000);
          const canFinalize = !disputeDetails[12] && disputeDetails[7] && now > Number(disputeDetails[6]);
          return {
            disputeId: disputeDetails[0].toString(),
            ratingId: txId.toString(),
            challenger: disputeDetails[2],
            respondent: disputeDetails[3],
            votingDeadline: disputeDetails[6].toString(),
            depositsComplete: disputeDetails[7],
            outcome: disputeDetails[8],
            votesForRespondent: disputeDetails[9].toString(),
            votesForChallenger: disputeDetails[10].toString(),
            finalized: disputeDetails[12],
            canFinalize,
            scoreType,
            scoreTypeName: scoreTypeNames[scoreType] || 'Unknown',
            scoreValue,
          };
        } catch (error) {
          console.error(`Error fetching details for dispute ${disputeId}:`, error);
          return null;
        }
      });
      const disputeDetails = await Promise.all(disputeDetailsPromises);
      setMyDisputes(disputeDetails.filter(Boolean));
    } catch (err) {
      console.error("Error fetching user disputes:", err);
      setError('Failed to load your disputes.');
    }
    setMyDisputesLoading(false);
  }

  // Fetch disputes where the current user is the respondent (disputes against your ratings)
  async function fetchRespondToDisputes() {
    setRespondDisputesLoading(true);
    try {
      const disputeIds = await getRespondentDisputes(address);
      console.log(`Disputes where ${address} is the respondent:`, disputeIds.length);
      if (disputeIds.length === 0) {
        setRespondToDisputes([]);
        setRespondDisputesLoading(false);
        return;
      }
      const disputeDetailsPromises = disputeIds.map(async (disputeId) => {
        try {
          const disputeDetails = await getDisputeDetails(disputeId);
          const txId = disputeDetails[1]; // ratingId is at index 1
          const scoreType = disputeDetails[13]; // scoreType is at index 13
          let scoreValue = null;
          try {
            scoreValue = await getTransactionScore(txId, scoreType, false);
          } catch (error) {
            console.error(`Error getting score value for txId ${txId}, scoreType ${scoreType}:`, error);
          }
          return {
            disputeId: disputeDetails[0].toString(),
            ratingId: txId.toString(),
            challenger: disputeDetails[2],
            respondent: disputeDetails[3],
            depositChallenger: disputeDetails[4].toString(),
            votingDeadline: disputeDetails[6].toString(),
            depositsComplete: disputeDetails[7],
            scoreType,
            scoreTypeName: scoreTypeNames[scoreType] || 'Unknown',
            scoreValue,
          };
        } catch (error) {
          console.error(`Error fetching details for dispute ${disputeId}:`, error);
          return null;
        }
      });
      const disputeDetails = await Promise.all(disputeDetailsPromises);
      setRespondToDisputes(disputeDetails.filter(Boolean));
    } catch (err) {
      console.error("Error fetching disputes to respond to:", err);
      setError('Failed to load disputes requiring your response.');
    }
    setRespondDisputesLoading(false);
  }

  // Fetch pending ratings (unprocessed score types)
  async function fetchPendingRatings() {
    setLoading(true);
    setError('');
    try {
      const pendingTxIds = await getPendingRatedTransactions(address);
      const processedRatings = new Set();
      const allIndividualRatings = [];
      for (const txId of pendingTxIds) {
        const txDetail = await getTransaction(txId);
        const buyer = txDetail[2];
        const productId = txDetail[3];
        const timestamp = txDetail[4];
        const status = txDetail[5];
        for (let scoreType = 0; scoreType <= 11; scoreType++) {
          try {
            const ratingKey = `${txId}-${scoreType}`;
            if (processedRatings.has(ratingKey)) continue;
            processedRatings.add(ratingKey);
            const wasRated = await isSellerRated(txId, scoreType);
            if (wasRated) {
              const isProcessed = await isScoreTypeProcessed(txId, scoreType);
              if (!isProcessed) {
                try {
                  const scoreValue = await getTransactionScore(txId, scoreType, false);
                  allIndividualRatings.push({
                    ratingId: ratingKey,
                    txId: txId.toString(),
                    buyer,
                    productId,
                    timestamp,
                    status,
                    scoreType,
                    scoreTypeName: scoreTypeNames[scoreType],
                    scoreValue,
                  });
                } catch (scoreErr) {
                  console.error(`Error fetching score value for txId ${txId}, scoreType ${scoreType}:`, scoreErr);
                }
              }
            }
          } catch (err) {
            console.error(`Error checking if score type ${scoreType} was rated for txId ${txId}:`, err);
          }
        }
      }
      setIndividualRatings(allIndividualRatings);
    } catch (err) {
      console.error(err);
      setError('Failed to load pending ratings.');
    }
    setLoading(false);
  }

  // Fetch disputes eligible for voting
  async function fetchEligibleDisputes() {
    setDisputesLoading(true);
    try {
      const disputeIds = await getEligibleDisputes(address);
      if (disputeIds.length === 0) {
        setEligibleDisputes([]);
        setDisputesLoading(false);
        return;
      }
      const disputeDetailsPromises = disputeIds.map(async (disputeId) => {
        try {
          const disputeDetails = await getDisputeDetails(disputeId);
          const txId = disputeDetails[1];
          const scoreType = disputeDetails[13]; 
          const challenger = disputeDetails[2];
          const respondent = disputeDetails[3];
          const userIsParticipant = (
            challenger.toLowerCase() === address.toLowerCase() ||
            respondent.toLowerCase() === address.toLowerCase()
          );
          if (userIsParticipant) return null;
          let scoreValue = null;
          for (let i = 0; i <= 11; i++) {
            try {
              const wasRated = await isSellerRated(txId, i);
              if (wasRated) {
                scoreValue = await getTransactionScore(txId, scoreType, false);
                break;
              }
            } catch (error) {
              console.error(`Error checking score type ${i} for txId ${txId}:`, error);
            }
          }
          const now = Math.floor(Date.now() / 1000);
          const isVotingActive = now < Number(disputeDetails[6]);
          return {
            disputeId: disputeDetails[0].toString(),
            ratingId: txId.toString(),
            challenger: disputeDetails[2],
            respondent: disputeDetails[3],
            votingDeadline: disputeDetails[6].toString(),
            votesForRespondent: disputeDetails[9].toString(),
            votesForChallenger: disputeDetails[10].toString(),
            scoreType,
            scoreTypeName: scoreTypeNames[scoreType] || 'Unknown',
            scoreValue,
            txId: txId.toString(),
            isVotingActive,
          };
        } catch (error) {
          console.error(`Error fetching details for dispute ${disputeId}:`, error);
          return null;
        }
      });
      const disputeDetails = await Promise.all(disputeDetailsPromises);
      setEligibleDisputes(
        disputeDetails.filter(Boolean).filter(dispute => dispute.isVotingActive)
      );
    } catch (err) {
      console.error("Error fetching eligible disputes:", err);
      setError('Failed to load eligible disputes.');
    }
    setDisputesLoading(false);
  }


  async function handleAcknowledge(ratingId, scoreType) {
    setError('');
    setProcessingRatingId(ratingId);
    try {
      const txId = ratingId.split('-')[0];
      await updateRatingStatus(txId, scoreType, true);
      setIndividualRatings(prev => prev.filter(rating => rating.ratingId !== ratingId));
    } catch (err) {
      console.error(err);
      setError('Error acknowledging rating.');
      await fetchPendingRatings();
    } finally {
      setProcessingRatingId(null);
    }
  }

  async function handleDispute(ratingId, scoreType) {
    setError('');
    setProcessingDispute(true);
    setProcessingRatingId(ratingId);
    try {
      const txId = ratingId.split('-')[0];
      await updateRatingStatus(txId, scoreType, false);
      const txDetail = await getTransaction(txId);
      const respondent = txDetail[2];
      const tokenDecimals = await decimals();
      const depositAmount = (BigInt(1) * (BigInt(10) ** BigInt(tokenDecimals))).toString();
      
      // Check if there's already an active dispute for this rating and score type
      const hasDispute = await hasActiveDispute(txId, scoreType);
      if (hasDispute) {
        setError(`A dispute already exists for ${scoreTypeNames[scoreType]} score in this transaction`);
        return;
      }
      
      const buyers = await getBuyersForSeller(address);
      console.log(`All previous buyers for ${scoreTypeNames[scoreType]} rating:`, buyers);
      // Pass scoreType to initiateDispute 
      await initiateDispute(txId, scoreType, respondent, depositAmount);
      for (const buyer of buyers) {
        if (buyer !== respondent) {
          try {
            await recordPurchase(buyer, address);
            console.log(`Recorded purchase history between ${buyer} and ${address}`);
          } catch (recordErr) {
            console.error(`Failed to record purchase for buyer ${buyer}:`, recordErr);
          }
        }
      }
      setIndividualRatings(prev => prev.filter(rating => rating.ratingId !== ratingId));
      fetchMyDisputes();
    } catch (err) {
      console.error(err);
      setError('Error disputing rating: ' + (err.message || err.toString()));
      await fetchPendingRatings();
    } finally {
      setProcessingDispute(false);
      setProcessingRatingId(null);
    }
  }

  async function handleDisputeVote(disputeId, voteForRespondent) {
    setVotingDisputeId(disputeId);
    try {
      await voteDispute(disputeId, voteForRespondent);
      setEligibleDisputes(prev => prev.filter(dispute => dispute.disputeId !== disputeId));
    } catch (err) {
      console.error(`Error voting on dispute ${disputeId}:`, err);
      setError(`Error voting on dispute: ${err.message || err.toString()}`);
      await fetchEligibleDisputes();
    } finally {
      setVotingDisputeId(null);
    }
  }

  async function handleRespondToDispute(disputeId) {
    setRespondingDisputeId(disputeId);
    try {
      const tokenDecimals = await decimals();
      const depositAmount = (BigInt(1) * (BigInt(10) ** BigInt(tokenDecimals))).toString();
      await respondToDispute(disputeId, depositAmount);
      setRespondToDisputes(prev => prev.filter(dispute => dispute.disputeId !== disputeId));
      fetchRespondToDisputes();
    } catch (err) {
      console.error(`Error responding to dispute ${disputeId}:`, err);
      setError(`Error responding to dispute: ${err.message || err.toString()}`);
    } finally {
      setRespondingDisputeId(null);
    }
  }

  async function handleFinalizeDispute(disputeId) {
    setFinalizingDisputeId(disputeId);
    try {
      await finalizeDispute(disputeId);
      await fetchMyDisputes();
    } catch (err) {
      console.error(`Error finalizing dispute ${disputeId}:`, err);
      setError(`Error finalizing dispute: ${err.message || err.toString()}`);
    } finally {
      setFinalizingDisputeId(null);
    }
  }


  const formatDate = (timestamp) => {
    const date = new Date(Number(timestamp) * 1000);
    return date.toLocaleString();
  };

  const getScoreColorClass = (scoreValue) => {
    const score = Number(scoreValue) || 0;
    if (score <= 2) return 'score-very-low';
    if (score <= 4) return 'score-low';
    if (score <= 6) return 'score-medium';
    if (score <= 8) return 'score-high';
    return 'score-very-high';
  };

  const formatAddress = (address) => {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  const getRemainingTime = (deadline) => {
    const deadlineDate = new Date(Number(deadline) * 1000);
    const timeRemaining = deadlineDate - new Date();
    if (timeRemaining <= 0) {
      return { expired: true, text: 'Voting Period Ended' };
    }
    const daysRemaining = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
    const hoursRemaining = Math.floor((timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
    let text = '';
    if (daysRemaining > 0) text += `${daysRemaining}d `;
    if (hoursRemaining > 0 || daysRemaining > 0) text += `${hoursRemaining}h `;
    text += `${minutesRemaining}m`;
    return { expired: false, text: text + ' remaining' };
  };

  const getOutcomeText = (outcome, isChallenger) => {
    switch (Number(outcome)) {
      case DisputeOutcome.PENDING:
        return 'Pending';
      case DisputeOutcome.RESPONDENT_WINS:
        return isChallenger ? 'You Lost' : 'Respondent Won';
      case DisputeOutcome.CHALLENGER_WINS:
        return isChallenger ? 'You Won!' : 'Challenger Won';
      default:
        return 'Unknown';
    }
  };

  const getOutcomeClass = (outcome, isChallenger) => {
    switch (Number(outcome)) {
      case DisputeOutcome.PENDING:
        return 'outcome-pending';
      case DisputeOutcome.RESPONDENT_WINS:
        return isChallenger ? 'outcome-lost' : 'outcome-respondent-won';
      case DisputeOutcome.CHALLENGER_WINS:
        return isChallenger ? 'outcome-won' : 'outcome-challenger-won';
      default:
        return '';
    }
  };

  return (
    <div className="challenges-container">
      {/* Disputes Against My Ratings (where you're respondent) */}
      <section className="respond-disputes-section">
        <h2 className="section-title">Disputes Against My Ratings</h2>
        {respondDisputesLoading && (
          <div className="status-message loading">Loading disputes requiring your response...</div>
        )}
        {(!respondDisputesLoading && respondToDisputes.length === 0) && (
          <div className="status-message empty">No disputes require your response.</div>
        )}
        {respondToDisputes.length > 0 && (
          <ul className="disputes-list response-disputes-list">
            {respondToDisputes.map((dispute) => {
              const isResponding = respondingDisputeId === dispute.disputeId;
              const timeInfo = getRemainingTime(dispute.votingDeadline);
              return (
                <li key={dispute.disputeId} className="dispute-item respond-dispute">
                  <div className="dispute-header">
                    <div className="dispute-header-left">
                      <span className="dispute-id">Dispute #{dispute.disputeId}</span>
                      <span className="dispute-status-badge respond">Action Required</span>
                    </div>
                    <span className={`dispute-deadline ${timeInfo.expired ? 'expired' : ''}`}>
                      {timeInfo.text}
                    </span>
                  </div>
                  <div className="dispute-details-container">
                    <div className="dispute-challenge-details">
                      <h4 className="dispute-challenge-title">Dispute Challenge</h4>
                      <div className="dispute-party challenger-detail">
                        <span className="party-label">Challenger:</span>
                        <span className="party-address" title={dispute.challenger}>
                          {formatAddress(dispute.challenger)}
                        </span>
                      </div>
                      <p className="dispute-explanation">
                        The seller disputes your rating as unfair.
                      </p>
                    </div>
                    <div className="disputed-rating">
                      <h4 className="rating-title">Your Challenged Rating</h4>
                      <div className="rating-detail-item highlight-rating">
                        <div className="rating-type-container">
                          <span className="rating-type-label">Score Category:</span>
                          <span className="rating-type-value">{dispute.scoreTypeName}</span>
                        </div>
                        <div className="rating-score-container">
                          <span className="rating-score-label">Your Rating:</span>
                          <span className={`rating-score-value ${getScoreColorClass(dispute.scoreValue)}`}>
                            {dispute.scoreValue !== null ? `${dispute.scoreValue} / 10` : 'Value unavailable'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="deposit-info">
                      <h4 className="deposit-title">Deposit Required</h4>
                      <p className="deposit-explanation">
                        To respond, you must deposit {DEPOSIT_AMOUNT} ETH. If voters side with you, you'll get your deposit back plus a share of the challenger's deposit.
                      </p>
                      <div className="deposit-status">
                        <span className="status-label">Challenger has deposited:</span>
                        <span className="status-value">{DEPOSIT_AMOUNT} ETH</span>
                      </div>
                    </div>
                  </div>
                  <div className="respond-actions">
                    <button 
                      className="action-button respond-button"
                      onClick={() => handleRespondToDispute(dispute.disputeId)}
                      disabled={respondingDisputeId === dispute.disputeId || timeInfo.expired}
                    >
                      {respondingDisputeId === dispute.disputeId ? 'Processing...' : `Respond with ${DEPOSIT_AMOUNT} ETH Deposit`}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Pending Ratings Section */}
      <section className="pending-ratings-section">
        <h2 className="section-title">Pending Received Ratings</h2>
        {loading && <div className="status-message loading">Loading pending ratings...</div>}
        {error && <div className="status-message error">{error}</div>}
        {(!loading && individualRatings.length === 0) && (
          <div className="status-message empty">No pending ratings to review.</div>
        )}
        {individualRatings.length > 0 && (
          <ul className="ratings-list">
            {individualRatings.map((rating) => {
              const isProcessing = processingRatingId === rating.ratingId;
              return (
                <li key={rating.ratingId} className="rating-item">
                  <div className="rating-header">
                    <span className="transaction-id">Transaction #{rating.txId}</span>
                    <span className={`transaction-status ${rating.status === 1 ? 'validated' : 'pending'}`}>
                      {rating.status === 1 ? 'Validated' : 'Pending'}
                    </span>
                  </div>
                  <div className="transaction-details-container">
                    <div className="transaction-detail">
                      <span className="detail-label">Product ID:</span>
                      <span className="detail-value">{rating.productId.toString()}</span>
                    </div>
                    <div className="transaction-detail">
                      <span className="detail-label">Buyer:</span>
                      <span className="detail-value address-value">{formatAddress(rating.buyer)}</span>
                    </div>
                    <div className="transaction-detail">
                      <span className="detail-label">Date:</span>
                      <span className="detail-value">{formatDate(rating.timestamp)}</span>
                    </div>
                  </div>
                  <div className="rating-details-section">
                    <h4 className="rating-details-title">Rating Details</h4>
                    <div className="rating-detail-item highlight-rating">
                      <div className="rating-type-container">
                        <span className="rating-type-label">Score Category:</span>
                        <span className="rating-type-value">{rating.scoreTypeName}</span>
                      </div>
                      <div className="rating-score-container">
                        <span className="rating-score-label">Score Value:</span>
                        <span className={`rating-score-value ${getScoreColorClass(rating.scoreValue)}`}>
                          {rating.scoreValue !== null ? `${rating.scoreValue} / 10` : 'Value unavailable'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="actions-container">
                    <button
                      className="action-button acknowledge-button"
                      onClick={() => handleAcknowledge(rating.ratingId, rating.scoreType)}
                      disabled={processingDispute || isProcessing}
                    >
                      {isProcessing && !processingDispute ? 'Processing...' : 'Acknowledge'}
                    </button>
                    <button
                      className="action-button dispute-button"
                      onClick={() => handleDispute(rating.ratingId, rating.scoreType)}
                      disabled={processingDispute || isProcessing}
                    >
                      {isProcessing && processingDispute ? 'Processing...' : `Dispute ${rating.scoreTypeName} Score`}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* My Active Disputes Section */}
      <section className="my-disputes-section">
        <h2 className="section-title">My Active Disputes</h2>
        {myDisputesLoading && <div className="status-message loading">Loading your disputes...</div>}
        {(!myDisputesLoading && myDisputes.length === 0) && (
          <div className="status-message empty">You have not initiated any disputes.</div>
        )}
        {myDisputes.length > 0 && (
          <ul className="disputes-list my-disputes-list">
            {myDisputes.map((dispute) => {
              const timeInfo = getRemainingTime(dispute.votingDeadline);
              const isProcessingFinalize = finalizingDisputeId === dispute.disputeId;
              return (
                <li key={dispute.disputeId} className="dispute-item my-dispute">
                  <div className="dispute-header">
                    <div className="dispute-header-left">
                      <span className="dispute-id">Dispute #{dispute.disputeId}</span>
                      <span className={`dispute-status-badge ${dispute.finalized ? 'finalized' : timeInfo.expired ? 'expired' : 'active'}`}>
                        {dispute.finalized ? 'Finalized' : timeInfo.expired ? 'Ready to Finalize' : 'Active'}
                      </span>
                    </div>
                    {!dispute.finalized && (
                      <span className={`dispute-deadline ${timeInfo.expired ? 'expired' : ''}`}>
                        {timeInfo.text}
                      </span>
                    )}
                  </div>
                  <div className="dispute-details-container">
                    <div className="dispute-parties">
                      <div className="dispute-party">
                        <span className="party-label">Challenger (You):</span>
                        <span className="party-address" title={dispute.challenger}>{formatAddress(dispute.challenger)}</span>
                      </div>
                      <div className="dispute-party">
                        <span className="party-label">Respondent:</span>
                        <span className="party-address" title={dispute.respondent}>{formatAddress(dispute.respondent)}</span>
                      </div>
                    </div>
                    <div className="dispute-status">
                      <span className="status-label">Current Votes:</span>
                      <div className="votes-container">
                        <div className="votes-bar-container">
                          <div 
                            className="votes-bar challenger"
                            style={{
                              width: `${Number(dispute.votesForChallenger) > 0 ? 
                                Math.max(
                                  Number(dispute.votesForChallenger) / (Number(dispute.votesForChallenger) + Number(dispute.votesForRespondent)) * 100, 
                                  10
                                ) : 0}%`
                            }}
                          >
                            <span className="votes-count">{dispute.votesForChallenger}</span>
                          </div>
                          <div 
                            className="votes-bar respondent"
                            style={{
                              width: `${Number(dispute.votesForRespondent) > 0 ? 
                                Math.max(
                                  Number(dispute.votesForRespondent) / (Number(dispute.votesForChallenger) + Number(dispute.votesForRespondent)) * 100, 
                                  10
                                ) : 0}%`
                            }}
                          >
                            <span className="votes-count">{dispute.votesForRespondent}</span>
                          </div>
                        </div>
                        <div className="votes-legend">
                          <span className="votes-legend-item challenger">Support for You</span>
                          <span className="votes-legend-item respondent">Support for Respondent</span>
                        </div>
                      </div>
                    </div>
                    <div className="disputed-score-container">
                      <div className="disputed-score">
                        <span className="score-label">Disputed {dispute.scoreTypeName} Score:</span>
                        <span className={`score-value ${getScoreColorClass(dispute.scoreValue)}`}>
                          {dispute.scoreValue !== null ? `${dispute.scoreValue} / 10` : 'Value unavailable'}
                        </span>
                      </div>
                      {dispute.finalized && (
                        <div className="dispute-outcome-container">
                          <h4 className="outcome-title">Dispute Outcome</h4>
                          <div className={`dispute-outcome ${getOutcomeClass(dispute.outcome, true)}`}>
                            {getOutcomeText(dispute.outcome, true)}
                          </div>
                          {dispute.outcome === DisputeOutcome.CHALLENGER_WINS && (
                            <p className="outcome-detail positive">The disputed score has been invalidated, and you received your deposit back plus compensation.</p>
                          )}
                          {dispute.outcome === DisputeOutcome.RESPONDENT_WINS && (
                            <p className="outcome-detail negative">The disputed score stands, and your deposit has been distributed to the respondent and voters.</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {!dispute.finalized && dispute.canFinalize && (
                    <div className="dispute-actions">
                      <button 
                        className="action-button finalize-button"
                        onClick={() => handleFinalizeDispute(dispute.disputeId)}
                        disabled={finalizingDisputeId === dispute.disputeId}
                      >
                        {finalizingDisputeId === dispute.disputeId ? 'Processing...' : 'Finalize Dispute'}
                      </button>
                    </div>
                  )}
                  {!dispute.finalized && !dispute.depositsComplete && (
                    <div className="dispute-notice">
                      <p className="notice-text">Waiting for respondent to deposit their stake.</p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Disputes to Vote On Section */}
      <section className="vote-disputes-section">
        <h2 className="section-title">Disputes to Vote On</h2>
        {disputesLoading && <div className="status-message loading">Loading eligible disputes...</div>}
        {(!disputesLoading && eligibleDisputes.length === 0) && (
          <div className="status-message empty">No disputes available for voting.</div>
        )}
        {eligibleDisputes.length > 0 && (
          <ul className="disputes-list">
            {eligibleDisputes.map((dispute) => {
              const isVoting = votingDisputeId === dispute.disputeId;
              const timeInfo = getRemainingTime(dispute.votingDeadline);
              return (
                <li key={dispute.disputeId} className="dispute-item">
                  <div className="dispute-header">
                    <span className="dispute-id">Dispute #{dispute.disputeId}</span>
                    <span className={`dispute-deadline ${timeInfo.expired ? 'expired' : ''}`}>
                      {timeInfo.text}
                    </span>
                  </div>
                  <div className="dispute-details-container">
                    <div className="dispute-parties">
                      <div className="dispute-party">
                        <span className="party-label">Challenger:</span>
                        <span className="party-address" title={dispute.challenger}>{formatAddress(dispute.challenger)}</span>
                      </div>
                      <div className="dispute-party">
                        <span className="party-label">Respondent:</span>
                        <span className="party-address" title={dispute.respondent}>{formatAddress(dispute.respondent)}</span>
                      </div>
                    </div>
                    <div className="dispute-status">
                      <span className="status-label">Current votes:</span>
                      <span className="status-value">
                        {dispute.votesForRespondent} for respondent, {dispute.votesForChallenger} for challenger
                      </span>
                    </div>
                    <div className="disputed-score">
                      <span className="score-label">Disputed {dispute.scoreTypeName} Score:</span>
                      <span className={`score-value ${getScoreColorClass(dispute.scoreValue)}`}>
                        {dispute.scoreValue !== null ? `${dispute.scoreValue} / 10` : 'Value unavailable'}
                      </span>
                    </div>
                  </div>
                  <div className="voting-actions">
                    <button 
                      className="voting-button accept-score"
                      onClick={() => handleDisputeVote(dispute.disputeId, true)}
                      disabled={isVoting || timeInfo.expired}
                    >
                      {isVoting ? 'Voting...' : 'Score is Fair (Support Respondent)'}
                    </button>
                    <button 
                      className="voting-button reject-score"
                      onClick={() => handleDisputeVote(dispute.disputeId, false)}
                      disabled={isVoting || timeInfo.expired}
                    >
                      {isVoting ? 'Voting...' : 'Score is Unfair (Support Challenger)'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
