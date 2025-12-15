# Migration Quick Reference

## ⚠️ Action Required: Gelato Forwarder Deprecation

Old Gelato forwarders are being deprecated. Choose your migration path:

---

## 🎯 Choose Your Option

```
Can you UPDATE your trusted forwarder address?
│
├─ YES → Option 1: Whitelist New Forwarder (2-3 weeks)
│        ✅ No contract changes
│        ✅ No redeployment
│        ⚠️ Frontend encoding changes required
│
└─ NO → Choose Option 2 or 3 (4-6 weeks)
    │
    ├─ Option 2: Deploy Your Own Forwarder
    │  ✅ Keep same contract architecture
    │  ⚠️ Must redeploy contracts
    │  ⚠️ Frontend encoding changes required
    │
    └─ Option 3: Direct EIP-712 Integration
       ✅ Self-contained contracts
       ⚠️ Must update contract code
       ⚠️ Must redeploy contracts
       ⚠️ Frontend encoding changes required
```

---

## Option 1: Whitelist New Forwarder ⭐

### Contract Changes
**NONE** - Just update the forwarder address in your contract

### Frontend Changes
**CRITICAL: You now handle encoding**

```typescript
// OLD: You did this
const data = contract.interface.encodeFunctionData("yourFunction", []);
gelatoRelay.sponsoredCall({ target: yourContract, data });

// NEW: You must do this
const domain = {
  name: "TrustedForwarder",
  version: "1",
  chainId: chainId,
  verifyingContract: NEW_FORWARDER_ADDRESS  // From Gelato
};

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

const nonce = await trustedForwarder.userNonce(userAddress);
const message = {
  chainId: chainId,
  target: yourContractAddress,
  data: contract.interface.encodeFunctionData("yourFunction", []),
  user: userAddress,
  userNonce: nonce,
  userDeadline: 0
};

const signature = await signer.signTypedData(domain, types, message);

// Call forwarder, not your contract!
gelatoRelay.sponsoredCall({
  target: NEW_FORWARDER_ADDRESS,  // ← Forwarder!
  data: forwarder.interface.encodeFunctionData("sponsoredCallERC2771", [
    message, signature, /* other params */
  ])
});
```

### Steps
1. Get new forwarder address from Gelato
2. Update forwarder in your contract
3. Update frontend encoding
4. Test and deploy

---

## Option 2: Deploy Your Own Forwarder

### Contract Changes
**NONE** - But must redeploy with your forwarder address

### Deploy Forwarder
```bash
# Sequential
npx hardhat deploy --tags TrustedForwarder

# Concurrent
npx hardhat deploy --tags TrustedForwarderConcurrent
```

### Redeploy Your Contract
```solidity
// Same code, just pass YOUR forwarder address
constructor(address trustedForwarder) ERC2771Context(trustedForwarder) {}
```

### Frontend Changes
**Same as Option 1**, but use YOUR forwarder address

### Steps
1. Deploy forwarder
2. Redeploy your contracts with your forwarder address
3. Update frontend encoding (same as Option 1)
4. Migrate users to new contract

---

## Option 3: Direct EIP-712 Integration

### Contract Changes
**YES** - Update inheritance and `_msgSender()`

```solidity
// OLD
import {ERC2771Context} from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
contract YourContract is ERC2771Context {
    constructor(address trustedForwarder) ERC2771Context(trustedForwarder) {}
    function foo() external {
        address user = _msgSender();  // With underscore
    }
}

// NEW (Sequential)
import "./lib/EIP712MetaTransaction.sol";
contract YourContract is EIP712MetaTransaction("YourContract", "1") {
    // No constructor needed
    function foo() external {
        address user = msgSender();  // NO underscore!
    }
}

// NEW (Concurrent)
import "./lib/EIP712HASHMetaTransaction.sol";
contract YourContract is EIP712HASHMetaTransaction("YourContract", "1") {
    function foo() external {
        address user = msgSender();  // NO underscore!
    }
}
```

### Frontend Changes

```typescript
// Sign for YOUR CONTRACT (not forwarder!)
const domain = {
  name: "YourContract",                    // Your contract name
  version: "1",
  verifyingContract: yourContractAddress,  // YOUR contract!
  salt: ethers.zeroPadValue(ethers.toBeHex(chainId), 32)  // Sequential
  // chainId: chainId                      // Concurrent
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

// Get nonce from YOUR CONTRACT (not forwarder)
const nonce = await yourContract.getNonce(userAddress);

const message = {
  nonce: nonce,                             // Sequential
  // userSalt: ethers.hexlify(ethers.randomBytes(32)),  // Concurrent
  from: userAddress,
  functionSignature: functionData
  // deadline: 0                            // Concurrent
};

const signature = await signer.signTypedData(domain, types, message);

// Sequential: split signature
const { r, s, v } = ethers.Signature.from(signature);

// Call YOUR CONTRACT with executeMetaTransaction
gelatoRelay.sponsoredCall({
  target: yourContractAddress,  // YOUR contract!
  data: contract.interface.encodeFunctionData("executeMetaTransaction",
    // Sequential:
    [userAddress, functionData, r, s, v]
    // Concurrent:
    // [userAddress, functionData, userSalt, deadline, signature]
  )
});
```

### Steps
1. Copy `EIP712MetaTransaction.sol` or `EIP712HASHMetaTransaction.sol`
2. Update contract inheritance
3. Change ALL `_msgSender()` → `msgSender()` (no underscore!)
4. Redeploy contract
5. Update frontend completely
6. Migrate users to new contract

---

## 🔑 Key Differences

| What | Option 1 | Option 2 | Option 3 |
|------|----------|----------|----------|
| **Forwarder** | Gelato's new one | You deploy | None |
| **Sign for** | Forwarder | Forwarder | Your contract |
| **Domain name** | `"TrustedForwarder"` | `"TrustedForwarder"` | `"YourContract"` |
| **Domain verifyingContract** | Forwarder address | Your forwarder address | Your contract |
| **Get nonce from** | Forwarder | Your forwarder | Your contract |
| **Gelato target** | Forwarder | Your forwarder | Your contract |
| **Call function** | `sponsoredCallERC2771()` | `sponsoredCallERC2771()` | `executeMetaTransaction()` |
| **Contract uses** | `_msgSender()` | `_msgSender()` | `msgSender()` |
| **Contract redeploy?** | No | Yes | Yes |
| **Contract code changes?** | No | No | Yes |

---

## ⚡ Quick Migration Steps

### Option 1 (No Contract Changes)
```bash
# 1. Get new forwarder from Gelato
NEW_FORWARDER=0x...

# 2. Update in your contract
cast send $YOUR_CONTRACT "setTrustedForwarder(address)" $NEW_FORWARDER

# 3. Update frontend encoding (see above)
# 4. Test and deploy
```

### Option 2 (Deploy Own Forwarder)
```bash
# 1. Deploy forwarder
npx hardhat deploy --tags TrustedForwarder

# 2. Redeploy your contract
npx hardhat deploy --tags YourContract

# 3. Update frontend (same as Option 1)
# 4. Migrate users
```

### Option 3 (Direct Integration)
```bash
# 1. Update contract code
# - Change inheritance
# - Change _msgSender() to msgSender()

# 2. Compile and deploy
npx hardhat compile
npx hardhat deploy --tags YourContract

# 3. Update frontend (see above)
# 4. Migrate users
```

---

## 🐛 Common Issues

### "Signature verification failed"

**Check:**
- Domain `verifyingContract` address (forwarder vs your contract)
- Domain `name` (must match contract's name)
- Getting nonce from correct contract

### "_msgSender() returns relayer, not user"

**Check:**
- Option 1 & 2: Using `_msgSender()` (with underscore)
- Option 3: Using `msgSender()` (NO underscore)
- Encoding to correct target (forwarder vs your contract)

### "Nonce mismatch"

**Check:**
- Getting nonce from correct contract
- Not reusing old signatures
- Sequential: nonce increments each tx
- Concurrent: using unique `userSalt` each time

---

## 📞 Contact Gelato With

- [ ] Current contract address(es)
- [ ] Current forwarder address (if known)
- [ ] Can you update forwarder? (Yes/No)
- [ ] Preferred option (1, 2, or 3)
- [ ] Timeline constraints

---

## 📚 Full Documentation

See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) for complete details.

---

**Deadline: [TBD by Gelato]**

