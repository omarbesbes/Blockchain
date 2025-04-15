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
        // Mapping to track whether a specific score type has been used for rating seller
        mapping(uint8 => bool) ratedForSeller;
        // Mapping to track whether a specific score type has been used for rating factory (if applicable)
        mapping(uint8 => bool) ratedForFactory;
    }

    mapping(uint256 => Transaction) private _transactions;
    mapping(uint256 => bool) private _exists;

    // NEW: Mapping to track transactions that have been rated but are awaiting buyer action.
    // The seller address is the key.
    mapping(address => uint256[]) public pendingRatedTransactions;
    // NEW: Mapping to record whether a transaction rating was accepted (true) or disputed (false).
    mapping(uint256 => bool) public ratingAcceptedStatus;
    // NEW: Mapping to track which score types have been acknowledged or disputed for a transaction
    mapping(uint256 => mapping(uint8 => bool)) public scoreTypeProcessed;

    // NEW: Mapping to track all unique buyers for each seller
    mapping(address => address[]) private _sellerBuyers;
    // NEW: Mapping to track if a buyer has already been added to a seller's buyers list
    mapping(address => mapping(address => bool)) private _buyerExistsForSeller;
    // NEW: Mapping to store score values for each transaction, score type, and target type (seller/factory)
    mapping(uint256 => mapping(uint8 => mapping(bool => uint8))) public transactionScores;


    event BuyOperationRecorded(
        uint256 indexed transactionId,
        address indexed buyer,
        address indexed seller,
        uint256 productId
    );
    event TransactionValidated(uint256 indexed transactionId);
    event SellerRated(uint256 indexed transactionId, address indexed buyer, address indexed rated);
    // NEW events:
    event RatingAccepted(uint256 indexed transactionId, address indexed buyer);
    event RatingDisputed(uint256 indexed transactionId, address indexed buyer);
    // NEW: Event emitted when a new buyer is added to a seller's list
    event BuyerAddedForSeller(address indexed seller, address indexed buyer);

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

    // Buyer initiates the transaction
    function recordBuyOperation(address seller, uint256 productId) external returns (uint256) {
        require(registry.isRegistered(msg.sender), "Buyer not registered");
        require(registry.isRegistered(seller), "Seller not registered");

        int256 buyerRole = int256(uint256(registry.getRole(msg.sender)));
        int256 sellerRole = int256(uint256(registry.getRole(seller)));
        require(buyerRole - sellerRole == 1, "Invalid buyer-seller role combination");

        transactionCounter++;
        uint256 txnId = transactionCounter;
        Transaction storage txn = _transactions[txnId];
        txn.id = txnId;
        txn.seller = seller;
        txn.buyer = msg.sender;
        txn.productId = productId;
        txn.timestamp = block.timestamp;
        txn.status = TransactionStatus.Pending;

        _exists[txnId] = true;

        emit BuyOperationRecorded(txnId, msg.sender, seller, productId);
        return txnId;
    }

    // Seller confirms the transaction
    function confirmSellOperation(uint256 transactionId) external {
        require(_exists[transactionId], "Transaction does not exist");

        Transaction storage txn = _transactions[transactionId];
        require(txn.status == TransactionStatus.Pending, "Transaction already validated");
        require(txn.seller == msg.sender, "Only designated seller can confirm sale");

        txn.status = TransactionStatus.Validated;

        uint256 sellerRole = uint256(registry.getRole(txn.seller));
        uint256 buyerRole = uint256(registry.getRole(txn.buyer));

        // For Distributor -> Factory or Retailer -> Distributor scenarios:
        if ((sellerRole == 2 && buyerRole == 3) || (sellerRole == 3 && buyerRole == 4)) {
            require(token.allowance(txn.seller, address(this)) >= REWARD_AMOUNT, "Insufficient allowance for seller deposit");
            bool success = token.transferFrom(txn.seller, txn.buyer, REWARD_AMOUNT);
            require(success, "Token transfer for reward deposit failed");
        }
        // For Consumer -> Retailer:
        else if (sellerRole == 4 && buyerRole == 5) {
            require(token.allowance(txn.seller, address(this)) >= REWARD_AMOUNT, "Insufficient allowance for seller deposit");
            bool success = token.transferFrom(txn.seller, address(scoreEngine), REWARD_AMOUNT);
            require(success, "Token transfer for reward deposit failed");
        }
        // For other combinations, no deposit is required.
        
        // Transfer product ownership from seller to buyer if productId is set.
        if (txn.productId > 0) {
            productManager.transferProduct(txn.buyer, txn.productId);
        }
        
        // NEW: Track this buyer for this seller if not already tracked
        if (!_buyerExistsForSeller[txn.seller][txn.buyer]) {
            _sellerBuyers[txn.seller].push(txn.buyer);
            _buyerExistsForSeller[txn.seller][txn.buyer] = true;
            emit BuyerAddedForSeller(txn.seller, txn.buyer);
        }
        
        disputeManager.recordPurchase(txn.buyer, txn.seller);
        emit TransactionValidated(transactionId);
    }

    // Buyer rates the seller (or factory) for a given score type.
    // Checks that the rating for the provided scoreType has not already been recorded.
    // Then, modify the buyerRateSeller function to store the score value:
function buyerRateSeller(
    uint256 transactionId,
    uint8 scoreType,
    uint8 scoreValue,
    uint256 productIdForRating,
    bool ratingFactory
) external {
    require(_exists[transactionId], "Transaction does not exist");

    Transaction storage txn = _transactions[transactionId];
    require(txn.status == TransactionStatus.Validated, "Transaction not validated");
    require(txn.buyer == msg.sender, "Only buyer can rate");

    address toBeRated = txn.seller;
    if (ratingFactory) {
        require(!txn.ratedForFactory[scoreType], "Already rated factory for this score type");
        ProductManager.Product memory product = productManager.getProductDetails(productIdForRating);
        toBeRated = product.creator;
    } else {
        require(!txn.ratedForSeller[scoreType], "Already rated seller for this score type");
    }

    uint256 sellerRole = uint256(registry.getRole(toBeRated));
    uint256 buyerRole = uint256(registry.getRole(msg.sender));

    bool allowed = false;
    if (buyerRole == 2 && sellerRole == 1) {
        allowed = true;
    } else if (buyerRole == 4 && sellerRole == 3) {
        allowed = true;
    } else if (buyerRole == 5 && sellerRole == 4) {
        allowed = true;
    } else if (buyerRole == 5 && sellerRole == 2) {
        ProductManager.Product memory product = productManager.getProductDetails(productIdForRating);
        require(product.currentOwner == msg.sender, "Caller is not the owner of the product");
        allowed = true;
    }
    require(allowed, "Rating not allowed for this transaction based on roles");

    scoreEngine.rateStakeholder(toBeRated, ScoreEngine.ScoreType(scoreType), scoreValue);

    // MODIFIED: Store the score value for this transaction and score type
    transactionScores[transactionId][scoreType][ratingFactory] = scoreValue;

    if (ratingFactory) {
        txn.ratedForFactory[scoreType] = true;
    } else {
        txn.ratedForSeller[scoreType] = true;
    }

    emit SellerRated(transactionId, msg.sender, toBeRated);

    if (!ratingFactory){
        // Factory cannot choose to accept/dispute a rating given by consumer
        // Track this rated transaction (awaiting buyer acceptance/dispute)
        pendingRatedTransactions[txn.seller].push(transactionId);
    }
}

function getTransactionScore(uint256 transactionId, uint8 scoreType, bool isFactory) external view returns (uint8) {
    require(_exists[transactionId], "Transaction does not exist");
    
    Transaction storage txn = _transactions[transactionId];
    bool wasRated;
    
    if (isFactory) {
        wasRated = txn.ratedForFactory[scoreType];
    } else {
        wasRated = txn.ratedForSeller[scoreType];
    }
    
    require(wasRated, "This score type was not rated for this transaction");
    
    return transactionScores[transactionId][scoreType][isFactory];
}

    // NEW: Returns all pending rated transaction IDs for a given seller address.
    function getPendingRatedTransactions(address _seller) external view returns (uint256[] memory) {
        return pendingRatedTransactions[_seller];
    }

    // NEW: Updates the rating status for a given transaction.
    // If 'accepted' is true, the seller accepts the rating; otherwise, the rating is disputed.
    // In both cases, the transaction is removed from the pending mapping.
function updateRatingStatus(uint256 transactionId, uint8 scoreType, bool accepted) external {
    require(_exists[transactionId], "Transaction does not exist");
    Transaction storage txn = _transactions[transactionId];
    require(txn.seller == msg.sender, "Only seller can update rating status");
    
    // Mark this specific score type as processed
    scoreTypeProcessed[transactionId][scoreType] = true;
    
    ratingAcceptedStatus[transactionId] = accepted;
    _removePendingRatedTransaction(txn.seller, transactionId);

    if (accepted) {
        emit RatingAccepted(transactionId, msg.sender);
    } else {
        emit RatingDisputed(transactionId, msg.sender);
    }
}
    // INTERNAL: Remove a transactionId from pendingRatedTransactions for a given seller.
    function _removePendingRatedTransaction(address seller, uint256 transactionId) internal {
        uint256[] storage pending = pendingRatedTransactions[seller];
        for (uint256 i = 0; i < pending.length; i++) {
            if (pending[i] == transactionId) {
                pending[i] = pending[pending.length - 1];
                pending.pop();
                break;
            }
        }
    }

    // Returns the pending transaction ID for a given product (or 0 if none)
    function getPendingTransactionByProduct(uint256 productId) external view returns (uint256) {
        for (uint256 i = transactionCounter; i > 0; i--) {
            Transaction storage txn = _transactions[i];
            if (txn.productId == productId && txn.status == TransactionStatus.Pending) {
                return txn.id;
            }
        }
        return 0;
    }

    // Returns all pending transaction IDs for a given product
    function getAllPendingTransactionsByProduct(uint256 productId) external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 1; i <= transactionCounter; i++) {
            if (_transactions[i].productId == productId && _transactions[i].status == TransactionStatus.Pending) {
                count++;
            }
        }
        uint256[] memory results = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 1; i <= transactionCounter; i++) {
            if (_transactions[i].productId == productId && _transactions[i].status == TransactionStatus.Pending) {
                results[index] = i;
                index++;
            }
        }
        return results;
    }

    // Returns true if a pending transaction exists for a given product
    function hasPendingTransaction(uint256 productId) public view returns (bool) {
        for (uint256 i = transactionCounter; i > 0; i--) {
            if (_transactions[i].productId == productId && _transactions[i].status == TransactionStatus.Pending) {
                return true;
            }
        }
        return false;
    }

    function isScoreTypeProcessed(uint256 transactionId, uint8 scoreType) external view returns (bool) {
    return scoreTypeProcessed[transactionId][scoreType];
}
    // Returns the last transaction ID for a given product
    function getLastTransactionId(uint256 productId) external view returns (uint256) {
        for (uint256 i = transactionCounter; i > 0; i--) {
            if (_transactions[i].productId == productId) {
                return _transactions[i].id;
            }
        }
        return 0;
    }

    // Getter to retrieve transaction details.
    // Returns: id, seller, buyer, productId, timestamp, and status.
    function getTransaction(uint256 id) external view returns (
        uint256, address, address, uint256, uint256, TransactionStatus
    ) {
        Transaction storage txn = _transactions[id];
        return (
            txn.id,
            txn.seller,
            txn.buyer,
            txn.productId,
            txn.timestamp,
            txn.status
        );
    }

    // New view function: Check if the seller has been rated for a given score type.
    function isSellerRated(uint256 transactionId, uint8 scoreType) external view returns (bool) {
        require(_exists[transactionId], "Transaction does not exist");
        Transaction storage txn = _transactions[transactionId];
        return txn.ratedForSeller[scoreType];
    }

    // New view function: Check if the factory has been rated for a given score type.
    function isFactoryRated(uint256 transactionId, uint8 scoreType) external view returns (bool) {
        require(_exists[transactionId], "Transaction does not exist");
        Transaction storage txn = _transactions[transactionId];
        return txn.ratedForFactory[scoreType];
    }
    
    // NEW: Returns all unique buyers that have bought from a given seller
    function getBuyersForSeller(address seller) external view returns (address[] memory) {
        return _sellerBuyers[seller];
    }
    
    // NEW: Check if a specific address has bought from a seller
    function hasBoughtFromSeller(address seller, address buyer) external view returns (bool) {
        return _buyerExistsForSeller[seller][buyer];
    }
    
    // NEW: Get the number of buyers for a given seller
    function getSellerBuyerCount(address seller) external view returns (uint256) {
        return _sellerBuyers[seller].length;
    }
    
    // NEW: Get the buyer address at a specific index for a given seller
    function getSellerBuyerAtIndex(address seller, uint256 index) external view returns (address) {
        require(index < _sellerBuyers[seller].length, "Index out of bounds");
        return _sellerBuyers[seller][index];
    }
/**
 * @notice Gets the previous transaction ID for a transaction.
 * @param _transactionId The ID of the current transaction.
 * @return The previous transaction ID for the same product, or 0 if there is none.
 */
function getPreviousTransactionId(uint256 _transactionId) external view returns (uint256) {
    require(_exists[_transactionId], "Transaction does not exist");
    
    Transaction storage txn = _transactions[_transactionId];
    uint256 productId = txn.productId;
    uint256 prevId = 0;
    
    // Find the most recent transaction for this product that occurred before this one
    for (uint256 i = _transactionId - 1; i > 0; i--) {
        if (_exists[i] && _transactions[i].productId == productId) {
            prevId = i;
            break;
        }
    }
    
    return prevId;
}
}