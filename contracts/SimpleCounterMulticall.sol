// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import "./EIP712MetaTransaction.sol";
import "@openzeppelin/contracts/utils/Address.sol";

contract SimpleCounterMulticall is EIP712MetaTransaction("SimpleCounterMulticall", "1") {
    uint256 public counter = 1;

    event IncrementCounter(
        address msgSender,
        uint256 newCounterValue,
        uint256 timestamp
    );

    function increment() external {
        counter++;
        emit IncrementCounter(msgSender(), counter, block.timestamp);
    }

    function multiply(uint256 count) external {
        counter = counter * count;
        emit IncrementCounter(msgSender(), counter, block.timestamp);
    }

    // Modifier to ensure multicall can only be called by the contract itself
    modifier onlySelf() {
        require(msg.sender == address(this), "Multicall: Only callable by contract itself");
        _;
    }

    function multicall(
        bytes[] calldata data
    ) external onlySelf returns (bytes[] memory results) {
        results = new bytes[](data.length);
        address sender = msgSender();
        bool isEIP712 = msg.sender != sender;
        for (uint256 i = 0; i < data.length; i++) {
            if (isEIP712) {
                results[i] = Address.functionDelegateCall(
                    address(this),
                    abi.encodePacked(data[i], sender)
                );
            } else {
                results[i] = Address.functionDelegateCall(
                    address(this),
                    data[i]
                );
            }
        }
        return results;
    }
}
