import hre, { deployments, getNamedAccounts, network, ethers } from "hardhat";
import { expect } from "chai";
import { SimpleCounterMulticall } from "../typechain";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { GelatoRelay, SponsoredCallRequest } from "@gelatonetwork/relay-sdk";


let simpleCounterAddress: string;

describe("Test SimpleCounterMulticall Smart Contract", function () {
  let simpleCounterMulticall: SimpleCounterMulticall;
  let user: SignerWithAddress;
  let userAddress: string;
  let bundleSigner: SignerWithAddress;
  beforeEach("tests", async function () {
    if (hre.network.name !== "hardhat") {
      console.error("Test Suite is meant to be run on hardhat only");
      process.exit(1);
    }
    await deployments.fixture("Multicall");

    [user, bundleSigner] = await hre.ethers.getSigners();
    userAddress = await user.getAddress();

    simpleCounterAddress = (await deployments.get("SimpleCounterMulticall")).address;

  
    simpleCounterMulticall = (await hre.ethers.getContractAt(
      "SimpleCounterMulticall",
      simpleCounterAddress
    )) as SimpleCounterMulticall;
  });

  it("#1: increment", async () => {
    let initCounter = +(await simpleCounterMulticall.counter()).toString()
    await simpleCounterMulticall.increment()
    let endCounter = +(await simpleCounterMulticall.counter()).toString()
    expect(initCounter + 1 == endCounter, "Counter not increase"
    ).to.be.true;
  });
  it("#2: should work sending a metatx", async () => {


    const chainId = (await hre.ethers.provider.getNetwork()).chainId;

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
      verifyingContract: simpleCounterAddress,
      salt: ethers.zeroPadValue(ethers.toBeHex(chainId), 32),
    };

    const nonce = await simpleCounterMulticall.getNonce(userAddress);
    const payloadIncrement = await simpleCounterMulticall.increment.populateTransaction();
    const payloadMultiply = await simpleCounterMulticall.multiply.populateTransaction(5);
    const calls = [payloadIncrement.data, payloadMultiply.data];
    let executePayload = await simpleCounterMulticall.multicall.populateTransaction(calls);
    let message = { nonce: parseInt(nonce), from: userAddress, functionSignature: executePayload.data };

    // Sign the typed data (EIP-712)
    const signature = await user.signTypedData(domainData, types, message);
    // If you need v, r, s to call a contract method:
    const { r, s, v } = ethers.Signature.from(signature);

    // Recover the signer from the signature
    const recoveredSigner = ethers.verifyTypedData(domainData, types, message, signature);
    expect(recoveredSigner.toLowerCase()).to.equal(userAddress.toLowerCase());

    await simpleCounterMulticall.executeMetaTransaction(userAddress, executePayload.data, r, s, v);
    const newCounter = await simpleCounterMulticall.counter();
    expect(newCounter.toString()).to.equal("10");


    const newNonce = await simpleCounterMulticall.getNonce(userAddress);
    expect(newNonce.toString()).to.equal("1");
  });

  it("#3: should work simulatinga metatx calling Gelato Relay", async () => {


    const chainId = (await hre.ethers.provider.getNetwork()).chainId;

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
      verifyingContract: simpleCounterAddress,
      salt: ethers.zeroPadValue(ethers.toBeHex(chainId), 32),
    };

    const nonce = await simpleCounterMulticall.getNonce(userAddress);
    const payloadIncrement = await simpleCounterMulticall.increment.populateTransaction();
    const payloadMultiply = await simpleCounterMulticall.multiply.populateTransaction(5);
    const calls = [payloadIncrement.data, payloadMultiply.data,payloadIncrement.data];
    let executePayload = await simpleCounterMulticall.multicall.populateTransaction(calls);
    let message = { nonce: parseInt(nonce), from: userAddress, functionSignature: executePayload.data };

    // Sign the typed data (EIP-712)
    const signature = await user.signTypedData(domainData, types, message);
    // If you need v, r, s to call a contract method:
    const { r, s, v } = ethers.Signature.from(signature);


    // Recover the signer from the signature
    const recoveredSigner = ethers.verifyTypedData(domainData, types, message, signature);
    expect(recoveredSigner.toLowerCase()).to.equal(userAddress.toLowerCase());



    let metaPayload = await simpleCounterMulticall.executeMetaTransaction.populateTransaction(userAddress, executePayload.data, r, s, v);

    const response = await bundleSigner.sendTransaction(metaPayload);
    await response.wait();


    const newCounter = await simpleCounterMulticall.counter();
    expect(newCounter.toString()).to.equal("11");


    const newNonce = await simpleCounterMulticall.getNonce(userAddress);
    expect(newNonce.toString()).to.equal("1");
  });
});
