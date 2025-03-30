const { expect } = require("chai");
const { ethers } = require("hardhat");

// Helper function to parse logs for a specific event name.
function getEventArgs(receipt, eventName, contractInterface) {
  for (const log of receipt.logs) {
    try {
      const parsedLog = contractInterface.parseLog(log);
      if (parsedLog.name === eventName) {
        return parsedLog.args;
      }
    } catch (e) {
      // Ignore logs that can't be parsed by our contract interface.
    }
  }
  return null;
}

describe("ProductManager", function () {
  let ProductManager, productManager, owner, addr1, addr2, addrs;

  beforeEach(async function () {
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
    ProductManager = await ethers.getContractFactory("ProductManager");
    productManager = await ProductManager.deploy();
    await productManager.waitForDeployment();
  });

  describe("mintProduct", function () {
    it("should mint a new product and set correct details", async function () {
      const metadataURI = "ipfs://testproduct";
      const tx = await productManager.connect(addr1).mintProduct(metadataURI);
      const receipt = await tx.wait();

      // Use our helper to extract the ProductMinted event args.
      const eventArgs = getEventArgs(receipt, "ProductMinted", productManager.interface);
      expect(eventArgs).to.not.be.null;
      const productId = eventArgs.productId;

      // Get product details and verify fields.
      const productDetails = await productManager.getProductDetails(productId);
      expect(productDetails.id).to.equal(productId);
      expect(productDetails.creator).to.equal(addr1.address);
      expect(productDetails.currentOwner).to.equal(addr1.address);
      expect(productDetails.metadataURI).to.equal(metadataURI);
      expect(productDetails.createdAt).to.not.equal(0);
      expect(productDetails.updatedAt).to.not.equal(0);

      // Verify the product history contains only the creator.
      const history = await productManager.getProductHistory(productId);
      expect(history.length).to.equal(1);
      expect(history[0]).to.equal(addr1.address);
    });
  });

  describe("transferProduct", function () {
    it("should transfer product ownership and update history", async function () {
      const metadataURI = "ipfs://testproduct";
      // Mint a product from addr1.
      const mintTx = await productManager.connect(addr1).mintProduct(metadataURI);
      const mintReceipt = await mintTx.wait();
      const mintEventArgs = getEventArgs(mintReceipt, "ProductMinted", productManager.interface);
      const productId = mintEventArgs.productId;

      // Transfer the product from addr1 to addr2.
      await expect(productManager.connect(addr1).transferProduct(addr2.address, productId))
        .to.emit(productManager, "ProductTransferred")
        .withArgs(productId, addr1.address, addr2.address);

      // Verify the new owner and updated history.
      const productDetails = await productManager.getProductDetails(productId);
      expect(productDetails.currentOwner).to.equal(addr2.address);
      const history = await productManager.getProductHistory(productId);
      expect(history.length).to.equal(2);
      expect(history[0]).to.equal(addr1.address);
      expect(history[1]).to.equal(addr2.address);
    });

    it("should revert transfer if caller is not the owner", async function () {
      const metadataURI = "ipfs://testproduct";
      // Mint a product from addr1.
      const mintTx = await productManager.connect(addr1).mintProduct(metadataURI);
      const mintReceipt = await mintTx.wait();
      const mintEventArgs = getEventArgs(mintReceipt, "ProductMinted", productManager.interface);
      const productId = mintEventArgs.productId;

      // Attempt a transfer by addr2 (not the owner); should revert.
      await expect(
        productManager.connect(addr2).transferProduct(addr2.address, productId)
      ).to.be.revertedWith("Caller is not owner of the product");
    });
  });

  describe("updateProductMetadata", function () {
    it("should allow the product creator to update metadata", async function () {
      const metadataURI = "ipfs://oldmetadata";
      const newMetadataURI = "ipfs://newmetadata";
      // Mint a product from addr1.
      const mintTx = await productManager.connect(addr1).mintProduct(metadataURI);
      const mintReceipt = await mintTx.wait();
      const mintEventArgs = getEventArgs(mintReceipt, "ProductMinted", productManager.interface);
      const productId = mintEventArgs.productId;

      // Update metadata from the creator (addr1).
      await expect(
        productManager.connect(addr1).updateProductMetadata(productId, newMetadataURI)
      ).to.emit(productManager, "ProductMetadataUpdated");

      const productDetails = await productManager.getProductDetails(productId);
      expect(productDetails.metadataURI).to.equal(newMetadataURI);
    });

    it("should allow the current owner to update metadata", async function () {
      const metadataURI = "ipfs://oldmetadata";
      const newMetadataURI = "ipfs://updatedmetadata";
      // Mint a product from addr1.
      const mintTx = await productManager.connect(addr1).mintProduct(metadataURI);
      const mintReceipt = await mintTx.wait();
      const mintEventArgs = getEventArgs(mintReceipt, "ProductMinted", productManager.interface);
      const productId = mintEventArgs.productId;

      // Transfer the product from addr1 to addr2.
      await productManager.connect(addr1).transferProduct(addr2.address, productId);
      // Update metadata from the current owner (addr2).
      await expect(
        productManager.connect(addr2).updateProductMetadata(productId, newMetadataURI)
      ).to.emit(productManager, "ProductMetadataUpdated");

      const productDetails = await productManager.getProductDetails(productId);
      expect(productDetails.metadataURI).to.equal(newMetadataURI);
    });

    it("should revert metadata update if caller is not creator or current owner", async function () {
      const metadataURI = "ipfs://oldmetadata";
      const newMetadataURI = "ipfs://newmetadata";
      // Mint a product from addr1.
      const mintTx = await productManager.connect(addr1).mintProduct(metadataURI);
      const mintReceipt = await mintTx.wait();
      const mintEventArgs = getEventArgs(mintReceipt, "ProductMinted", productManager.interface);
      const productId = mintEventArgs.productId;

      // addr2 (unauthorized) tries to update metadata; should revert.
      await expect(
        productManager.connect(addr2).updateProductMetadata(productId, newMetadataURI)
      ).to.be.revertedWith("Not authorized to update metadata");
    });
  });

  describe("getProductDetails and getProductHistory", function () {
    it("should revert if product does not exist", async function () {
      await expect(productManager.getProductDetails(9999)).to.be.revertedWith("Product does not exist");
      await expect(productManager.getProductHistory(9999)).to.be.revertedWith("Product does not exist");
    });
  });
});
