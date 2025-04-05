// src/pages/ChallengesTab.jsx
import React, { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useDisputeManager } from '../hooks/useDisputeManager';
// import './ChallengesTab.css';

export default function ChallengesTab() {
  const { address } = useAccount();
  const {
    getScoresAgainstYou,
    challengeScore,
    getOngoingChallenges,
    acknowledgeChallenge,
    denyChallenge,
  } = useDisputeManager();

  const [scores, setScores] = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [loadingScores, setLoadingScores] = useState(false);
  const [loadingChallenges, setLoadingChallenges] = useState(false);
  const [error, setError] = useState(null);

  // Fetch scores where you have been scored
  useEffect(() => {
    async function fetchScores() {
      setLoadingScores(true);
      try {
        const data = await getScoresAgainstYou(address);
        setScores(data);
      } catch (err) {
        console.error(err);
        setError("Failed to fetch scores");
      }
      setLoadingScores(false);
    }
    async function fetchChallenges() {
      setLoadingChallenges(true);
      try {
        const data = await getOngoingChallenges(address);
        setChallenges(data);
      } catch (err) {
        console.error(err);
        setError("Failed to fetch challenges");
      }
      setLoadingChallenges(false);
    }
    if (address) {
      fetchScores();
      fetchChallenges();
    }
  }, [address, getScoresAgainstYou, getOngoingChallenges]);

  // Initiate a challenge against a score
  const handleChallengeScore = async (scoreId, scorer) => {
    try {
      await challengeScore(scoreId, scorer);
      alert("Challenge initiated successfully");
      // Optionally, refresh the challenges list after initiating a challenge
      const updatedChallenges = await getOngoingChallenges(address);
      setChallenges(updatedChallenges);
    } catch (err) {
      console.error(err);
      alert("Failed to initiate challenge");
    }
  };

  // For buyers of a disputed seller, acknowledge the challenged score
  const handleAcknowledge = async (challengeId) => {
    try {
      await acknowledgeChallenge(challengeId);
      alert("Challenge acknowledged");
      const updatedChallenges = await getOngoingChallenges(address);
      setChallenges(updatedChallenges);
    } catch (err) {
      console.error(err);
      alert("Failed to acknowledge challenge");
    }
  };

  // For buyers of a disputed seller, deny the challenged score
  const handleDeny = async (challengeId) => {
    try {
      await denyChallenge(challengeId);
      alert("Challenge denied");
      const updatedChallenges = await getOngoingChallenges(address);
      setChallenges(updatedChallenges);
    } catch (err) {
      console.error(err);
      alert("Failed to deny challenge");
    }
  };

  return (
    <div className="challenges-tab-container">
      <h2>Challenges</h2>
      {error && <p className="error">{error}</p>}

      <section className="scores-section">
        <h3>Scores Received</h3>
        {loadingScores ? (
          <p>Loading scores...</p>
        ) : scores.length === 0 ? (
          <p>No scores received.</p>
        ) : (
          <ul className="score-list">
            {scores.map((score) => (
              <li key={score.scoreId} className="score-item">
                <p>
                  <strong>Score ID:</strong> {score.scoreId}
                </p>
                <p>
                  <strong>Scorer:</strong> {score.scorer}
                </p>
                <p>
                  <strong>Value:</strong> {score.value}
                </p>
                <button onClick={() => handleChallengeScore(score.scoreId, score.scorer)}>
                  Challenge Score
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="challenges-section">
        <h3>Ongoing Challenges</h3>
        {loadingChallenges ? (
          <p>Loading challenges...</p>
        ) : challenges.length === 0 ? (
          <p>No ongoing challenges.</p>
        ) : (
          <ul className="challenge-list">
            {challenges.map((challenge) => (
              <li key={challenge.id} className="challenge-item">
                <p>
                  <strong>Challenge ID:</strong> {challenge.id}
                </p>
                <p>
                  <strong>Score ID:</strong> {challenge.scoreId}
                </p>
                <p>
                  <strong>Challenger:</strong> {challenge.challenger}
                </p>
                <p>
                  <strong>Status:</strong> {challenge.status}
                </p>
                <div className="challenge-actions">
                  <button onClick={() => handleAcknowledge(challenge.id)}>Acknowledge</button>
                  <button onClick={() => handleDeny(challenge.id)}>Deny</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
