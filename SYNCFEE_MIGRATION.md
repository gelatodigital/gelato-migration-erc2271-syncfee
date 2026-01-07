# Migration Guide: SyncFee Payment Deprecation

## Important Notice

Gelato is **deprecating the SyncFee payment pattern** (`callWithSyncFee` and `GelatoRelayContext`). The old pattern will no longer be available.

To continue accepting ERC-20 token payments for relayed transactions, you must **update your contracts and frontend** to use direct token transfers.

---

## What's Changing?

### Old Way: SyncFee / GelatoRelayContext (Deprecated)

The old approach required:
- **Contract inheritance** from `GelatoRelayContext`
- **Fee data encoded in calldata** - Gelato appended `fee`, `feeToken`, and `feeCollector` to the calldata
- **On-chain fee extraction** - Contract called `_transferRelayFee()` to decode and transfer fees
- **`onlyGelatoRelay` modifier** - To restrict who can call the function

```solidity
// OLD WAY - Being deprecated
import {GelatoRelayContext} from "@gelatonetwork/relay-context/contracts/GelatoRelayContext.sol";

contract MyContract is GelatoRelayContext {
    function myFunction() external onlyGelatoRelay {
        // Your logic here

        // Extract fee from calldata and transfer to Gelato
        _transferRelayFee();
    }
}
```

### New Way: Direct Token Transfer

The new approach is simpler:
1. **Call Gelato API** to get fee collector address and fee quote
2. **Transfer tokens directly** from user to fee collector in your contract
3. **No inheritance needed** - your contract stays clean

```solidity
// NEW WAY - Direct transfer
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MyContract {
    function myFunction(
        address feeToken,
        address feeCollector,
        uint256 fee
    ) external {
        // Transfer fee from user to Gelato's fee collector
        IERC20(feeToken).transferFrom(msg.sender, feeCollector, fee);

        // Your logic here
    }
}
```

---

## Migration Steps

### Step 1: Update Your Smart Contract

Remove the old Gelato inheritance and add direct token transfer.

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

#### After (Direct Transfer)

```solidity
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MyContract {
    uint256 public counter;

    function increment(
        address feeToken,
        address feeCollector,
        uint256 fee
    ) external {
        // Transfer fee directly to Gelato's fee collector
        // Requires prior approval from user
        IERC20(feeToken).transferFrom(msg.sender, feeCollector, fee);

        counter++;
    }
}
```

#### After (With EIP-2612 Permit - Recommended)

For gasless approvals, use permit:

```solidity
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";

contract MyContract {
    uint256 public counter;

    function incrementWithPermit(
        address feeToken,
        address feeCollector,
        uint256 fee,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        // Execute permit (gasless approval)
        IERC20Permit(feeToken).permit(msg.sender, address(this), fee, deadline, v, r, s);

        // Transfer fee to Gelato's fee collector
        IERC20(feeToken).transferFrom(msg.sender, feeCollector, fee);

        counter++;
    }
}
```

**Changes Required:**
1. Remove `GelatoRelayContext` inheritance
2. Remove `_transferRelayFee()` calls
3. Remove `onlyGelatoRelay` modifier
4. Add `feeToken`, `feeCollector`, and `fee` parameters to your function
5. Add direct `IERC20.transferFrom()` call
6. (Optional) Add permit parameters for gasless approvals

---

### Step 2: Deploy Your Updated Contract

```bash
npx hardhat compile
npx hardhat deploy --tags YourContract --network yourNetwork
```

> **Note:** This requires a contract redeployment. Existing contract state (data) will NOT transfer. Plan a migration strategy if needed.

---

### Step 3: Update Frontend to Call Gelato API

Your frontend now needs to fetch the fee collector and fee quote from Gelato's API.

#### Get Fee Collector and Supported Tokens

Call `relayer_getCapabilities` to get the fee collector address and supported tokens:

```typescript
const GELATO_RPC = "https://api.gelato.cloud/rpc";  // Use api.t.gelato.cloud for testnet

async function getCapabilities(chainId: number) {
  const response = await fetch(GELATO_RPC, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": GELATO_API_KEY,
    },
    body: JSON.stringify({
      id: 1,
      jsonrpc: "2.0",
      method: "relayer_getCapabilities",
      params: [chainId.toString()],
    }),
  });

  const data = await response.json();
  return data.result[chainId.toString()];
}

// Example response:
// {
//   "feeCollector": "0x55f3a93f544e01ce4378d25e927d7c493b863bd6",
//   "tokens": [
//     { "address": "0x036CbD53842c5426634e7929541eC2318f3dCF7e", "decimals": 6 }
//   ]
// }
```

#### Get Fee Quote

Call `relayer_getFeeData` to get the current fee quote:

```typescript
async function getFeeData(chainId: number, tokenAddress: string) {
  const response = await fetch(GELATO_RPC, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": GELATO_API_KEY,
    },
    body: JSON.stringify({
      id: 1,
      jsonrpc: "2.0",
      method: "relayer_getFeeData",
      params: [chainId, tokenAddress],
    }),
  });

  const data = await response.json();
  return data.result;
}

// Example response:
// {
//   "exchangeRate": "2838869973310000000000",
//   "gasPrice": "1224000",
//   "quoteExpiry": 1702656000
// }
```

#### Calculate Fee Amount

```typescript
function calculateFee(
  estimatedGas: bigint,
  gasPrice: string,
  exchangeRate: string,
  tokenDecimals: number
): bigint {
  const gasCost = estimatedGas * BigInt(gasPrice);
  // Add 20% buffer for safety
  const gasCostWithBuffer = (gasCost * 120n) / 100n;
  // Convert to token amount using exchange rate
  const fee = (gasCostWithBuffer * BigInt(exchangeRate)) / BigInt(10 ** 18);
  return fee;
}
```

---

### Step 4: Update Frontend Transaction Encoding

#### Old Way (Gelato handled fee encoding)

```typescript
// OLD WAY - Gelato appended fee data to calldata
const functionData = contract.interface.encodeFunctionData("increment", []);

await gelatoRelay.callWithSyncFee({
  chainId: chainId,
  target: contractAddress,
  data: functionData,
  feeToken: FEE_TOKEN_ADDRESS,
});
```

#### New Way (You handle fee transfer)

```typescript
import { GelatoRelay, SponsoredCallRequest } from "@gelatonetwork/relay-sdk";

// 1. Get fee collector from Gelato API
const capabilities = await getCapabilities(chainId);
const feeCollector = capabilities.feeCollector;

// 2. Get fee quote
const feeData = await getFeeData(chainId, FEE_TOKEN_ADDRESS);
const estimatedGas = 150000n; // Estimate for your transaction
const fee = calculateFee(estimatedGas, feeData.gasPrice, feeData.exchangeRate, 6);

// 3. Encode transaction with fee parameters
const functionData = contract.interface.encodeFunctionData("increment", [
  FEE_TOKEN_ADDRESS,
  feeCollector,
  fee,
]);

// 4. Submit to Gelato Relay
const relay = new GelatoRelay();
const request: SponsoredCallRequest = {
  chainId: BigInt(chainId),
  target: contractAddress,
  data: functionData,
};

const response = await relay.sponsoredCall(request, GELATO_API_KEY);
console.log(`Task ID: ${response.taskId}`);
```

#### New Way (With Permit - Recommended)

For gasless token approvals using EIP-2612 permit:

```typescript
import { ethers } from "ethers";

// 1. Get fee collector and quote
const capabilities = await getCapabilities(chainId);
const feeCollector = capabilities.feeCollector;
const feeData = await getFeeData(chainId, FEE_TOKEN_ADDRESS);
const fee = calculateFee(150000n, feeData.gasPrice, feeData.exchangeRate, 6);

// 2. Sign EIP-2612 permit (gasless approval)
const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
const nonce = await feeToken.nonces(userAddress);

const permitDomain = {
  name: await feeToken.name(),
  version: "1",
  chainId: chainId,
  verifyingContract: FEE_TOKEN_ADDRESS,
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
  spender: contractAddress,  // Your contract
  value: fee,
  nonce: nonce,
  deadline: deadline,
};

const permitSignature = await signer.signTypedData(permitDomain, permitTypes, permitMessage);
const { v, r, s } = ethers.Signature.from(permitSignature);

// 3. Encode transaction with permit parameters
const functionData = contract.interface.encodeFunctionData("incrementWithPermit", [
  FEE_TOKEN_ADDRESS,
  feeCollector,
  fee,
  deadline,
  v,
  r,
  s,
]);

// 4. Submit to Gelato Relay
const request: SponsoredCallRequest = {
  chainId: BigInt(chainId),
  target: contractAddress,
  data: functionData,
};

const response = await relay.sponsoredCall(request, GELATO_API_KEY);
```

---

## Key Changes Summary

| What | Before (SyncFee) | After (Direct Transfer) |
|------|-----------------|------------------------|
| **Contract inheritance** | `GelatoRelayContext` | None required |
| **Fee extraction** | `_transferRelayFee()` | Direct `IERC20.transferFrom()` |
| **Modifier** | `onlyGelatoRelay` | Not required |
| **Fee data source** | Encoded in calldata by Gelato | From Gelato API |
| **Fee collector** | Extracted from calldata | From `relayer_getCapabilities` |
| **Fee amount** | Extracted from calldata | Calculated from `relayer_getFeeData` |

---

## Migration Checklist

- [ ] **Step 1:** Update contract to remove `GelatoRelayContext` and add direct transfer
- [ ] **Step 2:** Redeploy your updated contract
- [ ] **Step 3:** Update frontend to call Gelato API for fee data
- [ ] **Step 4:** Update frontend transaction encoding
- [ ] Test on testnet
- [ ] Deploy to production

---

## API Reference

### Base URLs

| Environment | URL |
|-------------|-----|
| Mainnet | `https://api.gelato.cloud/rpc` |
| Testnet | `https://api.t.gelato.cloud/rpc` |

### Methods

| Method | Description |
|--------|-------------|
| `relayer_getCapabilities` | Get supported tokens and fee collector per chain |
| `relayer_getFeeData` | Get fee quote with exchange rate and gas price |
| `relayer_sendTransaction` | Submit transaction for relay |
| `relayer_getStatus` | Check transaction status |

---

## Example Implementation

See the complete example:

- **Contract:** `contracts/SimpleCounterERC20Fee.sol`
- **Script:** `scripts/testERC20FeePayment.ts`
- **Test:** `test/SimpleCounterERC20Fee.ts`

Run the example:

```bash
# Run tests
npx hardhat test test/SimpleCounterERC20Fee.ts

# Run with Gelato (requires API key in .env)
npx ts-node scripts/testERC20FeePayment.ts
```

---

## Support

- [Gelato Docs](https://docs.gelato.network)
- [Discord](https://discord.gg/gelato)
- [Get API Key](https://app.gelato.network)
