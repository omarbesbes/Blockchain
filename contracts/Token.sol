// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Token is ERC20, Ownable(msg.sender) {
    constructor() ERC20("PlatformToken", "PTK") {
        // Mint an initial supply to the deployer.
        _mint(msg.sender, 1000000 * 10 ** decimals());
    }

    // Owner-only mint function in case additional tokens are needed.
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function buy(uint256 amount) external payable{
        require(msg.value == (amount/1000), "Incorrect Ether sent");
        _mint(msg.sender, amount);
    }
}
