// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./StakeholderRegistry.sol";
import "./ProductManager.sol";
import "./ScoreEngine.sol";
import "./Token.sol";

contract TransactionManager {
    StakeholderRegistry public registry;
    ProductManager public productManager;
    ScoreEngine public scoreEngine;
    Token public token;

    uint256 public constant REWARD_AMOUNT = 10 * 1e18;
    uint256 public transactionCounter;

    enum TransactionStatus { Pending, Validated }

    struct Transaction {
        uint256 id;
        address seller;
        address buyer;
        uint256 productId;
        uint256 timestamp;
        TransactionStatus status;
        bool rated;
    }

    mapping(uint256 => Transaction) public transactions;

    event SellOperationRecorded(
        uint256 indexed transactionId,
        address indexed seller,
        address indexed buyer,
        uint256 productId
    );
    event TransactionValidated(uint256 indexed transactionId);
    event SellerRated(uint256 indexed transactionId, address indexed buyer, address indexed seller);

    constructor(
        address _registry,
        address _productManager,
        address _scoreEngine,
        address _token
    ) {
        registry = StakeholderRegistry(_registry);
        productManager = ProductManager(_productManager);
        scoreEngine = ScoreEngine(_scoreEngine);
        token = Token(_token);
    }

    // Updated: Removed payable and ether deposit checks.
    function recordSellOperation(address buyer) external returns (uint256) {
        require(registry.isRegistered(msg.sender), "Seller not registered");
        require(registry.isRegistered(buyer), "Buyer not registered");

        uint256 sellerRole = uint256(registry.getRole(msg.sender));
        uint256 buyerRole = uint256(registry.getRole(buyer));
        uint256 productId = 0;

        if (sellerRole == 1 && buyerRole == 2) {
            // Supplier->Factory: no reward deposit required.
        } else if (sellerRole == 3 && buyerRole == 4) {
            // Distributor->Retailer: require token deposit.
            require(
                token.allowance(msg.sender, address(this)) >= REWARD_AMOUNT,
                "Insufficient allowance for reward deposit"
            );
            bool success = token.transferFrom(msg.sender, address(this), REWARD_AMOUNT);
            require(success, "Token transfer for reward deposit failed");
        } else if (sellerRole == 4 && buyerRole == 5) {
            // Retailer->Consumer: no reward deposit required.
        } else {
            revert("Invalid seller-buyer role combination for non-factory sale");
        }

        transactionCounter++;
        transactions[transactionCounter] = Transaction({
            id: transactionCounter,
            seller: msg.sender,
            buyer: buyer,
            productId: productId,
            timestamp: block.timestamp,
            status: TransactionStatus.Pending,
            rated: false
        });

        emit SellOperationRecorded(transactionCounter, msg.sender, buyer, productId);
        return transactionCounter;
    }

    // Updated: Use token transfer instead of ether deposit.
    function recordFactorySellOperation(address buyer, uint256 productId) external returns (uint256) {
        require(registry.isRegistered(msg.sender), "Seller not registered");
        require(registry.isRegistered(buyer), "Buyer not registered");

        uint256 sellerRole = uint256(registry.getRole(msg.sender));
        uint256 buyerRole = uint256(registry.getRole(buyer));

        require(sellerRole == 2, "Seller must be a Factory");
        require(buyerRole == 3 || buyerRole == 5, "Buyer must be Distributor or Consumer for factory sale");

        if (buyerRole == 3) {
            // Factory->Distributor: require token deposit.
            require(
                token.allowance(msg.sender, address(this)) >= REWARD_AMOUNT,
                "Insufficient allowance for reward deposit"
            );
            bool success = token.transferFrom(msg.sender, address(this), REWARD_AMOUNT);
            require(success, "Token transfer for reward deposit failed");
        }
        // For Factory->Consumer, no deposit is required.

        productManager.transferProduct(buyer, productId);

        transactionCounter++;
        transactions[transactionCounter] = Transaction({
            id: transactionCounter,
            seller: msg.sender,
            buyer: buyer,
            productId: productId,
            timestamp: block.timestamp,
            status: TransactionStatus.Pending,
            rated: false
        });

        emit SellOperationRecorded(transactionCounter, msg.sender, buyer, productId);
        return transactionCounter;
    }

    // Updated: Instead of transferring ether, use token.transfer.
    function confirmBuyOperation(uint256 transactionId) external {
        Transaction storage txn = transactions[transactionId];

        require(txn.id != 0, "Transaction does not exist");
        require(txn.status == TransactionStatus.Pending, "Transaction already validated");
        require(txn.buyer == msg.sender, "Only designated buyer can confirm purchase");

        txn.status = TransactionStatus.Validated;

        uint256 sellerRole = uint256(registry.getRole(txn.seller));
        uint256 buyerRole = uint256(registry.getRole(txn.buyer));

        if ((sellerRole == 3 && buyerRole == 4) || (sellerRole == 2 && buyerRole == 3)) {
            // For sales that required a deposit, transfer the tokens from the contract to the buyer.
            bool success = token.transfer(txn.buyer, REWARD_AMOUNT);
            require(success, "Token transfer for reward failed");
        } else if (sellerRole == 4 && buyerRole == 5) {
            // For Retailer->Consumer, take tokens directly from the seller.
            require(
                token.transferFrom(txn.seller, address(scoreEngine), REWARD_AMOUNT),
                "Token transfer for reward failed"
            );
        }

        emit TransactionValidated(transactionId);
    }

    // buyerRateSeller remains unchanged.
    function buyerRateSeller(
        uint256 transactionId,
        uint8 scoreType,
        uint8 scoreValue,
        uint256 productIdForRating
    ) external {
        Transaction storage txn = transactions[transactionId];

        require(txn.id != 0, "Transaction does not exist");
        require(txn.status == TransactionStatus.Validated, "Transaction not validated");
        require(txn.buyer == msg.sender, "Only buyer can rate the seller");
        require(!txn.rated, "Seller already rated for this transaction");

        uint256 sellerRole = uint256(registry.getRole(txn.seller));
        uint256 buyerRole = uint256(registry.getRole(txn.buyer));

        bool allowed = false;

        if (buyerRole == 2 && sellerRole == 1) {
            allowed = true;
        } else if (buyerRole == 4 && sellerRole == 3) {
            allowed = true;
        } else if (buyerRole == 5 && sellerRole == 4) {
            allowed = true;
        } else if (buyerRole == 5 && sellerRole == 2) {
            ProductManager.Product memory product = productManager.getProductDetails(productIdForRating);
            require(product.id == productIdForRating, "Product ID mismatch");
            require(product.currentOwner == msg.sender, "Caller is not the owner of the product");
            require(product.creator == txn.seller, "Seller is not the creator of the product");
            allowed = true;
        }

        require(allowed, "Rating not allowed for this transaction based on roles");

        scoreEngine.rateStakeholder(txn.seller, ScoreEngine.ScoreType(scoreType), scoreValue);
        txn.rated = true;

        emit SellerRated(transactionId, txn.buyer, txn.seller);
    }
}
