// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/*//////////////////////////////////////////////////////////////
//                                                            //
//                 ⚠️  DISCLAIMER  ⚠️                          //
//                                                            //
//  This contract is provided as an EXAMPLE for educational   //
//  purposes only. It has NOT been audited and may contain    //
//  bugs or security vulnerabilities.                         //
//                                                            //
//  USE AT YOUR OWN RISK. The authors assume no liability     //
//  for any losses or damages resulting from the use of       //
//  this code.                                                //
//                                                            //
//  For production use, please ensure proper security audits  //
//  are conducted by qualified professionals.                 //
//                                                            //
//////////////////////////////////////////////////////////////*/

// ============ External Dependencies (OpenZeppelin) ============
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// ============ Constants ============
address constant NATIVE_TOKEN = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

// ============ Types ============
struct CallWithConcurrentERC2771 {
    uint256 chainId;
    address target;
    bytes data;
    address user;
    bytes32 userSalt;
    uint256 userDeadline;
}

// ============ Libraries ============
library GelatoBytes {
    function revertWithError(
        bytes memory _bytes,
        string memory _tracingInfo
    ) internal pure {
        // 68: 32-location, 32-length, 4-ErrorSelector, UTF-8 err
        if (_bytes.length % 32 == 4) {
            bytes4 selector;
            assembly {
                selector := mload(add(0x20, _bytes))
            }
            if (selector == 0x08c379a0) {
                // Function selector for Error(string)
                assembly {
                    _bytes := add(_bytes, 68)
                }
                revert(string(abi.encodePacked(_tracingInfo, string(_bytes))));
            }
        }

        // Bubble up unrecognised errors directly
        assembly {
            revert(add(_bytes, 0x20), mload(_bytes))
        }
    }
}

library GelatoString {
    function suffix(
        string memory _first,
        string memory _second
    ) internal pure returns (string memory) {
        return string(abi.encodePacked(_first, _second));
    }
}

library GelatoCallUtils {
    using GelatoBytes for bytes;

    function revertingContractCall(
        address _contract,
        bytes memory _data,
        string memory _errorMsg
    ) internal returns (bytes memory returndata) {
        bool success;
        (success, returndata) = _contract.call(_data);

        if (success) {
            if (returndata.length == 0) {
                require(
                    isContract(_contract),
                    string(abi.encodePacked(_errorMsg, "Call to non contract"))
                );
            }
        } else {
            returndata.revertWithError(_errorMsg);
        }
    }

    function isContract(address account) internal view returns (bool) {
        return account.code.length > 0;
    }
}

library GelatoTokenUtils {
    function transfer(address _token, address _to, uint256 _amount) internal {
        _token == NATIVE_TOKEN
            ? Address.sendValue(payable(_to), _amount)
            : SafeERC20.safeTransfer(IERC20(_token), _to, _amount);
    }

    function getBalance(
        address token,
        address user
    ) internal view returns (uint256) {
        return
            token == NATIVE_TOKEN
                ? user.balance
                : IERC20(token).balanceOf(user);
    }
}

// ============ Functions ============
function _encodeERC2771Context(
    bytes calldata _data,
    address _msgSender
) pure returns (bytes memory) {
    return abi.encodePacked(_data, _msgSender);
}

// ============ Interfaces ============
interface ITrustedForwarderConcurrentERC2771 {
    function sponsoredCallConcurrentERC2771(
        CallWithConcurrentERC2771 calldata _call,
        address _sponsor,
        address _feeToken,
        uint256 _oneBalanceChainId,
        bytes calldata _userSignature,
        uint256 _nativeToFeeTokenXRateNumerator,
        uint256 _nativeToFeeTokenXRateDenominator,
        bytes32 _correlationId
    ) external;
}

interface IGelato1Balance {
    event LogUseGelato1Balance(
        address indexed sponsor,
        address indexed target,
        address indexed feeToken,
        uint256 oneBalanceChainId,
        uint256 nativeToFeeTokenXRateNumerator,
        uint256 nativeToFeeTokenXRateDenominator,
        bytes32 correlationId
    );
}

interface ITrustedForwarderConcurrentERC2771Base {
    function hashUsed(bytes32 _hash) external view returns (bool);
    function SPONSORED_CALL_CONCURRENT_ERC2771_TYPEHASH() external pure returns (bytes32);
}

// ============ Abstract Base Contract ============
abstract contract TrustedForwarderConcurrentERC2771Base is
    ITrustedForwarderConcurrentERC2771Base
{
    using GelatoString for string;

    mapping(bytes32 => bool) public hashUsed;

    bytes32 public constant SPONSORED_CALL_CONCURRENT_ERC2771_TYPEHASH =
        keccak256(
            bytes(
                "SponsoredCallConcurrentERC2771(uint256 chainId,address target,bytes data,address user,bytes32 userSalt,uint256 userDeadline)"
            )
        );

    constructor() {}

    function _requireChainId(
        uint256 _chainId,
        string memory _errorTrace
    ) internal view {
        require(_chainId == block.chainid, _errorTrace.suffix("chainid"));
    }

    function _requireUserDeadline(
        uint256 _userDeadline,
        string memory _errorTrace
    ) internal view {
        require(
            _userDeadline == 0 || _userDeadline >= block.timestamp,
            _errorTrace.suffix("deadline")
        );
    }

    function _requireUnusedHash(
        bytes32 _callWithSyncFeeConcurrentHash,
        string memory _errorTrace
    ) internal view {
        require(
            !hashUsed[_callWithSyncFeeConcurrentHash],
            _errorTrace.suffix("replay")
        );
    }

    function _requireSponsoredCallConcurrentERC2771Signature(
        bytes32 _domainSeparator,
        bytes32 _sponsoredCallConcurrentHash,
        bytes calldata _signature,
        address _expectedSigner
    ) internal pure returns (bytes32 digest) {
        digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                _domainSeparator,
                _sponsoredCallConcurrentHash
            )
        );

        (address recovered, ECDSA.RecoverError error) = ECDSA.tryRecover(
            digest,
            _signature
        );
        require(
            error == ECDSA.RecoverError.NoError && recovered == _expectedSigner,
            "TrustedForwarderConcurrentERC2771Base._requireSponsoredCallConcurrentERC2771Signature"
        );
    }

    function _hashSponsoredCallConcurrentERC2771(
        CallWithConcurrentERC2771 calldata _call
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    SPONSORED_CALL_CONCURRENT_ERC2771_TYPEHASH,
                    _call.chainId,
                    _call.target,
                    keccak256(_call.data),
                    _call.user,
                    _call.userSalt,
                    _call.userDeadline
                )
            );
    }
}

// ============ Main Contract ============
/// @title  Gelato Relay contract
/// @notice This contract deals with synchronous payments and Gelato 1Balance payments
/// @dev    This contract must NEVER hold funds!
/// @dev    Maliciously crafted transaction payloads could wipe out any funds left here
contract TrustedForwarderConcurrentERC2771 is
    ITrustedForwarderConcurrentERC2771,
    IGelato1Balance,
    TrustedForwarderConcurrentERC2771Base
{
    using GelatoCallUtils for address;
    using GelatoTokenUtils for address;

    string public constant name = "TrustedForwarderConcurrentERC2771";
    string public constant version = "1";

    constructor() TrustedForwarderConcurrentERC2771Base() {}

    /// @notice Relay call + One Balance payment with _msgSender user signature verification
    /// @dev    Payment is handled with off-chain accounting using Gelato's 1Balance system
    /// @param _call Relay call data packed into CallWithConcurrentERC2771 struct
    /// @param _userSignature EIP-712 compliant signature from _call.user
    /// @param _nativeToFeeTokenXRateNumerator Exchange rate numerator
    /// @param _nativeToFeeTokenXRateDenominator Exchange rate denominator
    /// @param _correlationId Unique task identifier generated by gelato
    function sponsoredCallConcurrentERC2771(
        CallWithConcurrentERC2771 calldata _call,
        address _sponsor,
        address _feeToken,
        uint256 _oneBalanceChainId,
        bytes calldata _userSignature,
        uint256 _nativeToFeeTokenXRateNumerator,
        uint256 _nativeToFeeTokenXRateDenominator,
        bytes32 _correlationId
    ) external {
        // CHECKS
        _requireChainId(
            _call.chainId,
            "TrustedForwarderConcurrentERC2771.sponsoredCallConcurrentERC2771:"
        );

        _requireUserDeadline(
            _call.userDeadline,
            "TrustedForwarderConcurrentERC2771.sponsoredCallConcurrentERC2771:"
        );

        bytes32 callHash = _hashSponsoredCallConcurrentERC2771(_call);

        // For the user, we enforce hash-based replay protection
        _requireUnusedHash(
            callHash,
            "TrustedForwarderConcurrentERC2771.sponsoredCallConcurrentERC2771:"
        );

        bytes32 domainSeparator = _getDomainSeparator();

        // Verify user's signature
        _requireSponsoredCallConcurrentERC2771Signature(
            domainSeparator,
            callHash,
            _userSignature,
            _call.user
        );

        // EFFECTS
        hashUsed[callHash] = true;

        // INTERACTIONS
        _call.target.revertingContractCall(
            _encodeERC2771Context(_call.data, _call.user),
            "TrustedForwarderConcurrentERC2771.sponsoredCallConcurrentERC2771:"
        );

        emit LogUseGelato1Balance(
            _sponsor,
            _call.target,
            _feeToken,
            _oneBalanceChainId,
            _nativeToFeeTokenXRateNumerator,
            _nativeToFeeTokenXRateDenominator,
            _correlationId
        );
    }

    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _getDomainSeparator();
    }

    function _getDomainSeparator() internal view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    keccak256(
                        bytes(
                            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                        )
                    ),
                    keccak256(bytes(name)),
                    keccak256(bytes(version)),
                    block.chainid,
                    address(this)
                )
            );
    }
}
