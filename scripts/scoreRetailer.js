// scripts/setManualScore.js
const { ethers } = require("hardhat");

async function main() {
  // Replace with your deployed ScoreEngine contract address
  const scoreEngineAddress = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";

  // Replace with the stakeholder address for which you want to set the score
  const stakeholderAddress = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";

  // Define the score type (0 for TRUST, as an example)
  const scoreType = 4;

  // Define the new score value (for example, 8). 
  // Multiply by PRECISION (1e18) to match the fixed-point format.
  const newScore = ethers.parseUnits("550", 18);

  // Get the ScoreEngine contract factory and attach to the deployed instance
  const ScoreEngine = await ethers.getContractFactory("ScoreEngine");
  const scoreEngine = ScoreEngine.attach(scoreEngineAddress);
  scoreEngine.address = scoreEngineAddress
   console.log("Connected to ScoreEngine at:", scoreEngine.address);

  // Call the setManualScore function (only the contract owner can call this)
  const tx = await scoreEngine.setManualScore(stakeholderAddress, scoreType, newScore);
  console.log("Transaction sent. Waiting for confirmation...");
  await tx.wait();

  console.log(`Manual score set for ${stakeholderAddress} for score type ${scoreType} to 8`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
