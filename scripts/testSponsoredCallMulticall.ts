import { GelatoRelay, SponsoredCallRequest } from "@gelatonetwork/relay-sdk";
import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });

const GELATO_RELAY_API_KEY = process.env.GELATO_RELAY_API_KEY;

const RPC_URL = `https://rpc.synfutures-abc-testnet.raas.gelato.cloud`;

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY as string, provider);

const relay = new GelatoRelay();

const testSponsoredCallMulticall = async () => {
  const simpleCounterMulticallAddress = "0x3766E9882762b89338eBa6D12013c790e1322bea";
  const abi = [
    "function increment()",
    "function multiply(uint256 count)",
    "function multicall(bytes[] calldata data) returns (bytes[] memory results)",
    "function counter() view returns (uint256)", 
    "function getNonce(address user) view returns (uint256)",
    "function executeMetaTransaction(address userAddress, bytes memory functionSignature, bytes32 sigR, bytes32 sigS, uint8 sigV)"
  ];

  const chainId = (await provider.getNetwork()).chainId;
  console.log("Chain ID:", chainId);
  
  const simpleCounterMulticall = new ethers.Contract(simpleCounterMulticallAddress, abi, signer);

  // EIP-712 setup
  const types = {
    MetaTransaction: [
      { name: "nonce", type: "uint256" },
      { name: "from", type: "address" },
      { name: "functionSignature", type: "bytes" },
    ],
  };

  let domainData = {
    name: "SimpleCounterMulticall",
    version: "1",
    verifyingContract: simpleCounterMulticallAddress,
    salt: ethers.zeroPadValue(ethers.toBeHex(chainId), 32),
  };

  // Get current nonce
  const nonce = await simpleCounterMulticall.getNonce(signer.address);
  console.log("Current nonce:", nonce);

  // Prepare multiple function calls for multicall
  const incrementCall = await simpleCounterMulticall.increment.populateTransaction();
  const multiplyCall = await simpleCounterMulticall.multiply.populateTransaction(2);
  
  console.log("Increment call data:", incrementCall.data);
  console.log("Multiply call data:", multiplyCall.data);

  // Create multicall payload
  const multicallPayload = await simpleCounterMulticall.multicall.populateTransaction([
    incrementCall.data,
    multiplyCall.data
  ]);

  console.log("Multicall payload data:", multicallPayload.data);

  // Create the message to sign
  let message = { 
    nonce: parseInt(nonce), 
    from: signer.address, 
    functionSignature: multicallPayload.data 
  };

  // Sign the typed data
  const signature = await signer.signTypedData(domainData, types, message);
  const { r, s, v } = ethers.Signature.from(signature);

  console.log("Signature components:");
  console.log("r:", r);
  console.log("s:", s);
  console.log("v:", v);

  // Create meta-transaction payload
  let metaPayload = await simpleCounterMulticall.executeMetaTransaction.populateTransaction(
    signer.address, 
    multicallPayload.data, 
    r, 
    s, 
    v
  );

  console.log("Meta-transaction payload data:", metaPayload.data);

  // Create Gelato relay request
  const request: SponsoredCallRequest = {
    chainId,
    target: simpleCounterMulticallAddress,
    data: metaPayload.data as string,
  };

  console.log("Sending sponsored multicall request...");
  console.log("Request:", request);

  // Send sponsored call via Gelato
  const response = await relay.sponsoredCall(
    request,
    GELATO_RELAY_API_KEY as string,
  );

  console.log(`✅ Multicall task submitted successfully!`);
  console.log(`Task ID: ${response.taskId}`);
  console.log(`Status URL: https://relay.gelato.digital/tasks/status/${response.taskId}`);
  
  // Wait a moment and check the counter value
  console.log("\nWaiting 5 seconds before checking counter value...");
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  try {
    const counterValue = await simpleCounterMulticall.counter();
    console.log(`Current counter value: ${counterValue}`);
  } catch (error) {
    console.log("Could not fetch counter value (transaction might still be processing)");
  }
};

testSponsoredCallMulticall().catch(console.error);
