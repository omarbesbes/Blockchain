const { ethers } = require("hardhat");

async function main() {
 

  // Get command line arguments
  const productId = "1";
  const supplierAddress = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65";

  // Replace with your deployed TransactionManager contract address
  const transactionManagerAddress = "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707"; 

  // Get the TransactionManager contract instance.
  // Assumes your contract is compiled and its artifact is available under the name "TransactionManager"
  const transactionManager = await ethers.getContractAt("TransactionManager", transactionManagerAddress);

  console.log(`Checking pending transaction for product id ${productId} and supplier ${supplierAddress}...`);

  // Call the contract view function to get any pending transaction for the given product.
  const pendingTransactionId = await transactionManager.hasPendingTransaction(productId);
  console.log(`Pending transaction ID: ${pendingTransactionId}`);
  // If no pending transaction, the function should return 0
  if (!pendingTransactionId) {
    console.log("No pending transaction found for the given product.");
    return;
  }

  console.log(`Found pending transaction with id: ${pendingTransactionId.toString()}`);

  // Retrieve the transaction details from the contract's public mapping.
  const txn = await transactionManager.transactions(pendingTransactionId);

  // Check if the supplier (seller) matches and if the status is Pending (assumed to be 0)
  if (txn.seller.toLowerCase() === supplierAddress && txn.status.toNumber() === 0) {
    console.log("A pending transaction exists for the given product and supplier.");
  } else {
    console.log("No matching pending transaction for the given product and supplier.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
