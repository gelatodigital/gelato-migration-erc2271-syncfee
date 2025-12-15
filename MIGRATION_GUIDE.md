# Migration Guide: Gelato Trusted Forwarder Update

## ⚠️ Important Notice

Gelato is **deprecating the current trusted forwarder** contracts. All existing customers must migrate to one of the new solutions.

---

## 🔍 Current State

You are currently using:
- ✅ Gelato's deployed `TrustedForwarder` contract
- ✅ Your contract inherits `ERC2771Context` 
- ✅ Frontend encodes only the target contract call
- ✅ Gelato handles encoding to the forwarder

**This will no longer be supported.**

---

## 🎯 Migration Paths

Choose based on **whether you can update your trusted forwarder address**:

```
Can your contract update the trusted forwarder address?
│
├─ YES (updateable or upgradeable)
│  └─ Option 1: Whitelist New Forwarder ← EASIEST
│
└─ NO (immutable forwarder address)
   ├─ Option 2: Deploy Your Own Forwarder
   └─ Option 3: Switch to Direct EIP-712 Integration
```

---

## Option 1: Whitelist New Forwarder ⭐ RECOMMENDED

**Best if:** Your contract can update the trusted forwarder address (upgradeable proxy, setter function, etc.)

### What Changes

| Component | Before | After |
|-----------|--------|-------|
| Smart Contract | No changes needed | No changes needed |
| Forwarder Address | Old Gelato forwarder | New Gelato forwarder |
| Frontend Encoding | Gelato handles it | **You must encode to forwarder** |

### Steps

#### 1. Update Trusted Forwarder Address

If upgradeable:
```solidity
// In your contract or proxy
function updateTrustedForwarder(address newForwarder) external onlyOwner {
    _trustedForwarder = newForwarder;
}
```

Call with new forwarder address (provided by Gelato).

#### 2. Update Frontend Encoding ⚠️ CRITICAL

**OLD WAY (Gelato did this for you):**
```typescript
// You only encoded the target function call
const functionData = contract.interface.encodeFunctionData("yourFunction", [args]);

// Sent to Gelato, which encoded to forwarder internally
await gelatoRelay.sponsoredCall({
  target: yourContractAddress,  // Your contract
  data: functionData            // Just the function call
});
```

**NEW WAY (You must do the full encoding):**

```typescript
// 1. Encode your function call
const functionData = contract.interface.encodeFunctionData("yourFunction", [args]);

// 2. Get user's nonce from forwarder
const userNonce = await trustedForwarder.userNonce(userAddress);

// 3. Create EIP-712 message for FORWARDER
const domain = {
  name: "TrustedForwarder",  // or "TrustedForwarderConcurrentERC2771"
  version: "1",
  chainId: await signer.getChainId(),
  verifyingContract: trustedForwarderAddress  // NEW forwarder address
};

const types = {
  SponsoredCallERC2771: [  // or SponsoredCallConcurrentERC2771
    { name: "chainId", type: "uint256" },
    { name: "target", type: "address" },
    { name: "data", type: "bytes" },
    { name: "user", type: "address" },
    { name: "userNonce", type: "uint256" },        // Sequential
    // { name: "userSalt", type: "bytes32" },      // Concurrent
    { name: "userDeadline", type: "uint256" }
  ]
};

const message = {
  chainId: await signer.getChainId(),
  target: yourContractAddress,     // Your contract
  data: functionData,               // Your function call
  user: userAddress,
  userNonce: userNonce,             // From forwarder
  userDeadline: 0                   // 0 = no expiry
};

// 4. User signs the message
const signature = await signer.signTypedData(domain, types, message);

// 5. Send to Gelato with forwarder as target
await gelatoRelay.sponsoredCall({
  target: trustedForwarderAddress,  // ⚠️ Forwarder, not your contract!
  data: trustedForwarder.interface.encodeFunctionData(
    "sponsoredCallERC2771",
    [message, signature, /* other params */]
  )
});
```

**Key Changes:**
- ✅ User signs message **for the forwarder** (not your contract)
- ✅ Domain `verifyingContract` is **forwarder address**
- ✅ Target in Gelato call is **forwarder address**
- ✅ You handle all encoding

#### 3. Test

- [ ] Test with new forwarder on testnet
- [ ] Verify signatures work
- [ ] Verify `_msgSender()` returns correct user
- [ ] Update production

### Timeline

- **Week 1:** Update frontend encoding logic
- **Week 2:** Test on testnet
- **Week 3:** Update forwarder address in production
- **Week 4:** Deploy frontend changes

---

## Option 2: Deploy Your Own Forwarder

**Best if:** 
- You cannot update the forwarder address
- You want full control over the forwarder
- You have multiple contracts using the same forwarder

### What Changes

| Component | Before | After |
|-----------|--------|-------|
| Forwarder Contract | Gelato's deployment | **Your deployment** |
| Your Smart Contract | **Must redeploy** with new forwarder | New deployment |
| Frontend Encoding | Gelato handles it | **You must encode to forwarder** |

### Steps

#### 1. Deploy Forwarder

**Sequential (nonce-based):**
```solidity
// contracts/trustedForwarders/TrusteForwarderERC2771.sol
contract TrustedForwarderERC2771 { /* ... */ }
```

**Concurrent (hash-based):**
```solidity
// contracts/trustedForwarders/TrustedForwarderConcurrentERC2771.sol
contract TrustedForwarderConcurrentERC2771 { /* ... */ }
```

Deploy:
```bash
npx hardhat deploy --tags TrustedForwarder
# or
npx hardhat deploy --tags TrustedForwarderConcurrent
```

Save the deployed address.

#### 2. Redeploy Your Contract

Your contract code **doesn't change**, but you must redeploy with the new forwarder address:

```solidity
// Your existing contract (no code changes)
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
npx hardhat deploy --tags YourContract
```

⚠️ **Migration Considerations:**
- Existing contract state (data) will NOT transfer
- You'll need a migration strategy for user data
- Consider using a proxy pattern in the future

#### 3. Update Frontend

Same frontend changes as Option 1 (see above) - you now handle all encoding.

#### 4. Notify Users

If this is a new contract address:
- Update your frontend to use the new contract
- Notify users of the new contract address
- Provide migration tools if needed (transfer data, etc.)

### Timeline

- **Week 1:** Deploy new forwarder
- **Week 2:** Deploy new contracts, test on testnet
- **Week 3:** Update frontend encoding
- **Week 4:** Migrate to production, notify users

---

## Option 3: Switch to Direct EIP-712 Integration

**Best if:** 
- You cannot update forwarder and don't want to redeploy
- You prefer self-contained contracts
- You're deploying new contracts anyway

### What Changes

| Component | Before | After |
|-----------|--------|-------|
| Forwarder Contract | Gelato's deployment | **None (removed)** |
| Your Smart Contract | Inherits `ERC2771Context` | **Inherits `EIP712MetaTransaction`** |
| Frontend Encoding | Gelato handles encoding to forwarder | **You encode to your contract** |
| `_msgSender()` | From `ERC2771Context` | **Change to `msgSender()`** |

### Steps

#### 1. Update Contract Code

**Before:**
```solidity
import {ERC2771Context} from "@openzeppelin/contracts/metatx/ERC2771Context.sol";

contract YourContract is ERC2771Context {
    constructor(address trustedForwarder) ERC2771Context(trustedForwarder) {}
    
    function yourFunction() external {
        address user = _msgSender();  // With underscore
        // ...
    }
}
```

**After (Sequential):**
```solidity
import "./lib/EIP712MetaTransaction.sol";

contract YourContract is EIP712MetaTransaction("YourContract", "1") {
    // No constructor parameter needed
    
    function yourFunction() external {
        address user = msgSender();  // NO underscore!
        // ...
    }
}
```

**After (Concurrent):**
```solidity
import "./lib/EIP712HASHMetaTransaction.sol";

contract YourContract is EIP712HASHMetaTransaction("YourContract", "1") {
    function yourFunction() external {
        address user = msgSender();  // NO underscore!
        // ...
    }
}
```

**Changes Required:**
1. Remove `ERC2771Context` inheritance
2. Add `EIP712MetaTransaction` or `EIP712HASHMetaTransaction` inheritance
3. Remove forwarder parameter from constructor
4. Change **ALL** `_msgSender()` → `msgSender()` (remove underscore)
5. Change **ALL** `_msgData()` → `msgData()` (remove underscore)

#### 2. Redeploy Contract

```bash
npx hardhat compile
npx hardhat deploy --tags YourContract
```

⚠️ **This is a new contract address** - see migration considerations in Option 2.

#### 3. Update Frontend

**NEW WAY (No forwarder):**

```typescript
// 1. Encode your function call
const functionData = contract.interface.encodeFunctionData("yourFunction", [args]);

// 2. Get user's nonce from YOUR CONTRACT (not forwarder)
const nonce = await yourContract.getNonce(userAddress);

// 3. Create EIP-712 message for YOUR CONTRACT
const domain = {
  name: "YourContract",              // Your contract name
  version: "1",
  verifyingContract: yourContractAddress,  // YOUR contract!
  salt: ethers.zeroPadValue(ethers.toBeHex(chainId), 32)  // Sequential only
  // chainId: chainId                 // Concurrent only
};

const types = {
  MetaTransaction: [
    { name: "nonce", type: "uint256" },           // Sequential
    // { name: "userSalt", type: "bytes32" },     // Concurrent
    { name: "from", type: "address" },
    { name: "functionSignature", type: "bytes" }
    // { name: "deadline", type: "uint256" }      // Concurrent
  ]
};

const message = {
  nonce: nonce,                      // Sequential
  // userSalt: randomBytes32,        // Concurrent
  from: userAddress,
  functionSignature: functionData
  // deadline: 0                     // Concurrent
};

// 4. User signs the message
const signature = await signer.signTypedData(domain, types, message);
const { r, s, v } = ethers.Signature.from(signature);  // Sequential only

// 5. Encode executeMetaTransaction call
const metaTxData = yourContract.interface.encodeFunctionData(
  "executeMetaTransaction",
  // Sequential:
  [userAddress, functionData, r, s, v]
  // Concurrent:
  // [userAddress, functionData, userSalt, deadline, signature]
);

// 6. Send to Gelato with YOUR CONTRACT as target
await gelatoRelay.sponsoredCall({
  target: yourContractAddress,       // YOUR contract, not forwarder!
  data: metaTxData
});
```

**Key Changes:**
- ✅ User signs message **for your contract** (not forwarder)
- ✅ Domain `verifyingContract` is **your contract address**
- ✅ Get nonce from **your contract** (not forwarder)
- ✅ Target in Gelato call is **your contract address**
- ✅ Call `executeMetaTransaction()` (automatically inherited)

### Timeline

- **Week 1-2:** Update contract code, test locally
- **Week 3:** Deploy new contract on testnet, test
- **Week 4:** Update frontend
- **Week 5:** Production deployment
- **Week 6:** User migration

---

## 🔄 Frontend Encoding Comparison

### Sequential Mode

| What | Old (Gelato did it) | Option 1 & 2 (Forwarder) | Option 3 (Direct) |
|------|---------------------|--------------------------|-------------------|
| **Sign for** | - | Forwarder | Your contract |
| **Domain name** | - | `"TrustedForwarder"` | `"YourContract"` |
| **Domain verifyingContract** | - | Forwarder address | Your contract address |
| **Domain salt** | - | None | `bytes32(chainId)` |
| **Get nonce from** | - | Forwarder | Your contract |
| **Gelato target** | Your contract | Forwarder | Your contract |
| **Function to call** | Your function | `sponsoredCallERC2771()` | `executeMetaTransaction()` |

### Concurrent Mode

| What | Old | Option 1 & 2 (Forwarder) | Option 3 (Direct) |
|------|-----|--------------------------|-------------------|
| **Sign for** | - | Forwarder | Your contract |
| **Domain name** | - | `"TrustedForwarderConcurrentERC2771"` | `"YourContract"` |
| **Domain chainId** | - | None | Chain ID (not as salt) |
| **Replay protection** | - | `userSalt` (random) | `userSalt` (random) |
| **Gelato target** | Your contract | Forwarder | Your contract |
| **Function to call** | Your function | `sponsoredCallConcurrentERC2771()` | `executeMetaTransaction()` |

---

## 📋 Decision Matrix

| Factor | Option 1: New Forwarder | Option 2: Deploy Own | Option 3: Direct Integration |
|--------|------------------------|---------------------|----------------------------|
| **Contract can update forwarder?** | ✅ Required | ❌ Not needed | ❌ Not needed |
| **Contract code changes** | None | None | Yes (inheritance + msgSender) |
| **Contract redeployment** | No | Yes | Yes |
| **Frontend changes** | Encoding only | Encoding only | Encoding + domain/types |
| **Forwarder deployment** | No (Gelato provides) | Yes (you deploy) | No (none needed) |
| **State migration** | None | Required if data exists | Required if data exists |
| **Effort** | ⭐ Low | ⭐⭐ Medium | ⭐⭐⭐ Medium-High |
| **Timeline** | 2-3 weeks | 3-4 weeks | 4-6 weeks |

---

## ✅ Migration Checklist

### All Options

- [ ] Review current implementation
- [ ] Decide on migration path (1, 2, or 3)
- [ ] Plan testing strategy
- [ ] Communicate timeline to users (if address changes)

### Option 1: Whitelist New Forwarder

- [ ] Confirm contract can update forwarder address
- [ ] Get new forwarder address from Gelato
- [ ] Update frontend encoding (handle EIP-712 signing)
- [ ] Test on testnet with new forwarder
- [ ] Update forwarder address in production contract
- [ ] Deploy frontend changes
- [ ] Monitor transactions

### Option 2: Deploy Your Own Forwarder

- [ ] Choose sequential or concurrent forwarder
- [ ] Deploy forwarder contract
- [ ] Verify forwarder on block explorer
- [ ] Redeploy your contract with new forwarder address
- [ ] Plan state migration (if needed)
- [ ] Update frontend encoding
- [ ] Test thoroughly on testnet
- [ ] Migrate to production
- [ ] Update frontend with new addresses
- [ ] Notify users of new contract

### Option 3: Direct EIP-712 Integration

- [ ] Choose sequential or concurrent mode
- [ ] Copy base contract (`EIP712MetaTransaction` or `EIP712HASHMetaTransaction`)
- [ ] Update contract inheritance
- [ ] Change all `_msgSender()` to `msgSender()` (remove underscore!)
- [ ] Remove forwarder constructor parameter
- [ ] Compile and test locally
- [ ] Redeploy contract
- [ ] Plan state migration (if needed)
- [ ] Update frontend completely (new domain, types, encoding)
- [ ] Test thoroughly on testnet
- [ ] Migrate to production
- [ ] Notify users of new contract

---

## 🆘 Common Migration Issues

### Issue: "Signature verification failed"

**Option 1 & 2:** 
- ✅ Domain `verifyingContract` must be **forwarder address**
- ✅ Domain `name` must be `"TrustedForwarder"` (sequential) or `"TrustedForwarderConcurrentERC2771"` (concurrent)
- ✅ Get nonce from **forwarder**, not your contract

**Option 3:**
- ✅ Domain `verifyingContract` must be **your contract address**
- ✅ Domain `name` must match your constructor (e.g., `"YourContract"`)
- ✅ Get nonce from **your contract** using `getNonce(address)`

### Issue: "Wrong user address in contract"

**All options:**
- ✅ Check you're using correct function: `_msgSender()` (forwarder) vs `msgSender()` (direct)
- ✅ Verify signature is from correct user
- ✅ Check forwarder/contract address is correct

### Issue: "Nonce mismatch"

**Sequential modes:**
- ✅ Get fresh nonce before each signature
- ✅ Don't reuse old signatures
- ✅ Check nonce from correct contract (forwarder or your contract)

**Concurrent modes:**
- ✅ Generate new random `userSalt` for each transaction
- ✅ Don't reuse salts

---

## 📞 Support

**Gelato Team:**
- New forwarder addresses (Option 1)
- Integration support
- Transition timeline

**Questions?**
- Check example implementations in `/contracts` and `/scripts`
- Review tests in `/test`
- Contact Gelato support

---

## 🎯 Summary

**Most customers should:**
1. **If you can update forwarder:** Use Option 1 (easiest, fastest)
2. **If you cannot update forwarder:** Use Option 2 or 3 (both require redeployment)

**Key takeaway:** 
- All options require **frontend changes** to handle encoding
- Options 2 & 3 require **contract redeployment**
- Plan for testing and migration timeline

---

**Timeline to complete migration: [TBD by Gelato]**

**Need help?** Contact Gelato support with:
- Current contract address
- Current forwarder address (if known)
- Whether your contract can update the forwarder
- Preferred migration option

