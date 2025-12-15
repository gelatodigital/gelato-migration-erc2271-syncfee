// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {ERC2771Context} from "@openzeppelin/contracts/metatx/ERC2771Context.sol";

/**
 * @title SimpleCounterTrustedConcurrent
 * @notice A simple counter that trusts a TrustedForwarderConcurrentERC2771 for meta-transactions
 * @dev Inherits from OpenZeppelin's ERC2771Context to extract the original sender
 *
 * This contract works with the hash-based (concurrent) trusted forwarder,
 * allowing multiple meta-transactions to be executed in any order.
 */
contract SimpleCounterTrustedConcurrent is ERC2771Context {
    uint256 public counter;

    event IncrementCounter(address msgSender, uint256 newCounterValue, uint256 timestamp);

    constructor(address _trustedForwarder) ERC2771Context(_trustedForwarder) {}

    function increment() external {
        counter++;
        emit IncrementCounter(_msgSender(), counter, block.timestamp);
    }
}
