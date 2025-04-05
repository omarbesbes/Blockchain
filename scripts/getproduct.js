// scripts/getProductsByOwner.js
const { ethers } = require("hardhat");

async function main() {
  // Replace this with your deployed ProductManager contract address
  const productManagerAddress = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";

  // Get the ProductManager contract factory and attach to the deployed instance
  console.log("Product Manager Address (from script):", productManagerAddress);
  const ProductManager = await ethers.getContractFactory("ProductManager");
  const productManager = ProductManager.attach(productManagerAddress);
  productManager.address = productManagerAddress
  console.log("Attached to ProductManager at:", productManager.address);

  // Define the owner address for which you want to fetch products
  const ownerAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

  // Call the contract's getProductsByOwner function
  const products = await productManager.getProductsByOwner(ownerAddress);
  const type = await productManager.getProductsByOwner(ownerAddress);

  // Log the product IDs (assuming they are BigNumbers)
  console.log("Products owned by", ownerAddress, ":", products.map(id => id.toString()));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
