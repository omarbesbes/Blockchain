// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Import Ownable for admin-only functions
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title StakeholderRegistry
 * @dev This contract manages registration and basic data for stakeholders in the supply chain.
 */
contract StakeholderRegistry is Ownable {
    constructor() Ownable(msg.sender) {}

    // Define possible roles. 'None' represents an invalid role.
    enum Role { None, Supplier, Factory, Distributor, Retailer, Consumer }

    // Structure for storing stakeholder details.
    struct Stakeholder {
        Role role;
        string metadataURI; 
        bool exists;
    }

    // Mapping from address to Stakeholder details.
    mapping(address => Stakeholder) private stakeholders;
    // Mapping to keep count of total stakeholders for each role.
    mapping(Role => uint256) private totalRegistered;
    // Array to store all registered stakeholder addresse
    address[] private registeredAddresses;

    // Events to emit important state changes.
    event StakeholderRegistered(address indexed stakeholder, Role role, string metadataURI);
    event MetadataUpdated(address indexed stakeholder, string newMetadataURI);
    event StakeholderRemoved(address indexed stakeholder);
    event StakeholderRoleTransferred(address indexed from, address indexed to, Role role);

    // Modifier to ensure that the caller is a registered stakeholder.
    modifier onlyRegistered() {
        require(stakeholders[msg.sender].exists, "Stakeholder not registered");
        _;
    }

    // Modifier to restrict functions to a specific role.
    modifier onlyRole(Role _role) {
        require(stakeholders[msg.sender].role == _role, "Unauthorized role");
        _;
    }

    /**
     * @notice Registers a new stakeholder with a specific role and metadata.
     * @param _role The role of the stakeholder (must not be Role.None).
     * @param _metadataURI The URI pointing to the stakeholder's metadata.
     */
    function registerStakeholder(Role _role, string calldata _metadataURI) external {
        require(_role != Role.None, "Invalid role");
        require(!stakeholders[msg.sender].exists, "Already registered");

        stakeholders[msg.sender] = Stakeholder({
            role: _role,
            metadataURI: _metadataURI,
            exists: true
        });
        totalRegistered[_role] += 1;
        registeredAddresses.push(msg.sender);

        emit StakeholderRegistered(msg.sender, _role, _metadataURI);
    }

    /**
     * @notice Updates the metadata URI for the calling stakeholder.
     * @param _metadataURI The new metadata URI.
     */
    function updateMetadata(string calldata _metadataURI) external onlyRegistered {
        stakeholders[msg.sender].metadataURI = _metadataURI;
        emit MetadataUpdated(msg.sender, _metadataURI);
    }

    /**
     * @notice Returns the role of the given stakeholder address.
     * @param _stakeholder The address of the stakeholder.
     * @return The role associated with the stakeholder.
     */
    function getRole(address _stakeholder) external view returns (Role) {
        return stakeholders[_stakeholder].role;
    }

    /**
     * @notice Returns the metadata URI of the given stakeholder address.
     * @param _stakeholder The address of the stakeholder.
     * @return The metadata URI of the stakeholder.
     */
    function getMetadata(address _stakeholder) external view returns (string memory) {
        return stakeholders[_stakeholder].metadataURI;
    }

    /**
     * @notice Checks if a given address is registered as a stakeholder.
     * @param _stakeholder The address to check.
     * @return True if the address is registered, false otherwise.
     */
    function isRegistered(address _stakeholder) external view returns (bool) {
        return stakeholders[_stakeholder].exists;
    }

    /**
     * @notice Returns the total number of stakeholders registered for a given role.
     * @param _role The role to query.
     * @return The count of registered stakeholders for the role.
     */
    function totalRegisteredByRole(Role _role) external view returns (uint256) {
        return totalRegistered[_role];
    }

    /**
     * @notice Removes a stakeholder from the registry.
     * @dev Only the contract owner can call this function.
     * @param _stakeholder The address of the stakeholder to remove.
     */
    function removeStakeholder(address _stakeholder) external onlyOwner {
        require(stakeholders[_stakeholder].exists, "Stakeholder not registered");

        // Decrement the count for the stakeholder's role.
        totalRegistered[stakeholders[_stakeholder].role] -= 1;
        // Delete the stakeholder data.
        delete stakeholders[_stakeholder];

        emit StakeholderRemoved(_stakeholder);
    }

    /**
     * @notice Transfers the stakeholder role from the caller to another address.
     * @param _to The address to transfer the stakeholder role to.
     */
    function transferStakeholderRole(address _to) external onlyRegistered {
        require(!stakeholders[_to].exists, "Recipient already registered");

        // Copy the stakeholder data from msg.sender to the new address.
        Stakeholder memory stakeholderData = stakeholders[msg.sender];
        stakeholders[_to] = stakeholderData;
        stakeholders[msg.sender].exists = false; // Mark the sender as unregistered.

        // Add the new address to the registered list.
        registeredAddresses.push(_to);

        emit StakeholderRoleTransferred(msg.sender, _to, stakeholderData.role);
    }

    /**
     * @notice Returns the list of all registered stakeholder addresses.
     * @return An array of addresses of all registered stakeholders.
     */
    function getAllStakeholders() external view returns (address[] memory) {
        return registeredAddresses;
    }

    /**
     * @notice Returns the stakeholder type as a string for the given address.
     * @param _stakeholder The address of the stakeholder.
     * @return A string representing the stakeholder type.
     */
    function getStakeholderType(address _stakeholder) external view returns (uint256) {
    require(stakeholders[_stakeholder].exists, "Stakeholder not registered");
    return uint256(stakeholders[_stakeholder].role);
}
}
