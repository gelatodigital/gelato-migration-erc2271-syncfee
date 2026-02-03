# Migration Guide: SyncFee Deprecation

## Important Notice

Gelato is **deprecating the SyncFee payment methods**. The old `callWithSyncFee` and `GelatoRelayContext` patterns will no longer be available, and Gelato will not provide a replacement.

To continue collecting fees from users, you must **implement token collection as part of your custom contract logic** and use **sponsored transactions**.

---

## What's Being Deprecated?

The following patterns will no longer be supported:

- `callWithSyncFee` SDK method
- `GelatoRelayContext` contract inheritance
- `_transferRelayFee()` function
- `onlyGelatoRelay` modifier
- Automatic fee data encoding in calldata

```solidity
// DEPRECATED - Will no longer work
import {GelatoRelayContext} from "@gelatonetwork/relay-context/contracts/GelatoRelayContext.sol";

contract MyContract is GelatoRelayContext {
    function myFunction() external onlyGelatoRelay {
        // Your logic here
        _transferRelayFee(); // No longer supported
    }
}
```

---

## Recommended Migration Path

### Use Sponsored Transactions

We recommend migrating to **sponsored transactions** using the Gas Tank. This provides a better user experience and simpler implementation.

### Collect Tokens in Your Contract Logic

If you need to collect tokens from users to cover costs, implement this as part of your custom contract logic:

```solidity
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MyContract {
    address public feeCollector;

    function myFunction(
        address feeToken,
        uint256 feeAmount
    ) external {
        // Collect tokens from user to your fee collector
        // User must have approved the contract first
        IERC20(feeToken).transferFrom(msg.sender, feeCollector, feeAmount);

        // Your business logic here
    }
}
```

Then sponsor the transaction using Gelato's Gas Tank:

```typescript
import { createGelatoEvmRelayerClient, sponsored } from '@gelatocloud/gasless';
import { encodeFunctionData } from 'viem';
import { baseSepolia } from 'viem/chains';

const relayer = createGelatoEvmRelayerClient({
  apiKey: process.env.GELATO_API_KEY,
  testnet: true
});

const data = encodeFunctionData({
  abi: contractAbi,
  functionName: 'myFunction',
  args: [feeTokenAddress, feeAmount]
});

const id = await relayer.sendTransaction({
  chainId: baseSepolia.id,
  to: contractAddress,
  data,
  payment: sponsored() // You sponsor the gas, collect tokens in your contract
});
```

---

## Migration Steps

### Step 1: Update Your Contract

1. Remove `GelatoRelayContext` inheritance
2. Remove `_transferRelayFee()` calls
3. Remove `onlyGelatoRelay` modifier
4. Add your own token collection logic if needed

#### Before (Old SyncFee Pattern)

```solidity
import {GelatoRelayContext} from "@gelatonetwork/relay-context/contracts/GelatoRelayContext.sol";

contract MyContract is GelatoRelayContext {
    uint256 public counter;

    function increment() external onlyGelatoRelay {
        counter++;

        // Fee extracted from calldata
        _transferRelayFee();
    }
}
```

#### After (Sponsored with Custom Token Collection)

```solidity
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MyContract {
    uint256 public counter;
    address public feeCollector;

    constructor(address _feeCollector) {
        feeCollector = _feeCollector;
    }

    function increment(
        address feeToken,
        uint256 feeAmount
    ) external {
        // Collect tokens from user (requires prior approval)
        IERC20(feeToken).transferFrom(msg.sender, feeCollector, feeAmount);

        counter++;
    }
}
```

#### With EIP-2612 Permit (Gasless Approvals)

For tokens that support EIP-2612 permit, you can enable gasless approvals:

```solidity
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";

contract MyContract {
    uint256 public counter;
    address public feeCollector;

    constructor(address _feeCollector) {
        feeCollector = _feeCollector;
    }

    function incrementWithPermit(
        address feeToken,
        uint256 feeAmount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        // Execute permit (gasless approval)
        IERC20Permit(feeToken).permit(msg.sender, address(this), feeAmount, deadline, v, r, s);

        // Collect tokens from user
        IERC20(feeToken).transferFrom(msg.sender, feeCollector, feeAmount);

        counter++;
    }
}
```

---

### Step 2: Update Your Frontend

Replace `callWithSyncFee` with `sendTransaction` using `sponsored()` payment.

#### Old Way (SyncFee)

```typescript
// OLD WAY - No longer supported
await gelatoRelay.callWithSyncFee({
  chainId: chainId,
  target: contractAddress,
  data: functionData,
  feeToken: FEE_TOKEN_ADDRESS,
});
```

#### New Way (Sponsored Transaction)

```typescript
import { createGelatoEvmRelayerClient, sponsored } from '@gelatocloud/gasless';
import { encodeFunctionData } from 'viem';
import { baseSepolia } from 'viem/chains';

const relayer = createGelatoEvmRelayerClient({
  apiKey: process.env.GELATO_API_KEY,
  testnet: true
});

// Encode your function call with token collection parameters
const data = encodeFunctionData({
  abi: contractAbi,
  functionName: 'increment',
  args: [feeTokenAddress, feeAmount]
});

// Submit sponsored transaction
const { taskId } = await relayer.sendTransaction({
  chainId: baseSepolia.id,
  to: contractAddress,
  data,
  payment: sponsored()
});

console.log(`Task ID: ${taskId}`);
```

#### With Permit (Gasless Approval)

```typescript
import { createGelatoEvmRelayerClient, sponsored } from '@gelatocloud/gasless';
import { encodeFunctionData } from 'viem';

const relayer = createGelatoEvmRelayerClient({
  apiKey: process.env.GELATO_API_KEY,
  testnet: true
});

// 1. Sign EIP-2612 permit
const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour
const nonce = await feeToken.nonces(userAddress);

const permitDomain = {
  name: await feeToken.name(),
  version: "1",
  chainId: chainId,
  verifyingContract: feeTokenAddress,
};

const permitTypes = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

const permitMessage = {
  owner: userAddress,
  spender: contractAddress,
  value: feeAmount,
  nonce: nonce,
  deadline: deadline,
};

const permitSignature = await signer.signTypedData(permitDomain, permitTypes, permitMessage);
const { v, r, s } = ethers.Signature.from(permitSignature);

// 2. Encode function call with permit parameters
const data = encodeFunctionData({
  abi: contractAbi,
  functionName: 'incrementWithPermit',
  args: [feeTokenAddress, feeAmount, deadline, v, r, s]
});

// 3. Submit sponsored transaction
const { taskId } = await relayer.sendTransaction({
  chainId: chainId,
  to: contractAddress,
  data,
  payment: sponsored()
});
```

---

### Step 3: Fund Your Gas Tank

Deposit funds in your Gas Tank to sponsor transactions for your users.

See [Gas Tank Documentation](https://docs.gelato.network/paymaster-bundler/gastank/overview) for details.

---

## Key Changes Summary

| What | Before (SyncFee) | After (Sponsored) |
|------|-----------------|-------------------|
| **SDK Method** | `callWithSyncFee` | `sendTransaction` with `sponsored()` |
| **Contract inheritance** | `GelatoRelayContext` | None required |
| **Fee extraction** | `_transferRelayFee()` | Your own token collection logic |
| **Modifier** | `onlyGelatoRelay` | Not required |
| **Who pays gas** | User (via fee token) | You (via Gas Tank) |
| **Token collection** | Automatic by Gelato | Your custom contract logic |

---

## Migration Checklist

- [ ] Remove `GelatoRelayContext` inheritance from contract
- [ ] Remove `_transferRelayFee()` calls
- [ ] Remove `onlyGelatoRelay` modifier
- [ ] Add custom token collection logic (if needed)
- [ ] Redeploy your updated contract
- [ ] Update frontend to use `sponsored()` payment
- [ ] Fund your Gas Tank
- [ ] Test on testnet
- [ ] Deploy to production

---

## Example Implementation

See the complete example in this repository:

- **Contract:** `contracts/SimpleCounterSponsoredWithFee.sol`
- **Test:** `test/SimpleCounterSponsoredWithFee.ts`

Run the example:

```bash
npx hardhat test test/SimpleCounterSponsoredWithFee.ts
```

---

## Support

- [Gelato Docs](https://docs.gelato.network)
- [Gas Tank Documentation](https://docs.gelato.network/paymaster-bundler/gastank/overview)
- [Sponsored Calls Guide](https://docs.gelato.network/gasless-with-relay/how-to-guides/sponsoredcalls/overview)
- [Discord](https://discord.gg/gelato)
- [GitHub](https://github.com/gelatodigital)
