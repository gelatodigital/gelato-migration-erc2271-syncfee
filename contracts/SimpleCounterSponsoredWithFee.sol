// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SimpleCounterSponsoredWithFee
 * @notice Example contract showing the recommended SyncFee migration pattern
 * @dev This demonstrates how to collect tokens from users after SyncFee deprecation.
 *
 * Migration from SyncFee:
 * - NO GelatoRelayContext inheritance needed
 * - NO _transferRelayFee() calls
 * - NO onlyGelatoRelay modifier
 * - You implement your own token collection logic
 * - You sponsor the transaction via Gelato Gas Tank
 *
 * This contract collects a fee from users and sends it to your fee collector.
 * The transaction itself is sponsored by you (paid from your Gas Tank).
 */
contract SimpleCounterSponsoredWithFee is Ownable {
    uint256 public counter;
    address public feeCollector;

    event IncrementCounter(address indexed user, uint256 newCounterValue, uint256 timestamp);
    event FeePaid(address indexed user, address indexed feeToken, uint256 feeAmount);
    event FeeCollectorUpdated(address indexed oldCollector, address indexed newCollector);

    error InvalidFeeCollector();
    error InvalidFeeToken();
    error FeeTransferFailed();

    constructor(address _feeCollector) {
        if (_feeCollector == address(0)) revert InvalidFeeCollector();
        feeCollector = _feeCollector;
    }

    /**
     * @notice Update the fee collector address
     * @param _newFeeCollector The new fee collector address
     */
    function setFeeCollector(address _newFeeCollector) external onlyOwner {
        if (_newFeeCollector == address(0)) revert InvalidFeeCollector();
        address oldCollector = feeCollector;
        feeCollector = _newFeeCollector;
        emit FeeCollectorUpdated(oldCollector, _newFeeCollector);
    }

    /**
     * @notice Increment counter with fee payment using EIP-2612 permit (gasless approval)
     * @dev User signs a permit off-chain, no separate approval transaction needed.
     *      The transaction is sponsored via Gelato Gas Tank.
     *
     * @param feeToken The ERC20 token used to pay the fee (must support EIP-2612)
     * @param feeAmount The fee amount to collect
     * @param deadline The permit signature deadline
     * @param v The permit signature v component
     * @param r The permit signature r component
     * @param s The permit signature s component
     */
    function incrementWithPermit(
        address feeToken,
        uint256 feeAmount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        if (feeToken == address(0)) revert InvalidFeeToken();

        address user = msg.sender;

        // Execute permit to approve this contract to spend user's tokens
        IERC20Permit(feeToken).permit(user, address(this), feeAmount, deadline, v, r, s);

        // Transfer fee from user to your fee collector
        bool success = IERC20(feeToken).transferFrom(user, feeCollector, feeAmount);
        if (!success) revert FeeTransferFailed();

        emit FeePaid(user, feeToken, feeAmount);

        // Execute the actual operation
        counter++;
        emit IncrementCounter(user, counter, block.timestamp);
    }

    /**
     * @notice Increment counter with fee payment (requires prior approval)
     * @dev User must have approved this contract to spend their tokens beforehand.
     *      The transaction is sponsored via Gelato Gas Tank.
     *
     * @param feeToken The ERC20 token used to pay the fee
     * @param feeAmount The fee amount to collect
     */
    function incrementWithFee(address feeToken, uint256 feeAmount) external {
        if (feeToken == address(0)) revert InvalidFeeToken();

        address user = msg.sender;

        // Transfer fee from user to your fee collector
        // Requires user to have approved this contract beforehand
        bool success = IERC20(feeToken).transferFrom(user, feeCollector, feeAmount);
        if (!success) revert FeeTransferFailed();

        emit FeePaid(user, feeToken, feeAmount);

        // Execute the actual operation
        counter++;
        emit IncrementCounter(user, counter, block.timestamp);
    }

    /**
     * @notice Increment counter without fee (fully sponsored)
     * @dev Use this when you want to fully sponsor the user's transaction
     *      without collecting any fee from them.
     */
    function increment() external {
        counter++;
        emit IncrementCounter(msg.sender, counter, block.timestamp);
    }
}
