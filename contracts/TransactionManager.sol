// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./StakeholderRegistry.sol";
import "./ProductManager.sol";
import "./ScoreEngine.sol";
import "./Token.sol";
import "./DisputeManager.sol";

contract TransactionManager {
    StakeholderRegistry public registry;
    ProductManager public productManager;
    ScoreEngine public scoreEngine;
    Token public token;
    DisputeManager public disputeManager;

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
        bool ratedFactory;
    }

    mapping(uint256 => Transaction) public transactions;

    event BuyOperationRecorded(
        uint256 indexed transactionId,
        address indexed buyer,
        address indexed seller,
        uint256 productId
    );
    event TransactionValidated(uint256 indexed transactionId);
    event SellerRated(uint256 indexed transactionId, address indexed buyer, address indexed seller);

    constructor(
        address _registry,
        address _productManager,
        address _scoreEngine,
        address _token,
        address payable _disputeManager
    ) {
        registry = StakeholderRegistry(_registry);
        productManager = ProductManager(_productManager);
        scoreEngine = ScoreEngine(_scoreEngine);
        token = Token(_token);
        disputeManager = DisputeManager(_disputeManager);
    }

    // New function: Buyer initiates the transaction
    function recordBuyOperation(address seller, uint256 productId) external returns (uint256) {
        require(registry.isRegistered(msg.sender), "Buyer not registered");
        require(registry.isRegistered(seller), "Seller not registered");

        int256 buyerRole = int256(uint256(registry.getRole(msg.sender)));
        int256 sellerRole = int256(uint256(registry.getRole(seller)));

        if (!(buyerRole - sellerRole == 1)) {
            revert("Invalid buyer-seller role combination for transaction");
        }

        transactionCounter++;
        transactions[transactionCounter] = Transaction({
            id: transactionCounter,
            seller: seller,
            buyer: msg.sender,
            productId: productId,
            timestamp: block.timestamp,
            status: TransactionStatus.Pending,
            rated: false,
            ratedFactory: false
        });

        emit BuyOperationRecorded(transactionCounter, msg.sender, seller, productId);
        return transactionCounter;
    }


    // Updated: Seller confirms the transaction
    function confirmSellOperation(uint256 transactionId) external {
        Transaction storage txn = transactions[transactionId];

        require(txn.id != 0, "Transaction does not exist");
        require(txn.status == TransactionStatus.Pending, "Transaction already validated");
        require(txn.seller == msg.sender, "Only designated seller can confirm sale");

        txn.status = TransactionStatus.Validated;

        uint256 sellerRole = uint256(registry.getRole(txn.seller));
        uint256 buyerRole = uint256(registry.getRole(txn.buyer));

        // For Distributor -> Factory: factory (seller) deposits tokens to distributor (buyer)
        // or For Retailer -> Distributor: distributor (seller) deposits tokens to retailer (buyer)
        if ((sellerRole == 2 && buyerRole == 3) || (sellerRole == 3 && buyerRole == 4)) {
            require(token.allowance(txn.seller, address(this)) >= REWARD_AMOUNT, "Insufficient allowance for seller deposit");
            bool success = token.transferFrom(txn.seller, txn.buyer, REWARD_AMOUNT);
            require(success, "Token transfer for reward deposit failed");
        }
        // For Consumer -> Retailer: retailer (seller) deposits tokens to ScoreEngine
        else if (sellerRole == 4 && buyerRole == 5) {
            require(token.allowance(txn.seller, address(this)) >= REWARD_AMOUNT, "Insufficient allowance for seller deposit");
            bool success = token.transferFrom(txn.seller, address(scoreEngine), REWARD_AMOUNT);
            require(success, "Token transfer for reward deposit failed");
        }
        // For Factory -> Supplier (or other combinations), no deposit is required.
        
        // If it's a factory product sale, transfer the product ownership
        if (sellerRole >= 2 && txn.productId > 0) {
            productManager.transferProduct(txn.buyer, txn.productId);
        }
        disputeManager.recordPurchase(txn.buyer, txn.seller);
        emit TransactionValidated(transactionId);
    }


    // buyerRateSeller remains unchanged.
    function buyerRateSeller(
        uint256 transactionId,
        uint8 scoreType,
        uint8 scoreValue,
        uint256 productIdForRating,
        bool ratingFactory
    ) external {
        Transaction storage txn = transactions[transactionId];

        require(txn.id != 0, "Transaction does not exist");
        require(txn.status == TransactionStatus.Validated, "Transaction not validated");
        require(txn.buyer == msg.sender, "Only buyer can rate the seller");
        ProductManager.Product memory product;
        address toBeRated = txn.seller;
        address rater = msg.sender;
        if (ratingFactory) {
            require(!txn.ratedFactory, "Seller already rated for this transaction");
            product = productManager.getProductDetails(productIdForRating);
            toBeRated = product.creator;
        } else {
            require(!txn.rated, "Seller already rated for this transaction");
        }

        uint256 sellerRole = uint256(registry.getRole(toBeRated));
        uint256 buyerRole = uint256(registry.getRole(rater));

        bool allowed = false;

        if (buyerRole == 2 && sellerRole == 1) {
            allowed = true;
        } else if (buyerRole == 4 && sellerRole == 3) {
            allowed = true;
        } else if (buyerRole == 5 && sellerRole == 4) {
            allowed = true;
        } else if (buyerRole == 5 && sellerRole == 2) {
            require(product.currentOwner == msg.sender, "Caller is not the owner of the product");
            allowed = true;
        }

        require(allowed, "Rating not allowed for this transaction based on roles");

        scoreEngine.rateStakeholder(toBeRated, ScoreEngine.ScoreType(scoreType), scoreValue);
        txn.rated = true;

        emit SellerRated(transactionId, rater, toBeRated);
    }
}