// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {ERC2771Context} from "@openzeppelin/contracts/metatx/ERC2771Context.sol";

/**
 * @title SimpleCounterTrusted
 * @notice A simple counter that trusts a TrustedForwarder for meta-transactions
 * @dev Inherits from OpenZeppelin's ERC2771Context to extract the original sender
 *
 * Unlike the EIP712MetaTransaction approach where the contract verifies signatures,
 * this contract delegates signature verification to the TrustedForwarder.
 * The forwarder appends the original sender address to the calldata.
 */
contract SimpleCounterTrusted is ERC2771Context {
    uint256 public counter;

    event IncrementCounter(address msgSender, uint256 newCounterValue, uint256 timestamp);

    constructor(address _trustedForwarder) ERC2771Context(_trustedForwarder) {}

    function increment() external {
        counter++;
        emit IncrementCounter(_msgSender(), counter, block.timestamp);
    }
}
