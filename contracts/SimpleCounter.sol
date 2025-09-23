// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import "./EIP712MetaTransaction.sol";


contract SimpleCounter  is EIP712MetaTransaction("SimpleCounter","1") {
    uint256 public counter;

    event IncrementCounter(address msgSender,uint256 newCounterValue,  uint256 timestamp);

    function increment() external {
        counter++;
        emit IncrementCounter( msgSender(), counter,block.timestamp);
    }
}
