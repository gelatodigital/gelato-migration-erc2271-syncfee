import { GelatoRelay, SponsoredCallRequest } from "@gelatonetwork/relay-sdk";
import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });

const GELATO_RELAY_API_KEY = process.env.GELATO_RELAY_API_KEY;
const RPC_URL = `https://rpc.synfutures-abc-testnet.raas.gelato.cloud`;

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY as string, provider);

const relay = new GelatoRelay();

const testSponsoredCallTrustedConcurrent = async () => {
  // Contract addresses - update these after deployment
  const trustedForwarderConcurrentAddress = "0x0000000000000000000000000000000000000000"; // TODO: Deploy and update
  const simpleCounterTrustedConcurrentAddress = "0x0000000000000000000000000000000000000000"; // TODO: Deploy and update

  const chainId = (await provider.getNetwork()).chainId;
  console.log("Chain ID:", chainId);

  // ABIs
  const forwarderAbi = [
    "function sponsoredCallConcurrentERC2771((uint256 chainId, address target, bytes data, address user, bytes32 userSalt, uint256 userDeadline) _call, address _sponsor, address _feeToken, uint256 _oneBalanceChainId, bytes _userSignature, uint256 _nativeToFeeTokenXRateNumerator, uint256 _nativeToFeeTokenXRateDenominator, bytes32 _correlationId)",
    "function hashUsed(bytes32 hash) view returns (bool)",
    "function DOMAIN_SEPARATOR() view returns (bytes32)",
  ];

  const counterAbi = [
    "function increment()",
    "function counter() view returns (uint256)",
  ];

  const trustedForwarderConcurrent = new ethers.Contract(trustedForwarderConcurrentAddress, forwarderAbi, signer);
  const simpleCounterTrustedConcurrent = new ethers.Contract(simpleCounterTrustedConcurrentAddress, counterAbi, signer);

  // EIP-712 types for SponsoredCallConcurrentERC2771
  const types = {
    SponsoredCallConcurrentERC2771: [
      { name: "chainId", type: "uint256" },
      { name: "target", type: "address" },
      { name: "data", type: "bytes" },
      { name: "user", type: "address" },
      { name: "userSalt", type: "bytes32" },
      { name: "userDeadline", type: "uint256" },
    ],
  };

  // Domain data for EIP-712 (matches TrustedForwarderConcurrentERC2771's domain)
  const domainData = {
    name: "TrustedForwarderConcurrentERC2771",
    version: "1",
    chainId: chainId,
    verifyingContract: trustedForwarderConcurrentAddress,
  };

  // Generate unique salt (random bytes32) - this replaces the nonce
  const userSalt = ethers.hexlify(ethers.randomBytes(32));
  console.log("User salt:", userSalt);

  // Prepare the function call data for SimpleCounterTrustedConcurrent.increment()
  const incrementData = simpleCounterTrustedConcurrent.interface.encodeFunctionData("increment");

  // Set deadline (0 = no expiry, or set a future timestamp)
  const userDeadline = 0; // No expiry

  // Create the call struct
  const call = {
    chainId: chainId,
    target: simpleCounterTrustedConcurrentAddress,
    data: incrementData,
    user: signer.address,
    userSalt: userSalt,
    userDeadline: userDeadline,
  };

  // Create the message to sign
  const message = {
    chainId: call.chainId,
    target: call.target,
    data: call.data,
    user: call.user,
    userSalt: call.userSalt,
    userDeadline: call.userDeadline,
  };

  // Sign the typed data - returns packed signature (r + s + v)
  const signature = await signer.signTypedData(domainData, types, message);
  console.log("Packed signature:", signature);

  // Prepare the forwarder call
  const sponsor = signer.address;
  const feeToken = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"; // Native token
  const oneBalanceChainId = chainId;
  const correlationId = ethers.hexlify(ethers.randomBytes(32));

  // Encode the forwarder call
  const forwarderPayload = trustedForwarderConcurrent.interface.encodeFunctionData(
    "sponsoredCallConcurrentERC2771",
    [
      call,
      sponsor,
      feeToken,
      oneBalanceChainId,
      signature, // Packed signature
      1, // nativeToFeeTokenXRateNumerator
      1, // nativeToFeeTokenXRateDenominator
      correlationId,
    ]
  );

  // Create Gelato relay request targeting the TrustedForwarderConcurrentERC2771
  const request: SponsoredCallRequest = {
    chainId,
    target: trustedForwarderConcurrentAddress,
    data: forwarderPayload,
  };

  console.log("Sending sponsored call via Gelato Relay...");

  const response = await relay.sponsoredCall(
    request,
    GELATO_RELAY_API_KEY as string
  );

  console.log(`Task ID: ${response.taskId}`);
  console.log(`Status: https://relay.gelato.digital/tasks/status/${response.taskId}`);
};

testSponsoredCallTrustedConcurrent();
