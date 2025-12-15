import hre, { deployments, ethers } from "hardhat";
import { expect } from "chai";
import { SimpleCounterHash } from "../typechain";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

let simpleCounterHashAddress: string;

describe("Test SimpleCounterHash Smart Contract (Hash-Based Meta-Transactions)", function () {
  let simpleCounterHash: SimpleCounterHash;
  let user: SignerWithAddress;
  let userAddress: string;
  let relayer: SignerWithAddress;

  beforeEach("tests", async function () {
    if (hre.network.name !== "hardhat") {
      console.error("Test Suite is meant to be run on hardhat only");
      process.exit(1);
    }
    await deployments.fixture(["SimpleCounterHash"]);

    [user, relayer] = await hre.ethers.getSigners();
    userAddress = await user.getAddress();

    simpleCounterHashAddress = (await deployments.get("SimpleCounterHash")).address;

    simpleCounterHash = (await hre.ethers.getContractAt(
      "SimpleCounterHash",
      simpleCounterHashAddress
    )) as SimpleCounterHash;
  });

  it("#1: direct increment (no meta-transaction)", async () => {
    const initCounter = +(await simpleCounterHash.counter()).toString();
    await simpleCounterHash.increment();
    const endCounter = +(await simpleCounterHash.counter()).toString();
    expect(initCounter + 1 == endCounter, "Counter not increased").to.be.true;
  });

  it("#2: should work sending a hash-based metatx", async () => {
    const chainId = (await hre.ethers.provider.getNetwork()).chainId;

    // EIP-712 types for hash-based meta-transaction
    const types = {
      MetaTransaction: [
        { name: "userSalt", type: "bytes32" },
        { name: "from", type: "address" },
        { name: "functionSignature", type: "bytes" },
        { name: "deadline", type: "uint256" },
      ],
    };

    // Domain data - uses chainId directly (not as salt)
    const domainData = {
      name: "SimpleCounterHash",
      version: "1",
      chainId: chainId,
      verifyingContract: simpleCounterHashAddress,
    };

    // Generate unique salt (random bytes32)
    const userSalt = ethers.hexlify(ethers.randomBytes(32));

    // Set deadline to 1 hour from now (0 = no expiry)
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    // Get the function signature for increment()
    const payload = await simpleCounterHash.increment.populateTransaction();

    // Create message to sign
    const message = {
      userSalt: userSalt,
      from: userAddress,
      functionSignature: payload.data,
      deadline: deadline,
    };

    // Sign the typed data (EIP-712)
    const signature = await user.signTypedData(domainData, types, message);

    // Recover the signer from the signature (off-chain verification)
    const recoveredSigner = ethers.verifyTypedData(domainData, types, message, signature);
    expect(recoveredSigner.toLowerCase()).to.equal(userAddress.toLowerCase());

    // Execute meta-transaction
    await simpleCounterHash.executeMetaTransaction(
      userAddress,
      payload.data,
      userSalt,
      deadline,
      signature
    );

    const newCounter = await simpleCounterHash.counter();
    expect(newCounter.toString()).to.equal("1");

    // Verify the digest is now marked as used
    const digest = await simpleCounterHash.getDigest(userAddress, payload.data, userSalt, deadline);
    const isUsed = await simpleCounterHash.digestUsed(digest);
    expect(isUsed).to.be.true;
  });

  it("#3: should reject replay attack (same salt)", async () => {
    const chainId = (await hre.ethers.provider.getNetwork()).chainId;

    const types = {
      MetaTransaction: [
        { name: "userSalt", type: "bytes32" },
        { name: "from", type: "address" },
        { name: "functionSignature", type: "bytes" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const domainData = {
      name: "SimpleCounterHash",
      version: "1",
      chainId: chainId,
      verifyingContract: simpleCounterHashAddress,
    };

    const userSalt = ethers.hexlify(ethers.randomBytes(32));
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const payload = await simpleCounterHash.increment.populateTransaction();

    const message = {
      userSalt: userSalt,
      from: userAddress,
      functionSignature: payload.data,
      deadline: deadline,
    };

    const signature = await user.signTypedData(domainData, types, message);

    // First execution should succeed
    await simpleCounterHash.executeMetaTransaction(
      userAddress,
      payload.data,
      userSalt,
      deadline,
      signature
    );

    // Second execution with same signature should fail (replay attack)
    let reverted = false;
    try {
      await simpleCounterHash.executeMetaTransaction(
        userAddress,
        payload.data,
        userSalt,
        deadline,
        signature
      );
    } catch (error) {
      reverted = true;
    }
    expect(reverted, "Should have reverted on replay attack").to.be.true;
  });

  it("#4: should allow concurrent transactions with different salts", async () => {
    const chainId = (await hre.ethers.provider.getNetwork()).chainId;

    const types = {
      MetaTransaction: [
        { name: "userSalt", type: "bytes32" },
        { name: "from", type: "address" },
        { name: "functionSignature", type: "bytes" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const domainData = {
      name: "SimpleCounterHash",
      version: "1",
      chainId: chainId,
      verifyingContract: simpleCounterHashAddress,
    };

    const payload = await simpleCounterHash.increment.populateTransaction();
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    // Generate 3 different salts and sign 3 transactions
    const salts = [
      ethers.hexlify(ethers.randomBytes(32)),
      ethers.hexlify(ethers.randomBytes(32)),
      ethers.hexlify(ethers.randomBytes(32)),
    ];

    const signatures = await Promise.all(
      salts.map(async (salt) => {
        const message = {
          userSalt: salt,
          from: userAddress,
          functionSignature: payload.data,
          deadline: deadline,
        };
        return user.signTypedData(domainData, types, message);
      })
    );

    // Execute in reverse order (3, 2, 1) to prove order doesn't matter
    for (let i = salts.length - 1; i >= 0; i--) {
      await simpleCounterHash.executeMetaTransaction(
        userAddress,
        payload.data,
        salts[i],
        deadline,
        signatures[i]
      );
    }

    const finalCounter = await simpleCounterHash.counter();
    expect(finalCounter.toString()).to.equal("3");
  });

  it("#5: should reject expired deadline", async () => {
    const chainId = (await hre.ethers.provider.getNetwork()).chainId;

    const types = {
      MetaTransaction: [
        { name: "userSalt", type: "bytes32" },
        { name: "from", type: "address" },
        { name: "functionSignature", type: "bytes" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const domainData = {
      name: "SimpleCounterHash",
      version: "1",
      chainId: chainId,
      verifyingContract: simpleCounterHashAddress,
    };

    const userSalt = ethers.hexlify(ethers.randomBytes(32));
    // Set deadline to 1 second in the past
    const deadline = Math.floor(Date.now() / 1000) - 1;
    const payload = await simpleCounterHash.increment.populateTransaction();

    const message = {
      userSalt: userSalt,
      from: userAddress,
      functionSignature: payload.data,
      deadline: deadline,
    };

    const signature = await user.signTypedData(domainData, types, message);

    let reverted = false;
    try {
      await simpleCounterHash.executeMetaTransaction(
        userAddress,
        payload.data,
        userSalt,
        deadline,
        signature
      );
    } catch (error) {
      reverted = true;
    }
    expect(reverted, "Should have reverted on expired deadline").to.be.true;
  });

  it("#6: should work with deadline = 0 (no expiry)", async () => {
    const chainId = (await hre.ethers.provider.getNetwork()).chainId;

    const types = {
      MetaTransaction: [
        { name: "userSalt", type: "bytes32" },
        { name: "from", type: "address" },
        { name: "functionSignature", type: "bytes" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const domainData = {
      name: "SimpleCounterHash",
      version: "1",
      chainId: chainId,
      verifyingContract: simpleCounterHashAddress,
    };

    const userSalt = ethers.hexlify(ethers.randomBytes(32));
    const deadline = 0; // No expiry
    const payload = await simpleCounterHash.increment.populateTransaction();

    const message = {
      userSalt: userSalt,
      from: userAddress,
      functionSignature: payload.data,
      deadline: deadline,
    };

    const signature = await user.signTypedData(domainData, types, message);

    await simpleCounterHash.executeMetaTransaction(
      userAddress,
      payload.data,
      userSalt,
      deadline,
      signature
    );

    const newCounter = await simpleCounterHash.counter();
    expect(newCounter.toString()).to.equal("1");
  });

  it("#7: should simulate relayer executing meta-transaction", async () => {
    const chainId = (await hre.ethers.provider.getNetwork()).chainId;

    const types = {
      MetaTransaction: [
        { name: "userSalt", type: "bytes32" },
        { name: "from", type: "address" },
        { name: "functionSignature", type: "bytes" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const domainData = {
      name: "SimpleCounterHash",
      version: "1",
      chainId: chainId,
      verifyingContract: simpleCounterHashAddress,
    };

    const userSalt = ethers.hexlify(ethers.randomBytes(32));
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const payload = await simpleCounterHash.increment.populateTransaction();

    const message = {
      userSalt: userSalt,
      from: userAddress,
      functionSignature: payload.data,
      deadline: deadline,
    };

    // User signs the transaction
    const signature = await user.signTypedData(domainData, types, message);

    // Relayer creates and sends the meta-transaction
    const metaPayload = await simpleCounterHash.executeMetaTransaction.populateTransaction(
      userAddress,
      payload.data,
      userSalt,
      deadline,
      signature
    );

    // Relayer sends the transaction (pays gas)
    const response = await relayer.sendTransaction(metaPayload);
    await response.wait();

    const newCounter = await simpleCounterHash.counter();
    expect(newCounter.toString()).to.equal("1");
  });

  it("#8: should reject invalid signature", async () => {
    const chainId = (await hre.ethers.provider.getNetwork()).chainId;

    const types = {
      MetaTransaction: [
        { name: "userSalt", type: "bytes32" },
        { name: "from", type: "address" },
        { name: "functionSignature", type: "bytes" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const domainData = {
      name: "SimpleCounterHash",
      version: "1",
      chainId: chainId,
      verifyingContract: simpleCounterHashAddress,
    };

    const userSalt = ethers.hexlify(ethers.randomBytes(32));
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const payload = await simpleCounterHash.increment.populateTransaction();

    const message = {
      userSalt: userSalt,
      from: userAddress,
      functionSignature: payload.data,
      deadline: deadline,
    };

    // Relayer signs instead of user (wrong signer)
    const signature = await relayer.signTypedData(domainData, types, message);

    let reverted = false;
    try {
      await simpleCounterHash.executeMetaTransaction(
        userAddress,
        payload.data,
        userSalt,
        deadline,
        signature
      );
    } catch (error) {
      reverted = true;
    }
    expect(reverted, "Should have reverted on invalid signature").to.be.true;
  });
});
