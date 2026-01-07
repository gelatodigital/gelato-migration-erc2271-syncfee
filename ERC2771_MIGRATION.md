# Migration Guide: Gelato Trusted Forwarder Deprecation

## Important Notice

Gelato is **deprecating the trusted forwarder** contracts. The old forwarder will no longer be available, and Gelato will not provide a replacement.

To continue using ERC-2771 meta-transactions, you must **deploy your own trusted forwarder** and update your integration.

---

## Migration Steps

### Step 1: Deploy Your Own Trusted Forwarder

Choose between two forwarder types based on your needs:

| Type | Replay Protection | Use Case |
|------|------------------|----------|
| **Sequential** | Nonce (0, 1, 2...) | Simple operations, ordered transactions |
| **Concurrent** | Random salt (hash-based) | Batch operations, parallel transactions |

#### Deploy Sequential Forwarder (Nonce-based)

```bash
npx hardhat deploy --tags TrustedForwarder --network yourNetwork
```

Contract: `contracts/trustedForwarders/TrusteForwarderERC2771.sol`

#### Deploy Concurrent Forwarder (Hash-based)

```bash
npx hardhat deploy --tags TrustedForwarderConcurrent --network yourNetwork
```

Contract: `contracts/trustedForwarders/TrustedForwarderConcurrentERC2771.sol`

**Save your deployed forwarder address** - you'll need it for the next steps.

---

### Step 2: Whitelist the Trusted Forwarder in Your Contract

Your contract must trust the new forwarder address. How you do this depends on your contract's architecture:

#### If your contract has an updateable forwarder (setter function or upgradeable proxy):

```solidity
// Call your existing setter
yourContract.setTrustedForwarder(newForwarderAddress);
```

#### If your contract has an immutable forwarder (set in constructor):

You'll need to redeploy your contract with the new forwarder address:

```solidity
// Your existing contract code (no changes needed)
contract YourContract is ERC2771Context {
    constructor(address trustedForwarder) ERC2771Context(trustedForwarder) {}

    function yourFunction() external {
        address user = _msgSender();  // Still works the same
        // ...
    }
}
```

Deploy with your new forwarder address:

```bash
npx hardhat deploy --tags YourContract --network yourNetwork
```

> **Note:** If you redeploy, existing contract state (data) will NOT transfer. Plan a migration strategy if needed.

---

### Step 3: Update Frontend Encoding

Previously, Gelato handled the encoding to the trusted forwarder internally. Now **you must encode the call to the forwarder yourself**.

#### Old Way (Gelato did this for you)

```typescript
// You only encoded the target function call
const functionData = contract.interface.encodeFunctionData("yourFunction", [args]);

// Sent to Gelato, which encoded to forwarder internally
await gelatoRelay.sponsoredCall({
  target: yourContractAddress,  // Your contract
  data: functionData            // Just the function call
});
```

#### New Way (Sequential Forwarder)

```typescript
import { ethers } from "ethers";

// 1. Encode your function call
const functionData = yourContract.interface.encodeFunctionData("yourFunction", [args]);

// 2. Get user's nonce from YOUR forwarder
const userNonce = await trustedForwarder.userNonce(userAddress);

// 3. Create EIP-712 domain for YOUR forwarder
const domain = {
  name: "TrustedForwarder",
  version: "1",
  chainId: chainId,
  verifyingContract: trustedForwarderAddress  // YOUR forwarder address
};

// 4. Define the type structure
const types = {
  SponsoredCallERC2771: [
    { name: "chainId", type: "uint256" },
    { name: "target", type: "address" },
    { name: "data", type: "bytes" },
    { name: "user", type: "address" },
    { name: "userNonce", type: "uint256" },
    { name: "userDeadline", type: "uint256" }
  ]
};

// 5. Create the message
const message = {
  chainId: chainId,
  target: yourContractAddress,    // Your contract (the target)
  data: functionData,             // Your function call
  user: userAddress,
  userNonce: userNonce,           // From forwarder
  userDeadline: 0                 // 0 = no expiry
};

// 6. User signs the message
const signature = await signer.signTypedData(domain, types, message);

// 7. Encode the call to the forwarder
const forwarderData = trustedForwarder.interface.encodeFunctionData(
  "sponsoredCallERC2771",
  [
    message,           // The CallWithERC2771 struct
    sponsorAddress,    // Who pays (can be same as user)
    feeToken,          // Fee token address
    oneBalanceChainId, // Chain ID for 1Balance
    signature,         // User's signature
    0,                 // nativeToFeeTokenXRateNumerator
    0,                 // nativeToFeeTokenXRateDenominator
    ethers.ZeroHash    // correlationId
  ]
);

// 8. Send to Gelato with FORWARDER as target
await gelatoRelay.sponsoredCall({
  target: trustedForwarderAddress,  // YOUR forwarder, not your contract!
  data: forwarderData
});
```

#### New Way (Concurrent Forwarder)

```typescript
import { ethers } from "ethers";

// 1. Encode your function call
const functionData = yourContract.interface.encodeFunctionData("yourFunction", [args]);

// 2. Generate a unique salt (random bytes32)
const userSalt = ethers.hexlify(ethers.randomBytes(32));

// 3. Create EIP-712 domain for YOUR forwarder
const domain = {
  name: "TrustedForwarderConcurrentERC2771",
  version: "1",
  chainId: chainId,
  verifyingContract: trustedForwarderAddress  // YOUR forwarder address
};

// 4. Define the type structure
const types = {
  SponsoredCallConcurrentERC2771: [
    { name: "chainId", type: "uint256" },
    { name: "target", type: "address" },
    { name: "data", type: "bytes" },
    { name: "user", type: "address" },
    { name: "userSalt", type: "bytes32" },
    { name: "userDeadline", type: "uint256" }
  ]
};

// 5. Create the message
const message = {
  chainId: chainId,
  target: yourContractAddress,    // Your contract (the target)
  data: functionData,             // Your function call
  user: userAddress,
  userSalt: userSalt,             // Random salt for replay protection
  userDeadline: 0                 // 0 = no expiry
};

// 6. User signs the message
const signature = await signer.signTypedData(domain, types, message);

// 7. Encode the call to the forwarder
const forwarderData = trustedForwarder.interface.encodeFunctionData(
  "sponsoredCallConcurrentERC2771",
  [
    message,           // The CallWithConcurrentERC2771 struct
    sponsorAddress,    // Who pays
    feeToken,          // Fee token address
    oneBalanceChainId, // Chain ID for 1Balance
    signature,         // User's signature
    0,                 // nativeToFeeTokenXRateNumerator
    0,                 // nativeToFeeTokenXRateDenominator
    ethers.ZeroHash    // correlationId
  ]
);

// 8. Send to Gelato with FORWARDER as target
await gelatoRelay.sponsoredCall({
  target: trustedForwarderAddress,  // YOUR forwarder, not your contract!
  data: forwarderData
});
```

---

## Key Changes Summary

| What | Before (Gelato handled it) | After (You handle it) |
|------|---------------------------|----------------------|
| **Forwarder** | Gelato's forwarder | Your deployed forwarder |
| **EIP-712 Domain** | - | Sign for YOUR forwarder |
| **Domain name** | - | `"TrustedForwarder"` or `"TrustedForwarderConcurrentERC2771"` |
| **Domain verifyingContract** | - | Your forwarder address |
| **Get nonce from** | - | Your forwarder (sequential only) |
| **Gelato target** | Your contract | Your forwarder |
| **Encoding** | Just your function | Full forwarder call |

---

## Sequential vs Concurrent

| Feature | Sequential | Concurrent |
|---------|-----------|------------|
| **Replay protection** | Nonce (0, 1, 2...) | Random salt |
| **Transaction order** | Must be in order | Any order |
| **Parallel transactions** | No | Yes |
| **Failed tx blocks others** | Yes | No |
| **Get from forwarder** | `userNonce(address)` | Nothing (generate salt) |
| **EIP-712 type name** | `SponsoredCallERC2771` | `SponsoredCallConcurrentERC2771` |
| **Forwarder function** | `sponsoredCallERC2771()` | `sponsoredCallConcurrentERC2771()` |

---

## Migration Checklist

- [ ] **Step 1:** Deploy trusted forwarder (sequential or concurrent)
- [ ] **Step 2:** Whitelist forwarder in your contract (update address or redeploy)
- [ ] **Step 3:** Update frontend to encode calls to your forwarder
- [ ] Test on testnet
- [ ] Deploy to production

---

## Common Issues

### "Signature verification failed"

- Ensure domain `verifyingContract` is your **forwarder address** (not your contract)
- Ensure domain `name` matches exactly: `"TrustedForwarder"` or `"TrustedForwarderConcurrentERC2771"`
- Ensure `chainId` matches the network

### "Nonce mismatch" (Sequential only)

- Get fresh nonce from forwarder before each signature: `forwarder.userNonce(user)`
- Don't reuse old signatures

### "Replay" error (Concurrent only)

- Generate a new random `userSalt` for each transaction
- Don't reuse salts

### "Wrong user address in contract"

- Ensure your contract uses `_msgSender()` (from `ERC2771Context`)
- Ensure the forwarder is whitelisted in your contract

---

## Example Implementations

See the example scripts for complete implementations:

- **Sequential:** `scripts/testSponsoredCallTrusted.ts`
- **Concurrent:** `scripts/testSponsoredCallTrustedConcurrent.ts`

See the example contracts:

- **Sequential Forwarder:** `contracts/trustedForwarders/TrusteForwarderERC2771.sol`
- **Concurrent Forwarder:** `contracts/trustedForwarders/TrustedForwarderConcurrentERC2771.sol`
- **Example Contract (Sequential):** `contracts/SimpleCounterTrusted.sol`
- **Example Contract (Concurrent):** `contracts/SimpleCounterTrustedConcurrent.sol`

---

## Support

- [Gelato Docs](https://docs.gelato.network)
- [Discord](https://discord.gg/gelato)
- [Get API Key](https://app.gelato.network)
