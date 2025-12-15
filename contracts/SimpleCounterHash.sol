// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import "./lib/EIP712HASHMetaTransaction.sol";

/**
 * @title SimpleCounterHash
 * @notice A simple counter using hash-based meta-transactions
 * @dev Inherits from EIP712HASHMetaTransaction for gasless execution with concurrent support
 */
contract SimpleCounterHash is EIP712HASHMetaTransaction("SimpleCounterHash", "1") {
    uint256 public counter;

    event IncrementCounter(address msgSender, uint256 newCounterValue, uint256 timestamp);

    function increment() external {
        counter++;
        emit IncrementCounter(msgSender(), counter, block.timestamp);
    }
}
