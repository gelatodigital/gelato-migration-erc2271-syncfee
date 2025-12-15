//SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

/**
 * @title EIP712MetaTransaction
 * @notice Meta-transaction support using nonce-based replay protection
 * @dev This contract implements a sequential meta-transaction system.
 *
 * ## How It Works
 *
 * 1. Each user has a sequential nonce starting at 0
 * 2. User signs typed data including their current nonce
 * 3. Contract verifies signature and increments nonce
 * 4. Transactions must be executed in order (nonce 0, then 1, then 2...)
 *
 * ## Usage:
 *
 * Inherit from this contract and use `msgSender()` instead of `msg.sender`
 * to get the original user address in meta-transactions.
 *
 * ```solidity
 * contract MyContract is EIP712MetaTransaction("MyContract", "1") {
 *     function myFunction() external {
 *         address user = msgSender(); // Use this instead of msg.sender
 *     }
 * }
 * ```
 */
contract EIP712MetaTransaction {
    // ============ Structs ============

    struct EIP712Domain {
        string name;
        string version;
        address verifyingContract;
        bytes32 salt;
    }

    /**
     * @notice Meta transaction structure
     * @param nonce Sequential nonce for replay protection
     * @param from The user who signed the meta-transaction
     * @param functionSignature The encoded function call to execute
     */
    struct MetaTransaction {
        uint256 nonce;
        address from;
        bytes functionSignature;
    }

    // ============ Constants ============

    bytes32 internal constant EIP712_DOMAIN_TYPEHASH =
        keccak256(bytes("EIP712Domain(string name,string version,address verifyingContract,bytes32 salt)"));

    bytes32 private constant META_TRANSACTION_TYPEHASH =
        keccak256(bytes("MetaTransaction(uint256 nonce,address from,bytes functionSignature)"));

    // ============ State ============

    bytes32 internal domainSeparator;
    mapping(address => uint256) private nonces;

    // ============ Events ============

    event MetaTransactionExecuted(
        address userAddress,
        address payable relayerAddress,
        bytes functionSignature
    );

    // ============ Constructor ============

    constructor(string memory name, string memory version) {
        domainSeparator = keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                address(this),
                bytes32(block.chainid)
            )
        );
    }

    // ============ External Functions ============

    /**
     * @notice Execute a meta-transaction on behalf of a user
     * @param userAddress The user who signed the meta-transaction
     * @param functionSignature The encoded function call to execute
     * @param sigR ECDSA signature r component
     * @param sigS ECDSA signature s component
     * @param sigV ECDSA signature v component
     * @return The return data from the function call
     */
    function executeMetaTransaction(
        address userAddress,
        bytes memory functionSignature,
        bytes32 sigR,
        bytes32 sigS,
        uint8 sigV
    ) public payable returns (bytes memory) {
        bytes4 destinationFunctionSig = _convertBytesToBytes4(functionSignature);
        require(
            destinationFunctionSig != msg.sig,
            "functionSignature can not be of executeMetaTransaction method"
        );

        MetaTransaction memory metaTx = MetaTransaction({
            nonce: nonces[userAddress],
            from: userAddress,
            functionSignature: functionSignature
        });

        require(
            _verify(userAddress, metaTx, sigR, sigS, sigV),
            "Signer and signature do not match"
        );

        nonces[userAddress] = nonces[userAddress] + 1;

        // Append userAddress at the end to extract it from calling context
        (bool success, bytes memory returnData) = address(this).call(
            abi.encodePacked(functionSignature, userAddress)
        );

        require(success, "Function call not successful");
        emit MetaTransactionExecuted(userAddress, payable(msg.sender), functionSignature);
        return returnData;
    }

    /**
     * @notice Get the current nonce for a user
     * @param user The user address
     * @return nonce The current nonce
     */
    function getNonce(address user) external view returns (uint256 nonce) {
        nonce = nonces[user];
    }

    // ============ Internal Functions ============

    /**
     * @notice Get the original sender of a meta-transaction
     * @dev Use this instead of msg.sender in your contract functions
     * @return sender The original user address (or msg.sender if called directly)
     */
    function msgSender() internal view returns (address sender) {
        if (msg.sender == address(this)) {
            bytes memory array = msg.data;
            uint256 index = msg.data.length;
            assembly {
                // Load the 32 bytes word from memory with the address on the lower 20 bytes, and mask those.
                sender := and(mload(add(array, index)), 0xffffffffffffffffffffffffffffffffffffffff)
            }
        } else {
            sender = msg.sender;
        }
        return sender;
    }

    /**
     * @notice Hash typed data according to EIP-712
     * @param messageHash The struct hash
     * @return The full EIP-712 digest
     */
    function toTypedMessageHash(bytes32 messageHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, messageHash));
    }

    // ============ Private Functions ============

    function _hashMetaTransaction(MetaTransaction memory metaTx) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                META_TRANSACTION_TYPEHASH,
                metaTx.nonce,
                metaTx.from,
                keccak256(metaTx.functionSignature)
            )
        );
    }

    function _verify(
        address user,
        MetaTransaction memory metaTx,
        bytes32 sigR,
        bytes32 sigS,
        uint8 sigV
    ) private view returns (bool) {
        address signer = ecrecover(
            toTypedMessageHash(_hashMetaTransaction(metaTx)),
            sigV,
            sigR,
            sigS
        );
        require(signer != address(0), "Invalid signature");
        return signer == user;
    }

    function _convertBytesToBytes4(bytes memory inBytes) private pure returns (bytes4 outBytes4) {
        if (inBytes.length == 0) {
            return 0x0;
        }

        assembly {
            outBytes4 := mload(add(inBytes, 32))
        }
    }
}
