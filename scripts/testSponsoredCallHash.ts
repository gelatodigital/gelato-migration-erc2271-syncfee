import { GelatoRelay, SponsoredCallRequest } from "@gelatonetwork/relay-sdk";
import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });

const GELATO_RELAY_API_KEY = process.env.GELATO_RELAY_API_KEY;

const RPC_URL = `https://rpc.synfutures-abc-testnet.raas.gelato.cloud`;

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY as string, provider);

const relay = new GelatoRelay();

const testSponsoredCallHash = async () => {
  // Update this address after deploying SimpleCounterHash
  const simpleCounterHashAddress = "0x0000000000000000000000000000000000000000"; // TODO: Replace with deployed address

  const abi = [
    "function increment()",
    "function counter() view returns (uint256)",
    "function executeMetaTransaction(address userAddress, bytes memory functionSignature, bytes32 userSalt, uint256 deadline, bytes calldata signature)",
    "function getDigest(address userAddress, bytes memory functionSignature, bytes32 userSalt, uint256 deadline) view returns (bytes32)",
    "function digestUsed(bytes32 digest) view returns (bool)",
    "function domainSeparator() view returns (bytes32)",
  ];

  const chainId = (await provider.getNetwork()).chainId;
  console.log("Chain ID:", chainId);

  const simpleCounterHash = new ethers.Contract(
    simpleCounterHashAddress,
    abi,
    signer
  );

  // Get current counter value
  const currentCounter = await simpleCounterHash.counter();
  console.log("Current counter value:", currentCounter.toString());

  // ============ EIP-712 Types for Hash-Based Meta-Transaction ============

  // Define the EIP-712 types matching the contract's MetaTransaction struct
  const types = {
    MetaTransaction: [
      { name: "userSalt", type: "bytes32" },
      { name: "from", type: "address" },
      { name: "functionSignature", type: "bytes" },
      { name: "deadline", type: "uint256" },
    ],
  };

  // Domain data matching the contract's EIP-712 domain
  // Note: This uses chainId directly (not as salt like the nonce-based version)
  const domainData = {
    name: "SimpleCounterHash",
    version: "1",
    chainId: chainId,
    verifyingContract: simpleCounterHashAddress,
  };

  // ============ Generate Unique Salt ============
  // Each transaction needs a unique salt - use random bytes32
  const userSalt = ethers.hexlify(ethers.randomBytes(32));
  console.log("Generated userSalt:", userSalt);

  // ============ Set Deadline (Optional) ============
  // Set deadline to 1 hour from now (0 = no expiry)
  const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
  // const deadline = 0; // Uncomment for no expiry
  console.log("Deadline:", deadline, "(", new Date(deadline * 1000).toISOString(), ")");

  // ============ Generate Function Signature ============
  const payload = await simpleCounterHash.increment.populateTransaction();
  console.log("Function signature (increment):", payload.data);

  // ============ Create Message to Sign ============
  const message = {
    userSalt: userSalt,
    from: signer.address,
    functionSignature: payload.data,
    deadline: deadline,
  };

  console.log("Message to sign:", message);

  // ============ Sign the Typed Data ============
  const signature = await signer.signTypedData(domainData, types, message);
  console.log("Signature:", signature);

  // ============ Verify Signature Off-Chain (Optional) ============
  const recoveredSigner = ethers.verifyTypedData(
    domainData,
    types,
    message,
    signature
  );
  console.log("Recovered signer:", recoveredSigner);
  console.log("Signer matches:", recoveredSigner === signer.address);

  // ============ Verify Digest On-Chain (Optional) ============
  const onChainDigest = await simpleCounterHash.getDigest(
    signer.address,
    payload.data,
    userSalt,
    deadline
  );
  console.log("On-chain digest:", onChainDigest);

  const isDigestUsed = await simpleCounterHash.digestUsed(onChainDigest);
  console.log("Digest already used:", isDigestUsed);

  if (isDigestUsed) {
    console.error("ERROR: This digest has already been used. Generate a new salt.");
    return;
  }

  // ============ Create Meta-Transaction Payload ============
  // executeMetaTransaction(address userAddress, bytes memory functionSignature, bytes32 userSalt, uint256 deadline, bytes calldata signature)
  const metaPayload = await simpleCounterHash.executeMetaTransaction.populateTransaction(
    signer.address,
    payload.data,
    userSalt,
    deadline,
    signature
  );

  console.log("Meta-transaction payload data:", metaPayload.data);

  // ============ Create Gelato Relay Request ============
  const request: SponsoredCallRequest = {
    chainId,
    target: simpleCounterHashAddress,
    data: metaPayload.data as string,
  };

  console.log("\nSending sponsored call via Gelato Relay...");

  // ============ Send via Gelato Relay ============
  // Without a specific API key, the relay request will fail!
  // Go to https://relay.gelato.network to get a testnet API key with 1Balance.
  const response = await relay.sponsoredCall(
    request,
    GELATO_RELAY_API_KEY as string
  );

  console.log(`\nTask submitted successfully!`);
  console.log(`Task ID: ${response.taskId}`);
  console.log(`Track status: https://relay.gelato.digital/tasks/status/${response.taskId}`);
};

// Run the test
testSponsoredCallHash().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
