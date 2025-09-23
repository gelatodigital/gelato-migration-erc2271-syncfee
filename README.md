# Converting Smart Contracts to Meta-Transaction Enabled Contracts

This guide demonstrates how to convert a simple smart contract into a meta-transaction enabled contract using EIP-712 standards and Gelato Relay for gasless transactions.

## Table of Contents

1. [Overview](#overview)
2. [Contract Conversion](#contract-conversion)
3. [Signature Creation and Sponsored Calls](#signature-creation-and-sponsored-calls)
4. [Complete Example](#complete-example)
5. [Testing](#testing)

## Overview

Meta-transactions allow users to interact with smart contracts without paying gas fees. Instead, a relayer (like Gelato) pays the gas fees and executes the transaction on behalf of the user. This is achieved through:

1. **EIP-712 Typed Data Signing**: Users sign structured data instead of raw transactions
2. **Contract Inheritance**: Contracts inherit meta-transaction functionality
3. **Signature Verification**: Contracts verify user signatures and execute functions on their behalf







## Contract Conversion

### Step 1: Original Simple Contract

Here's a basic counter contract:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

contract SimpleCounter {
    uint256 public counter;

    event IncrementCounter(address msgSender, uint256 newCounterValue, uint256 timestamp);

    function increment() external {
        counter++;
        emit IncrementCounter(msg.sender, counter, block.timestamp);
    }
}
```

### Step 2: Convert to Meta-Transaction Enabled Contract

To enable meta-transactions, we need to:

1. **Inherit from EIP712MetaTransaction**
2. **Replace `msg.sender` with `msgSender()`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import "./EIP712MetaTransaction.sol";

contract SimpleCounter is EIP712MetaTransaction("SimpleCounter", "1") {
    uint256 public counter;

    event IncrementCounter(address msgSender, uint256 newCounterValue, uint256 timestamp);

    function increment() external {
        counter++;
        emit IncrementCounter(msgSender(), counter, block.timestamp);
    }
}
```

### Key Changes Explained

#### 1. Inheritance
```solidity
contract SimpleCounter is EIP712MetaTransaction("SimpleCounter", "1")
```

- Inherits from `EIP712MetaTransaction` 
- Passes contract name (`"SimpleCounter"`) and version (`"1"`) for EIP-712 domain separation

#### 2. msgSender() Function
```solidity
emit IncrementCounter(msgSender(), counter, block.timestamp);
```

- **`msg.sender`** → **`msgSender()`**
- `msgSender()` returns the original user address in meta-transactions
- `msg.sender` would return the relayer address (Gelato)

### What EIP712MetaTransaction Provides

The inherited contract automatically provides:

- **`executeMetaTransaction()`**: Main function to execute meta-transactions
- **`getNonce(address user)`**: Get user's nonce for replay protection
- **`msgSender()`**: Returns the original user address
- **EIP-712 domain separation**: Prevents signature collisions across contracts

## Signature Creation and Sponsored Calls

### Step 1: Setup EIP-712 Domain and Types

```typescript
import { GelatoRelay, SponsoredCallRequest } from "@gelatonetwork/relay-sdk";
import { ethers } from "ethers";

// EIP-712 type definitions
const types = {
  MetaTransaction: [
    { name: "nonce", type: "uint256" },
    { name: "from", type: "address" },
    { name: "functionSignature", type: "bytes" },
  ],
};

// Domain data for EIP-712
let domainData = {
  name: "SimpleCounter",
  version: "1",
  verifyingContract: simpleCounterAddress,
  salt: ethers.zeroPadValue(ethers.toBeHex(chainId), 32),
};
```

### Step 2: Prepare Transaction Data

```typescript
// Get user's current nonce
const nonce = await simpleCounter.getNonce(signer.address);

// Prepare the function call data
const payload = await simpleCounter.increment.populateTransaction();

// Create the message to sign
let message = { 
  nonce: parseInt(nonce), 
  from: signer.address, 
  functionSignature: payload.data 
};
```

### Step 3: Sign the Typed Data

```typescript
// Sign using EIP-712 typed data
const signature = await signer.signTypedData(domainData, types, message);

// Extract v, r, s components
const { r, s, v } = ethers.Signature.from(signature);
```

### Step 4: Create Meta-Transaction Payload

```typescript
// Create the meta-transaction call
let metaPayload = await simpleCounter.executeMetaTransaction.populateTransaction(
  signer.address, 
  payload.data, 
  r, 
  s, 
  v
);
```

### Step 5: Send Sponsored Call via Gelato

```typescript
// Create Gelato relay request
const request: SponsoredCallRequest = {
  chainId,
  target: simpleCounterAddress,
  data: metaPayload.data as string,
};

// Send sponsored call
const response = await relay.sponsoredCall(
  request,
  GELATO_RELAY_API_KEY as string,
);

console.log(`Task ID: ${response.taskId}`);
console.log(`Status: https://relay.gelato.digital/tasks/status/${response.taskId}`);
```

## Complete Example

### Contract Implementation

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import "./EIP712MetaTransaction.sol";

contract SimpleCounter is EIP712MetaTransaction("SimpleCounter", "1") {
    uint256 public counter;

    event IncrementCounter(address msgSender, uint256 newCounterValue, uint256 timestamp);

    function increment() external {
        counter++;
        emit IncrementCounter(msgSender(), counter, block.timestamp);
    }
}
```

### Client Implementation

```typescript
import { GelatoRelay, SponsoredCallRequest } from "@gelatonetwork/relay-sdk";
import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });

const GELATO_RELAY_API_KEY = process.env.GELATO_RELAY_API_KEY;
const RPC_URL = `https://rpc.synfutures-abc-testnet.raas.gelato.cloud`;

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY as string, provider);
const relay = new GelatoRelay();

const executeMetaTransaction = async () => {
  const simpleCounterAddress = "0x5115B85246bb32dCEd920dc6a33E2Be6E37fFf6F";
  const abi = [
    "function increment()",
    "function counter() view returns (uint256)",
    "function getNonce(address user) view returns (uint256)",
    "function executeMetaTransaction(address userAddress, bytes memory functionSignature, bytes32 sigR, bytes32 sigS, uint8 sigV)"
  ];

  const chainId = (await provider.getNetwork()).chainId;
  const simpleCounter = new ethers.Contract(simpleCounterAddress, abi, signer);

  // EIP-712 setup
  const types = {
    MetaTransaction: [
      { name: "nonce", type: "uint256" },
      { name: "from", type: "address" },
      { name: "functionSignature", type: "bytes" },
    ],
  };

  let domainData = {
    name: "SimpleCounter",
    version: "1",
    verifyingContract: simpleCounterAddress,
    salt: ethers.zeroPadValue(ethers.toBeHex(chainId), 32),
  };

  // Prepare transaction
  const nonce = await simpleCounter.getNonce(signer.address);
  const payload = await simpleCounter.increment.populateTransaction();
  let message = { 
    nonce: parseInt(nonce), 
    from: signer.address, 
    functionSignature: payload.data 
  };

  // Sign and execute
  const signature = await signer.signTypedData(domainData, types, message);
  const { r, s, v } = ethers.Signature.from(signature);

  let metaPayload = await simpleCounter.executeMetaTransaction.populateTransaction(
    signer.address, 
    payload.data, 
    r, 
    s, 
    v
  );

  // Send via Gelato
  const request: SponsoredCallRequest = {
    chainId,
    target: simpleCounterAddress,
    data: metaPayload.data as string,
  };

  const response = await relay.sponsoredCall(request, GELATO_RELAY_API_KEY as string);
  console.log(`https://relay.gelato.digital/tasks/status/${response.taskId}`);
};

executeMetaTransaction();
```

## Testing

### Run Tests

```bash
# Test basic functionality
npm test

# Test sponsored call
npm run testSponsoredCall
```

### Test Structure

The test suite includes:

1. **Basic increment test**: Verifies normal contract functionality
2. **Meta-transaction test**: Tests meta-transaction execution locally
3. **Gelato relay simulation**: Simulates the full relay process

### Key Test Points

- ✅ Contract compiles and deploys correctly
- ✅ Meta-transaction signature verification works
- ✅ `msgSender()` returns correct user address
- ✅ Nonce increments properly
- ✅ Gelato relay integration functions

## Environment Setup

Create a `.env` file with:

```env
GELATO_RELAY_API_KEY=your_gelato_api_key
PRIVATE_KEY=your_private_key
ALCHEMY_ID=your_alchemy_id // if required
```

## Multicall

The `SimpleCounterMulticall` contract extends the basic meta-transaction functionality with a multicall feature that allows executing multiple function calls in a single transaction. This is particularly useful for batch operations and reducing gas costs.

### Contract Implementation

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import "./EIP712MetaTransaction.sol";
import "@openzeppelin/contracts/utils/Address.sol";

contract SimpleCounterMulticall is EIP712MetaTransaction("SimpleCounterMulticall", "1") {
    uint256 public counter = 1;

    event IncrementCounter(
        address msgSender,
        uint256 newCounterValue,
        uint256 timestamp
    );

    function increment() external {
        counter++;
        emit IncrementCounter(msgSender(), counter, block.timestamp);
    }

    function multiply(uint256 count) external {
        counter = counter * count;
        emit IncrementCounter(msgSender(), counter, block.timestamp);
    }

    function multicall(
        bytes[] calldata data
    ) external returns (bytes[] memory results) {
        results = new bytes[](data.length);
        address sender = msgSender();
        bool isEIP712 = msg.sender != sender;
        for (uint256 i = 0; i < data.length; i++) {
            if (isEIP712) {
                results[i] = Address.functionDelegateCall(
                    address(this),
                    abi.encodePacked(data[i], sender)
                );
            } else {
                results[i] = Address.functionDelegateCall(
                    address(this),
                    data[i]
                );
            }
        }
        return results;
    }
}
```

### How Multicall Works

The `multicall` function allows you to execute multiple function calls atomically:

1. **Input**: Takes an array of encoded function call data (`bytes[] calldata data`)
2. **Processing**: Iterates through each function call and executes it via delegate call
3. **Output**: Returns an array of results (`bytes[] memory results`)

### Key Features

#### 1. Meta-Transaction Support
- **EIP-712 Detection**: Automatically detects if the call is coming from a meta-transaction (`isEIP712 = msg.sender != sender`)
- **Sender Context**: For meta-transactions, it appends the original sender address to the function call data
- **Delegate Calls**: Uses `Address.functionDelegateCall()` to execute functions in the context of the current contract

#### 2. Atomic Execution
- **All-or-Nothing**: If any function call fails, the entire multicall transaction reverts
- **Gas Efficiency**: Reduces gas costs by batching multiple operations into a single transaction
- **State Consistency**: Ensures all operations succeed or fail together

### Usage Example

```typescript
// Prepare multiple function calls
const incrementCall = await simpleCounterMulticall.increment.populateTransaction();
const multiplyCall = await simpleCounterMulticall.multiply.populateTransaction(2);

// Encode the multicall
const multicallData = await simpleCounterMulticall.multicall.populateTransaction([
    incrementCall.data,
    multiplyCall.data
]);

// Execute as meta-transaction
const metaPayload = await simpleCounterMulticall.executeMetaTransaction.populateTransaction(
    signer.address,
    multicallData.data,
    r,
    s,
    v
);
```

### Benefits

1. **Gas Optimization**: Execute multiple operations in a single transaction
2. **Atomic Operations**: Ensure all operations succeed or fail together
3. **Meta-Transaction Compatible**: Works seamlessly with EIP-712 meta-transactions
4. **Flexible**: Can call any function on the contract, not just predefined ones
5. **Replay Protection**: Inherits nonce-based replay protection from the base contract

### Use Cases

- **Batch Updates**: Update multiple state variables in one transaction
- **Complex Workflows**: Execute multi-step operations atomically
- **Gas-Efficient Interactions**: Reduce transaction costs for users
- **Meta-Transaction Batching**: Combine multiple meta-transactions into a single sponsored call

