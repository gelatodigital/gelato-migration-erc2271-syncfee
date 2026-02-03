# Gelato Relay Migration Guide

> **⚠️ DISCLAIMER:** All Solidity contracts (`.sol` files) in this repository are provided as **examples for educational purposes only**. They have **NOT been audited** and may contain bugs or security vulnerabilities. **USE AT YOUR OWN RISK.** For production use, please ensure proper security audits are conducted by qualified professionals.

Gelato is deprecating legacy relay patterns. This repository provides **migration guides and examples** for updating your integration.

## 🚨 Migration Required

| Legacy Pattern | Migration Guide |
|----------------|-----------------|
| **ERC-2771 Trusted Forwarder** | [ERC2771_MIGRATION.md](./ERC2771_MIGRATION.md) |
| **SyncFee / `GelatoRelayContext`** | [SYNCFEE_MIGRATION.md](./SYNCFEE_MIGRATION.md) |

---

## What's Changing?

### ERC-2771 Meta-Transactions

**The old Gelato trusted forwarder is being deprecated and will no longer be available.** Gelato will not provide a replacement forwarder.

To continue using ERC-2771 meta-transactions, you must **deploy your own trusted forwarder**.

**Migration:** [ERC2771_MIGRATION.md](./ERC2771_MIGRATION.md)

### SyncFee / GelatoRelayContext

**The old SyncFee pattern is being deprecated.** The `callWithSyncFee` method and `GelatoRelayContext` inheritance will no longer be available, and Gelato will not provide a replacement.

To continue collecting fees from users, you must **implement token collection as part of your custom contract logic** and use **sponsored transactions**.

**Migration:** [SYNCFEE_MIGRATION.md](./SYNCFEE_MIGRATION.md)

---

## Project Structure

```
contracts/
├── trustedForwarders/
│   ├── TrusteForwarderERC2771.sol           # Trusted Forwarder - Sequential
│   └── TrustedForwarderConcurrentERC2771.sol # Trusted Forwarder - Concurrent
├── mocks/
│   └── MockERC20Permit.sol                  # Mock token for testing
├── SimpleCounterTrusted.sol                 # Example: ERC2771 Sequential
└── SimpleCounterTrustedConcurrent.sol       # Example: ERC2771 Concurrent

scripts/
├── testSponsoredCallTrusted.ts              # Gelato: ERC2771 Sequential
└── testSponsoredCallTrustedConcurrent.ts    # Gelato: ERC2771 Concurrent

test/
├── SimpleCounterTrusted.ts
└── SimpleCounterTrustedConcurrent.ts
```

---

## Testing

```bash
# Install dependencies
npm install

# Run all tests
npx hardhat test

# Test ERC2771 implementations
npx hardhat test test/SimpleCounterTrusted.ts              # Sequential
npx hardhat test test/SimpleCounterTrustedConcurrent.ts    # Concurrent

# Test with Gelato (requires .env with GELATO_API_KEY)
npx ts-node scripts/testSponsoredCallTrusted.ts
npx ts-node scripts/testSponsoredCallTrustedConcurrent.ts
```

### Environment Setup

1. Copy the example environment file:
```bash
cp .env-example .env
```

2. Fill in your credentials in `.env`:
```env
# Required: Your wallet private key for signing transactions
PRIVATE_KEY=your_private_key_here

# Required: Gelato API key for relay services
# Get yours at: https://app.gelato.cloud
GELATO_API_KEY=your_gelato_api_key_here
```

**Where to get these:**
- **PRIVATE_KEY**: Export from your wallet (MetaMask: Account Details → Export Private Key)
- **GELATO_API_KEY**: Sign up at [app.gelato.network](https://app.gelato.cloud) and create an API key

---

## Support

- [Gelato Docs](https://docs.gelato.network)
- [Discord](https://discord.gg/gelato)
- [Get API Key](https://app.gelato.network)
