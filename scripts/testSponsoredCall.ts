import { GelatoRelay, SponsoredCallRequest } from "@gelatonetwork/relay-sdk";
import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });


const GELATO_RELAY_API_KEY = process.env.GELATO_RELAY_API_KEY;

const RPC_URL = `https://rpc.synfutures-abc-testnet.raas.gelato.cloud`;

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY as string, provider);

const relay = new GelatoRelay();

const testSponsoredCall = async () => {
  const simpleCounterAddress = "0x5115B85246bb32dCEd920dc6a33E2Be6E37fFf6F";
  const abi = ["function increment()" ,"function counter() view returns (uint256)", "function getNonce(address user) view returns (uint256)","function executeMetaTransaction(address userAddress, bytes memory functionSignature, bytes32 sigR, bytes32 sigS, uint8 sigV)"];

  const chainId = (await provider.getNetwork()).chainId;
  console.log(chainId);
  // Generate the target payload
  const simpleCounter= new ethers.Contract(simpleCounterAddress, abi, signer);


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

  const nonce = await simpleCounter.getNonce(signer.address);
  const payload = await simpleCounter.increment.populateTransaction();
  let message = { nonce: parseInt(nonce), from: signer.address, functionSignature: payload.data };


  const signature = await signer.signTypedData(domainData, types, message);
  const { r, s, v } = ethers.Signature.from(signature);


  let metaPayload = await simpleCounter.executeMetaTransaction.populateTransaction(signer.address, payload.data, r, s, v); 

  // Populate a relay request
  const request: SponsoredCallRequest = {
    chainId,
    target: simpleCounterAddress,
    data: metaPayload.data as string,
  };

  // Without a specific API key, the relay request will fail!
  // Go to https://relay.gelato.network to get a testnet API key with 1Balance.
  // Send a relay request using Gelato Relay!
  const response = await relay.sponsoredCall(
    request,
    GELATO_RELAY_API_KEY as string,
  );

  console.log(`https://relay.gelato.digital/tasks/status/${response.taskId}`);
};

testSponsoredCall();
