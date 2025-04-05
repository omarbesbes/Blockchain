const { ethers } = require("hardhat");

async function main() {
  // The factory account is assumed to be the first signer (index 0)
  const factorySigner = await ethers.getSigner("0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65");
  const factoryAccount = await factorySigner.getAddress();

  console.log(`Minting product from factory account ${factoryAccount}...`);

  // Replace with your deployed ProductManager contract address
  const productManagerAddress = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";

  // Get the contract factory and attach to the deployed instance
  const ProductManager = await ethers.getContractFactory("ProductManager");
  const productManager = ProductManager.attach(productManagerAddress);

  // Define metadata URI for the new product
  const metadataURI = "ipfs://test";

  // Call mintProduct from the factory signer
  const tx = await productManager.connect(factorySigner).mintProduct(metadataURI);
  const receipt = await tx.wait();

  console.log("Product minted successfully. Transaction receipt:", receipt);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
