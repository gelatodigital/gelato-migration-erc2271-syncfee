//SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title EIP712HASHMetaTransaction
 * @notice Meta-transaction support using hash-based replay protection
 * @dev This contract implements a concurrent (non-sequential) meta-transaction system.
 *
 * ## Key Differences from EIP712MetaTransaction (nonce-based):
 *
 * - Uses `userSalt` (random bytes32) instead of sequential `nonce`
 * - Transactions can execute in any order
 * - Multiple transactions can be signed and submitted concurrently
 * - Failed transactions don't block others
 * - Optional deadline for time-bound validity
 *
 * ## Why Hash-Based Instead of Nonces?
 *
 * Traditional nonce-based systems require sequential execution:
 * - User signs tx with nonce=0, then nonce=1, then nonce=2...
 * - If tx with nonce=1 fails or is delayed, nonce=2 cannot execute
 * - This creates bottlenecks and poor UX for concurrent operations
 *
 * Hash-based replay protection allows:
 * - Any signed transaction can be executed in any order
 * - Multiple transactions can be submitted simultaneously
 * - No dependencies between transactions
 * - Failed transactions don't block others
 *
 * ## How It Works
 *
 * 1. User creates a unique `userSalt` (random bytes32) for each transaction
 * 2. User signs the typed data including the salt
 * 3. Contract computes the full message hash (digest)
 * 4. Contract marks the digest as "used" after successful execution
 * 5. Same digest cannot be replayed - the salt ensures uniqueness
 *
 * ## Usage:
 *
 * Inherit from this contract and use `msgSender()` instead of `msg.sender`
 * to get the original user address in meta-transactions.
 *
 * ```solidity
 * contract MyContract is EIP712HASHMetaTransaction("MyContract", "1") {
 *     function myFunction() external {
 *         address user = msgSender(); // Use this instead of msg.sender
 *     }
 * }
 * ```
 */
contract EIP712HASHMetaTransaction {
    using ECDSA for bytes32;

    // ============ Errors ============

    /// @notice Thrown when a message digest has already been used
    error DigestAlreadyUsed();

    /// @notice Thrown when the signature deadline has passed
    error DeadlineExpired();

    /// @notice Thrown when signature verification fails
    error InvalidSignature();

    // ============ Events ============

    /// @notice Emitted when a digest is marked as used
    event DigestUsed(bytes32 indexed digest, address indexed user);

    /// @notice Emitted when a meta-transaction is executed
    event MetaTransactionExecuted(
        address indexed userAddress,
        address payable relayerAddress,
        bytes functionSignature,
        bytes32 userSalt
    );

    // ============ Constants ============

    /// @notice EIP-712 domain type hash
    bytes32 public constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    /// @notice EIP-712 type hash for the MetaTransaction struct
    bytes32 private constant META_TRANSACTION_TYPEHASH =
        keccak256(bytes("MetaTransaction(bytes32 userSalt,address from,bytes functionSignature,uint256 deadline)"));

    // ============ Immutables ============

    /// @notice Cached domain separator (valid when chainId matches)
    bytes32 private immutable _cachedDomainSeparator;

    /// @notice Chain ID at deployment (used to detect forks)
    uint256 private immutable _cachedChainId;

    /// @notice Contract address at deployment (used for domain separator)
    address private immutable _cachedThis;

    /// @notice Keccak256 hash of the domain name
    bytes32 private immutable _hashedName;

    /// @notice Keccak256 hash of the domain version
    bytes32 private immutable _hashedVersion;

    // ============ State ============

    /// @notice Mapping of digest => used status for replay protection
    /// @dev A digest is the full EIP-712 hash including domain separator
    mapping(bytes32 digest => bool used) public digestUsed;

    // ============ Structs ============

    /**
     * @notice Meta transaction structure with hash-based replay protection
     * @param userSalt Unique random salt for this transaction (replaces nonce)
     * @param from The user who signed the meta-transaction
     * @param functionSignature The encoded function call to execute
     * @param deadline Unix timestamp after which signature expires (0 = no expiry)
     */
    struct MetaTransaction {
        bytes32 userSalt;
        address from;
        bytes functionSignature;
        uint256 deadline;
    }

    // ============ Constructor ============

    /**
     * @notice Initialize the EIP-712 domain
     * @param name The human-readable name of the signing domain (e.g., "MyContract")
     * @param version The version of the signing domain (e.g., "1")
     */
    constructor(string memory name, string memory version) {
        _hashedName = keccak256(bytes(name));
        _hashedVersion = keccak256(bytes(version));

        _cachedChainId = block.chainid;
        _cachedThis = address(this);
        _cachedDomainSeparator = _buildDomainSeparator();
    }

    // ============ External Functions ============

    /**
     * @notice Execute a meta-transaction on behalf of a user
     * @dev The relayer calls this function, but the action is attributed to userAddress
     * @param userAddress The user who signed the meta-transaction
     * @param functionSignature The encoded function call to execute
     * @param userSalt Unique salt for replay protection (use random bytes32)
     * @param deadline Unix timestamp after which signature expires (0 = no expiry)
     * @param signature The EIP-712 signature (65 bytes)
     * @return The return data from the function call
     */
    function executeMetaTransaction(
        address userAddress,
        bytes memory functionSignature,
        bytes32 userSalt,
        uint256 deadline,
        bytes calldata signature
    ) public payable returns (bytes memory) {
        // Prevent recursive calls to executeMetaTransaction
        require(
            _convertBytesToBytes4(functionSignature) != msg.sig,
            "functionSignature can not be of executeMetaTransaction method"
        );

        // Validate deadline if set
        if (deadline != 0 && block.timestamp > deadline) {
            revert DeadlineExpired();
        }

        // Verify and consume signature
        _verifyAndConsume(userAddress, functionSignature, userSalt, deadline, signature);

        // Append userAddress at the end to extract it from calling context
        (bool success, bytes memory returnData) = address(this).call(
            abi.encodePacked(functionSignature, userAddress)
        );

        require(success, "Function call not successful");
        emit MetaTransactionExecuted(userAddress, payable(msg.sender), functionSignature, userSalt);
        return returnData;
    }

    /**
     * @notice Internal function to verify signature and mark digest as used
     */
    function _verifyAndConsume(
        address userAddress,
        bytes memory functionSignature,
        bytes32 userSalt,
        uint256 deadline,
        bytes calldata signature
    ) private {
        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    META_TRANSACTION_TYPEHASH,
                    userSalt,
                    userAddress,
                    keccak256(functionSignature),
                    deadline
                )
            )
        );

        // Check replay protection
        if (digestUsed[digest]) {
            revert DigestAlreadyUsed();
        }

        // Verify signature
        (address recovered, ECDSA.RecoverError error) = ECDSA.tryRecover(digest, signature);
        if (error != ECDSA.RecoverError.NoError || recovered != userAddress) {
            revert InvalidSignature();
        }

        // Mark as used BEFORE any external calls (CEI pattern)
        digestUsed[digest] = true;
        emit DigestUsed(digest, userAddress);
    }

    /**
     * @notice Get the digest for a meta-transaction (for off-chain signing)
     * @param userAddress The user address
     * @param functionSignature The encoded function call
     * @param userSalt The unique salt
     * @param deadline The expiration timestamp
     * @return The EIP-712 digest to sign
     */
    function getDigest(
        address userAddress,
        bytes memory functionSignature,
        bytes32 userSalt,
        uint256 deadline
    ) external view returns (bytes32) {
        MetaTransaction memory metaTx = MetaTransaction({
            userSalt: userSalt,
            from: userAddress,
            functionSignature: functionSignature,
            deadline: deadline
        });
        return _hashTypedDataV4(_hashMetaTransaction(metaTx));
    }

    /**
     * @notice Verify a meta-transaction signature without executing
     * @param userAddress The expected signer
     * @param functionSignature The encoded function call
     * @param userSalt The unique salt
     * @param deadline The expiration timestamp
     * @param signature The signature to verify
     * @return valid True if the signature is valid and digest is unused
     */
    function verify(
        address userAddress,
        bytes memory functionSignature,
        bytes32 userSalt,
        uint256 deadline,
        bytes calldata signature
    ) external view returns (bool valid) {
        // Check deadline
        if (deadline != 0 && block.timestamp > deadline) {
            return false;
        }

        MetaTransaction memory metaTx = MetaTransaction({
            userSalt: userSalt,
            from: userAddress,
            functionSignature: functionSignature,
            deadline: deadline
        });

        bytes32 structHash = _hashMetaTransaction(metaTx);
        bytes32 digest = _hashTypedDataV4(structHash);

        // Check if already used
        if (digestUsed[digest]) {
            return false;
        }

        // Verify signature
        (address recovered, ECDSA.RecoverError error) = ECDSA.tryRecover(digest, signature);
        return error == ECDSA.RecoverError.NoError && recovered == userAddress;
    }

    // ============ Public View Functions ============

    /**
     * @notice Returns the domain separator for the current chain
     * @dev Recomputes if chain ID has changed (fork protection)
     * @return The EIP-712 domain separator
     */
    function domainSeparator() public view returns (bytes32) {
        if (address(this) == _cachedThis && block.chainid == _cachedChainId) {
            return _cachedDomainSeparator;
        }
        return _buildDomainSeparator();
    }

    /**
     * @notice Check if a digest has been used
     * @param digest The EIP-712 digest to check
     * @return True if the digest has been used
     */
    function isDigestUsed(bytes32 digest) external view returns (bool) {
        return digestUsed[digest];
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

    // ============ Private Functions ============

    /**
     * @notice Compute the struct hash for a meta-transaction
     * @param metaTx The meta-transaction struct
     * @return The keccak256 hash of the encoded struct
     */
    function _hashMetaTransaction(MetaTransaction memory metaTx) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                META_TRANSACTION_TYPEHASH,
                metaTx.userSalt,
                metaTx.from,
                keccak256(metaTx.functionSignature),
                metaTx.deadline
            )
        );
    }

    /**
     * @notice Hash typed data according to EIP-712
     * @param structHash The hash of the struct
     * @return The full EIP-712 digest
     */
    function _hashTypedDataV4(bytes32 structHash) private view returns (bytes32) {
        return ECDSA.toTypedDataHash(domainSeparator(), structHash);
    }

    /**
     * @notice Build the domain separator
     * @return The computed domain separator
     */
    function _buildDomainSeparator() private view returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                _hashedName,
                _hashedVersion,
                block.chainid,
                address(this)
            )
        );
    }

    /**
     * @notice Convert bytes to bytes4 (function selector)
     * @param inBytes The input bytes
     * @return outBytes4 The first 4 bytes as bytes4
     */
    function _convertBytesToBytes4(bytes memory inBytes) private pure returns (bytes4 outBytes4) {
        if (inBytes.length == 0) {
            return 0x0;
        }

        assembly {
            outBytes4 := mload(add(inBytes, 32))
        }
    }
}
