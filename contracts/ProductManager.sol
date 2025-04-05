// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ProductManager
 * @dev Manages the creation, transfer, and tracking of product NFTs in the supply chain.
 */
contract ProductManager is ERC721, Ownable {

    
    // Simple counter variable for unique product IDs
    uint256 private _productCounter;

    // Structure representing product details
    struct Product {
        uint256 id;              // Unique identifier for the product
        address creator;         // Address that minted/created the product
        string metadataURI;      // URI pointing to off-chain metadata (e.g., IPFS/Arweave)
        address currentOwner;    // Current owner of the product
        uint256 createdAt;       // Timestamp when the product was created
        uint256 updatedAt;       // Timestamp when the product was last updated
    }

    // Mapping from product ID to Product struct
    mapping(uint256 => Product) public products;
    // Mapping from product ID to an array of addresses representing its ownership history
    mapping(uint256 => address[]) public productHistory;

    // Events to emit when key actions occur
    event ProductMinted(uint256 indexed productId, address indexed creator, string metadataURI);
    event ProductTransferred(uint256 indexed productId, address indexed from, address indexed to);
    event ProductMetadataUpdated(uint256 indexed productId, string oldMetadata, string newMetadataURI);

    /**
     * @dev Constructor sets the token name, symbol, and initial owner.
     */
    constructor() ERC721("ProductNFT", "PNFT") Ownable(msg.sender) {}

    /**
     * @notice Mints a new product token.
     * @param _metadataURI The URI containing product details (e.g., IPFS/Arweave link).
     * @return productId The unique ID of the newly minted product.
     *
     * Requirements:
     * - The caller becomes the creator and initial owner of the product.
     * - A new NFT is minted representing the product.
     */
    function mintProduct(string calldata _metadataURI) external returns (uint256 productId) {
        // Increment the counter for a new product ID.
        _productCounter++;
        productId = _productCounter;

        // Mint the NFT safely to the caller's address.
        _safeMint(msg.sender, productId);

        // Initialize the product details
        products[productId] = Product({
            id: productId,
            creator: msg.sender,
            metadataURI: _metadataURI,
            currentOwner: msg.sender,
            createdAt: block.timestamp,
            updatedAt: block.timestamp
        });

        // Record the initial owner in the product history.
        productHistory[productId].push(msg.sender);

        emit ProductMinted(productId, msg.sender, _metadataURI);
    }

    /**
     * @notice Transfers product ownership to a new address.
     * @param _to The recipient address.
     * @param _productId The ID of the product to transfer.
     *
     * Requirements:
     * - The caller must be the current owner of the product.
     * - The recipient address must be valid.
     */
    function transferProduct(address _to, uint256 _productId) external {
        require(ownerOf(_productId) == msg.sender, "Caller is not owner of the product");
        require(_to != address(0), "Invalid recipient address");

        // Use ERC721's safeTransferFrom to perform the transfer.
        safeTransferFrom(msg.sender, _to, _productId);

        // Update product details: new current owner and update the timestamp.
        products[_productId].currentOwner = _to;
        products[_productId].updatedAt = block.timestamp;

        // Append the new owner to the product history.
        productHistory[_productId].push(_to);

        emit ProductTransferred(_productId, msg.sender, _to);
    }

    /**
     * @notice Retrieves the details of a specific product.
     * @param _productId The ID of the product.
     * @return A Product struct containing all product details.
     *
     * Requirements:
     * - The product must exist (its createdAt timestamp is non-zero).
     */
    function getProductDetails(uint256 _productId) external view returns (Product memory) {
        require(products[_productId].createdAt != 0, "Product does not exist");
        return products[_productId];
    }

    /**
     * @notice Retrieves the ownership history of a product.
     * @param _productId The ID of the product.
     * @return An array of addresses representing the product's ownership history.
     *
     * Requirements:
     * - The product must exist (its createdAt timestamp is non-zero).
     */
    function getProductHistory(uint256 _productId) external view returns (address[] memory) {
        require(products[_productId].createdAt != 0, "Product does not exist");
        return productHistory[_productId];
    }

    /**
     * @notice Updates the metadata URI of a product.
     * @param _productId The ID of the product.
     * @param _newMetadataURI The new metadata URI.
     *
     * Requirements:
     * - The product must exist (its createdAt timestamp is non-zero).
     * - The caller must be either the creator or the current owner of the product.
     */
    function updateProductMetadata(uint256 _productId, string calldata _newMetadataURI) external {
        require(products[_productId].createdAt != 0, "Product does not exist");
        
        Product storage prod = products[_productId];
        require(msg.sender == prod.creator || msg.sender == prod.currentOwner, "Not authorized to update metadata");

        // Capture the old metadata for the event.
        string memory oldMetadata = prod.metadataURI;
        // Update the product metadata and the update timestamp.
        prod.metadataURI = _newMetadataURI;
        prod.updatedAt = block.timestamp;

        emit ProductMetadataUpdated(_productId, oldMetadata, _newMetadataURI);
    }

    function getProductsByOwner(address owner) public view returns (uint256[] memory) {
        uint256 count = 0;
        // Count how many products are owned by the given address.
        for (uint256 i = 1; i <= _productCounter; i++) {
            if (products[i].currentOwner == owner) {
                count++;
            }
        }
        
        // Allocate an array of the correct size.
        uint256[] memory result = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 1; i <= _productCounter; i++) {
            if (products[i].currentOwner == owner) {
                result[index] = i;
                index++;
            }
        }
        return result;
    }
}
