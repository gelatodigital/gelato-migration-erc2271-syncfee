import { GelatoRelay, SponsoredCallRequest } from "@gelatonetwork/relay-sdk";
import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });

const GELATO_RELAY_API_KEY = process.env.GELATO_RELAY_API_KEY;
const RPC_URL = `https://rpc.synfutures-abc-testnet.raas.gelato.cloud`;

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY as string, provider);

const relay = new GelatoRelay();

const testSponsoredCallTrusted = async () => {
  // Contract addresses - update these after deployment
  const trustedForwarderAddress = "0x0000000000000000000000000000000000000000"; // TODO: Deploy and update
  const simpleCounterTrustedAddress = "0x0000000000000000000000000000000000000000"; // TODO: Deploy and update

  const chainId = (await provider.getNetwork()).chainId;
  console.log("Chain ID:", chainId);

  // ABIs
  const forwarderAbi = [
    "function sponsoredCallERC2771((uint256 chainId, address target, bytes data, address user, uint256 userNonce, uint256 userDeadline) _call, address _sponsor, address _feeToken, uint256 _oneBalanceChainId, bytes _userSignature, uint256 _nativeToFeeTokenXRateNumerator, uint256 _nativeToFeeTokenXRateDenominator, bytes32 _correlationId)",
    "function userNonce(address user) view returns (uint256)",
    "function DOMAIN_SEPARATOR() view returns (bytes32)",
  ];

  const counterAbi = [
    "function increment()",
    "function counter() view returns (uint256)",
  ];

  const trustedForwarder = new ethers.Contract(trustedForwarderAddress, forwarderAbi, signer);
  const simpleCounterTrusted = new ethers.Contract(simpleCounterTrustedAddress, counterAbi, signer);

  // EIP-712 types for SponsoredCallERC2771
  const types = {
    SponsoredCallERC2771: [
      { name: "chainId", type: "uint256" },
      { name: "target", type: "address" },
      { name: "data", type: "bytes" },
      { name: "user", type: "address" },
      { name: "userNonce", type: "uint256" },
      { name: "userDeadline", type: "uint256" },
    ],
  };

  // Domain data for EIP-712 (matches TrustedForwarder's domain)
  const domainData = {
    name: "TrustedForwarder",
    version: "1",
    chainId: chainId,
    verifyingContract: trustedForwarderAddress,
  };

  // Get user's nonce from the forwarder
  const userNonce = await trustedForwarder.userNonce(signer.address);
  console.log("User nonce:", userNonce.toString());

  // Prepare the function call data for SimpleCounterTrusted.increment()
  const incrementData = simpleCounterTrusted.interface.encodeFunctionData("increment");

  // Set deadline (0 = no expiry, or set a future timestamp)
  const userDeadline = 0; // No expiry

  // Create the call struct
  const call = {
    chainId: chainId,
    target: simpleCounterTrustedAddress,
    data: incrementData,
    user: signer.address,
    userNonce: userNonce,
    userDeadline: userDeadline,
  };

  // Create the message to sign
  const message = {
    chainId: call.chainId,
    target: call.target,
    data: call.data,
    user: call.user,
    userNonce: call.userNonce,
    userDeadline: call.userDeadline,
  };

  // Sign the typed data - returns packed signature (r + s + v)
  const signature = await signer.signTypedData(domainData, types, message);
  console.log("Packed signature:", signature);

  // Prepare the forwarder call
  // Parameters for sponsoredCallERC2771:
  // - _call: the CallWithERC2771 struct
  // - _sponsor: address paying for the relay (can be any address for tracking)
  // - _feeToken: token used for fee (for 1Balance tracking)
  // - _oneBalanceChainId: chain ID for 1Balance
  // - _userSignature: the packed EIP-712 signature
  // - _nativeToFeeTokenXRateNumerator/Denominator: exchange rate for fee calculation
  // - _correlationId: unique ID for tracking

  const sponsor = signer.address;
  const feeToken = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"; // Native token
  const oneBalanceChainId = chainId;
  const correlationId = ethers.hexlify(ethers.randomBytes(32));

  // Encode the forwarder call
  const forwarderPayload = trustedForwarder.interface.encodeFunctionData(
    "sponsoredCallERC2771",
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

  // Create Gelato relay request targeting the TrustedForwarder
  const request: SponsoredCallRequest = {
    chainId,
    target: trustedForwarderAddress,
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

testSponsoredCallTrusted();
