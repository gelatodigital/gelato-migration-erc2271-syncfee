# ERC-2771 Meta-Transaction Implementation for Gelato Relay

Enable gasless transactions for your smart contracts using EIP-712 signatures and Gelato Relay.

## 🚨 For Existing Customers

**Gelato is deprecating the old forwarder.** See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) for migration instructions.

**Quick Start:** [MIGRATION_QUICK_REFERENCE.md](./MIGRATION_QUICK_REFERENCE.md)

## 📋 For New Integrations

Choose your implementation approach:
- **Trusted Forwarder** - External contract handles signatures ([Jump to](#trusted-forwarder-approach))
- **Direct Integration** - Your contract handles signatures ([Jump to](#direct-integration-approach))

---

## Table of Contents

1. [Trusted Forwarder Approach](#trusted-forwarder-approach)
2. [Direct Integration Approach](#direct-integration-approach)
3. [Testing](#testing)
4. [Project Structure](#project-structure)

## Overview

**Meta-transactions** = Users sign messages, relayers pay gas fees.

### Two Implementation Approaches

| Approach | Description | Best For |
|----------|-------------|----------|
| **Trusted Forwarder** | External contract verifies signatures | Most use cases, upgradeable contracts |
| **Direct Integration** | Your contract verifies signatures | Self-contained contracts |

### Two Execution Modes

| Mode | Replay Protection | Concurrency | Best For |
|------|------------------|-------------|----------|
| **Sequential** | Nonce (0, 1, 2...) | No | Simple operations |
| **Concurrent** | Random salt | Yes | Batch operations |

---

## Trusted Forwarder Approach

**Architecture:** Deploy separate forwarder → Your contract trusts it → Minimal changes

### 1. Deploy Forwarder

```bash
# Sequential (nonce-based)
npx hardhat deploy --tags TrustedForwarder

# Concurrent (hash-based)
npx hardhat deploy --tags TrustedForwarderConcurrent
```

### 2. Update Your Contract

```solidity
import {ERC2771Context} from "@openzeppelin/contracts/metatx/ERC2771Context.sol";

contract YourContract is ERC2771Context {
    constructor(address trustedForwarder) ERC2771Context(trustedForwarder) {}
    
    function yourFunction() external {
        address user = _msgSender();  // Gets real user, not relayer
        // Your logic
    }
}
```

**Changes needed:**
- Inherit `ERC2771Context`
- Pass forwarder address to constructor  
- Use `_msgSender()` instead of `msg.sender`

### 3. Frontend Integration

```typescript
// 1. Sign EIP-712 message for FORWARDER
const domain = {
  name: "TrustedForwarder",  // or "TrustedForwarderConcurrentERC2771"
  version: "1",
  chainId: await signer.getChainId(),
  verifyingContract: forwarderAddress  // Forwarder, not your contract!
};

const types = {
  SponsoredCallERC2771: [
    { name: "chainId", type: "uint256" },
    { name: "target", type: "address" },
    { name: "data", type: "bytes" },
    { name: "user", type: "address" },
    { name: "userNonce", type: "uint256" },        // Sequential
    // { name: "userSalt", type: "bytes32" },      // Concurrent
    { name: "userDeadline", type: "uint256" }
  ]
};

const nonce = await forwarder.userNonce(userAddress);  // From forwarder
const message = {
  chainId: await signer.getChainId(),
  target: yourContractAddress,
  data: yourContract.interface.encodeFunctionData("yourFunction", []),
  user: userAddress,
  userNonce: nonce,
  userDeadline: 0
};

const signature = await signer.signTypedData(domain, types, message);

// 2. Send to Gelato
await gelatoRelay.sponsoredCall({
  target: forwarderAddress,  // Call forwarder, not your contract
  data: forwarder.interface.encodeFunctionData("sponsoredCallERC2771", [
    message, signature, /* other params */
  ])
});
```

**Examples:**
- Sequential: `contracts/SimpleCounterTrusted.sol` + `scripts/testSponsoredCallTrusted.ts`
- Concurrent: `contracts/SimpleCounterTrustedConcurrent.sol` + `scripts/testSponsoredCallTrustedConcurrent.ts`

---

## Direct Integration Approach

**Architecture:** No external contracts → Your contract handles everything

### 1. Update Contract Code

**Sequential mode:**
```solidity
import "./lib/EIP712MetaTransaction.sol";

contract YourContract is EIP712MetaTransaction("YourContract", "1") {
    function yourFunction() external {
        address user = msgSender();  // NO underscore!
        // Your logic
    }
}
```

**Concurrent mode:**
```solidity
import "./lib/EIP712HASHMetaTransaction.sol";

contract YourContract is EIP712HASHMetaTransaction("YourContract", "1") {
    function yourFunction() external {
        address user = msgSender();  // NO underscore!
        // Your logic
    }
}
```

**Changes needed:**
- Inherit `EIP712MetaTransaction` or `EIP712HASHMetaTransaction`
- Pass contract name and version
- Use `msgSender()` (no underscore!) instead of `msg.sender`

### 2. Frontend Integration

```typescript
// 1. Sign EIP-712 message for YOUR CONTRACT
const domain = {
  name: "YourContract",                     // Your contract name
  version: "1",
  verifyingContract: yourContractAddress,   // YOUR contract!
  salt: ethers.zeroPadValue(ethers.toBeHex(chainId), 32)  // Sequential
  // chainId: chainId                       // Concurrent
};

const types = {
  MetaTransaction: [
    { name: "nonce", type: "uint256" },              // Sequential
    // { name: "userSalt", type: "bytes32" },        // Concurrent
    { name: "from", type: "address" },
    { name: "functionSignature", type: "bytes" }
    // { name: "deadline", type: "uint256" }         // Concurrent
  ]
};

const nonce = await yourContract.getNonce(userAddress);  // From YOUR contract
const message = {
  nonce: nonce,
  from: userAddress,
  functionSignature: yourContract.interface.encodeFunctionData("yourFunction", [])
};

const signature = await signer.signTypedData(domain, types, message);
const { r, s, v } = ethers.Signature.from(signature);  // Sequential only

// 2. Send to Gelato
await gelatoRelay.sponsoredCall({
  target: yourContractAddress,  // Call YOUR contract
  data: yourContract.interface.encodeFunctionData("executeMetaTransaction",
    // Sequential:
    [userAddress, functionData, r, s, v]
    // Concurrent:
    // [userAddress, functionData, userSalt, deadline, signature]
  )
});
```

**Examples:**
- Sequential: `contracts/SimpleCounter.sol` + `scripts/testSponsoredCall.ts`
- Concurrent: `contracts/SimpleCounterHash.sol` + `scripts/testSponsoredCallHash.ts`

---

## Quick Comparison

| | Trusted Forwarder | Direct Integration |
|---|---|---|
| **Contract changes** | Minimal | Moderate |
| **External contracts** | Yes (forwarder) | No |
| **Sign for** | Forwarder | Your contract |
| **Best for** | Most use cases | Self-contained apps |
| **Contract function** | `_msgSender()` | `msgSender()` |

## Testing

```bash
# Install dependencies
npm install

# Run all tests
npx hardhat test

# Test specific implementation
npx hardhat test test/SimpleCounterTrusted.ts              # Forwarder Sequential
npx hardhat test test/SimpleCounterTrustedConcurrent.ts    # Forwarder Concurrent
npx hardhat test test/SimpleCounter.ts                     # Direct Sequential
npx hardhat test test/SimpleCounterHash.ts                 # Direct Concurrent

# Test with Gelato (requires .env with GELATO_RELAY_API_KEY)
npx ts-node scripts/testSponsoredCallTrusted.ts
npx ts-node scripts/testSponsoredCallTrustedConcurrent.ts
npx ts-node scripts/testSponsoredCall.ts
npx ts-node scripts/testSponsoredCallHash.ts
```

### Environment Setup

Create `.env`:
```env
GELATO_RELAY_API_KEY=your_api_key
PRIVATE_KEY=your_private_key
```

## Project Structure

```
contracts/
├── trustedForwarders/
│   ├── TrusteForwarderERC2771.sol           # Trusted Forwarder - Sequential
│   └── TrustedForwarderConcurrentERC2771.sol # Trusted Forwarder - Concurrent
├── lib/
│   ├── EIP712MetaTransaction.sol            # Direct Integration - Sequential
│   └── EIP712HASHMetaTransaction.sol        # Direct Integration - Concurrent
├── SimpleCounterTrusted.sol                 # Example: Forwarder Sequential
├── SimpleCounterTrustedConcurrent.sol       # Example: Forwarder Concurrent
├── SimpleCounter.sol                        # Example: Direct Sequential
└── SimpleCounterHash.sol                    # Example: Direct Concurrent

scripts/
├── testSponsoredCallTrusted.ts              # Gelato: Forwarder Sequential
├── testSponsoredCallTrustedConcurrent.ts    # Gelato: Forwarder Concurrent
├── testSponsoredCall.ts                     # Gelato: Direct Sequential
└── testSponsoredCallHash.ts                 # Gelato: Direct Concurrent

test/
├── SimpleCounterTrusted.ts
├── SimpleCounterTrustedConcurrent.ts
├── SimpleCounter.ts
└── SimpleCounterHash.ts
```

---

## Documentation

- **[MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)** - For existing customers migrating from old forwarder
- **[MIGRATION_QUICK_REFERENCE.md](./MIGRATION_QUICK_REFERENCE.md)** - Quick migration checklist
- **README.md** - This file (technical overview)

---

## Support

- 📖 [Gelato Docs](https://docs.gelato.network)
- 💬 [Discord](https://discord.gg/gelato)
- 🔑 [Get API Key](https://app.gelato.network)
