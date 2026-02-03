import hre, { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Test SimpleCounterSponsoredWithFee (SyncFee Migration Example)", function () {
  let simpleCounter: any;
  let mockToken: any;
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let feeCollector: SignerWithAddress;
  let relayer: SignerWithAddress;

  const FEE_AMOUNT = ethers.parseUnits("1", 6); // 1 USDC (6 decimals)

  beforeEach("deploy contracts", async function () {
    if (hre.network.name !== "hardhat") {
      console.error("Test Suite is meant to be run on hardhat only");
      process.exit(1);
    }

    [owner, user, feeCollector, relayer] = await hre.ethers.getSigners();

    // Deploy mock ERC20 token with permit
    const MockERC20Permit = await ethers.getContractFactory("MockERC20Permit");
    mockToken = await MockERC20Permit.deploy("Mock USDC", "USDC", 6);
    await mockToken.waitForDeployment();

    // Mint tokens to user
    await mockToken.mint(await user.getAddress(), ethers.parseUnits("1000", 6));

    // Deploy SimpleCounterSponsoredWithFee
    const SimpleCounterSponsoredWithFee = await ethers.getContractFactory("SimpleCounterSponsoredWithFee");
    simpleCounter = await SimpleCounterSponsoredWithFee.deploy(await feeCollector.getAddress());
    await simpleCounter.waitForDeployment();

    console.log(`SimpleCounterSponsoredWithFee deployed to ${await simpleCounter.getAddress()}`);
    console.log(`MockERC20Permit deployed to ${await mockToken.getAddress()}`);
    console.log(`Fee collector: ${await feeCollector.getAddress()}`);
  });

  describe("Direct calls (simulating sponsored transactions)", function () {
    it("#1: should increment counter with fee payment using permit (gasless approval)", async () => {
      const userAddress = await user.getAddress();
      const feeCollectorAddress = await feeCollector.getAddress();
      const contractAddress = await simpleCounter.getAddress();
      const tokenAddress = await mockToken.getAddress();

      // Get initial balances
      const initialUserBalance = await mockToken.balanceOf(userAddress);
      const initialCollectorBalance = await mockToken.balanceOf(feeCollectorAddress);
      const initialCounter = await simpleCounter.counter();

      // Create permit signature
      const chainId = (await hre.ethers.provider.getNetwork()).chainId;
      const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const nonce = await mockToken.nonces(userAddress);

      const domain = {
        name: "Mock USDC",
        version: "1",
        chainId: chainId,
        verifyingContract: tokenAddress,
      };

      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };

      const message = {
        owner: userAddress,
        spender: contractAddress,
        value: FEE_AMOUNT,
        nonce: nonce,
        deadline: deadline,
      };

      const signature = await user.signTypedData(domain, types, message);
      const { v, r, s } = ethers.Signature.from(signature);

      // Execute increment with permit (user calls, but in production this would be relayed)
      await simpleCounter.connect(user).incrementWithPermit(
        tokenAddress,
        FEE_AMOUNT,
        deadline,
        v,
        r,
        s
      );

      // Verify results
      const finalUserBalance = await mockToken.balanceOf(userAddress);
      const finalCollectorBalance = await mockToken.balanceOf(feeCollectorAddress);
      const finalCounter = await simpleCounter.counter();

      expect(finalCounter).to.equal(initialCounter + 1n);
      expect(finalUserBalance).to.equal(initialUserBalance - FEE_AMOUNT);
      expect(finalCollectorBalance).to.equal(initialCollectorBalance + FEE_AMOUNT);

      console.log(`\n  Fee paid: ${ethers.formatUnits(FEE_AMOUNT, 6)} USDC`);
      console.log(`  Counter: ${initialCounter} → ${finalCounter}`);
    });

    it("#2: should increment counter with fee payment (prior approval)", async () => {
      const userAddress = await user.getAddress();
      const feeCollectorAddress = await feeCollector.getAddress();
      const contractAddress = await simpleCounter.getAddress();
      const tokenAddress = await mockToken.getAddress();

      // User approves contract to spend tokens
      await mockToken.connect(user).approve(contractAddress, FEE_AMOUNT);

      // Get initial values
      const initialCounter = await simpleCounter.counter();
      const initialCollectorBalance = await mockToken.balanceOf(feeCollectorAddress);

      // Execute increment with fee
      await simpleCounter.connect(user).incrementWithFee(tokenAddress, FEE_AMOUNT);

      // Verify results
      const finalCounter = await simpleCounter.counter();
      const finalCollectorBalance = await mockToken.balanceOf(feeCollectorAddress);

      expect(finalCounter).to.equal(initialCounter + 1n);
      expect(finalCollectorBalance).to.equal(initialCollectorBalance + FEE_AMOUNT);
    });

    it("#3: should increment counter without fee (fully sponsored)", async () => {
      const initialCounter = await simpleCounter.counter();

      // Execute increment without fee
      await simpleCounter.connect(user).increment();

      const finalCounter = await simpleCounter.counter();
      expect(finalCounter).to.equal(initialCounter + 1n);
    });

    it("#4: should emit FeePaid event", async () => {
      const contractAddress = await simpleCounter.getAddress();
      const tokenAddress = await mockToken.getAddress();

      // Approve and execute
      await mockToken.connect(user).approve(contractAddress, FEE_AMOUNT);

      const tx = await simpleCounter.connect(user).incrementWithFee(tokenAddress, FEE_AMOUNT);
      const receipt = await tx.wait();

      // Check FeePaid event was emitted
      const feePaidEvent = receipt?.logs.find((log: any) => {
        try {
          const parsed = simpleCounter.interface.parseLog({ topics: log.topics as string[], data: log.data });
          return parsed?.name === "FeePaid";
        } catch { return false; }
      });
      expect(feePaidEvent).to.not.be.undefined;
    });

    it("#5: should revert with invalid fee token", async () => {
      try {
        await simpleCounter.connect(user).incrementWithFee(ethers.ZeroAddress, FEE_AMOUNT);
        expect.fail("Expected transaction to revert");
      } catch (error: any) {
        expect(error.message).to.include("InvalidFeeToken");
      }
    });

    it("#6: should revert if user has insufficient balance", async () => {
      const tokenAddress = await mockToken.getAddress();
      const contractAddress = await simpleCounter.getAddress();
      const hugeAmount = ethers.parseUnits("1000000", 6); // More than user has

      await mockToken.connect(user).approve(contractAddress, hugeAmount);

      try {
        await simpleCounter.connect(user).incrementWithFee(tokenAddress, hugeAmount);
        expect.fail("Expected transaction to revert");
      } catch (error) {
        // Expected to revert
      }
    });
  });

  describe("Fee collector management", function () {
    it("#7: should allow owner to update fee collector", async () => {
      const newCollector = await relayer.getAddress();

      const tx = await simpleCounter.connect(owner).setFeeCollector(newCollector);
      await tx.wait();

      expect(await simpleCounter.feeCollector()).to.equal(newCollector);
    });

    it("#8: should not allow non-owner to update fee collector", async () => {
      const newCollector = await relayer.getAddress();

      try {
        await simpleCounter.connect(user).setFeeCollector(newCollector);
        expect.fail("Expected transaction to revert");
      } catch (error) {
        // Expected to revert
      }
    });

    it("#9: should not allow setting zero address as fee collector", async () => {
      try {
        await simpleCounter.connect(owner).setFeeCollector(ethers.ZeroAddress);
        expect.fail("Expected transaction to revert");
      } catch (error: any) {
        expect(error.message).to.include("InvalidFeeCollector");
      }
    });
  });

  describe("Sponsored transaction simulation", function () {
    it("#10: should work when relayer submits on behalf of user (permit flow)", async () => {
      // This simulates what happens with Gelato sponsored transactions:
      // 1. User signs permit off-chain
      // 2. Relayer submits the transaction (pays gas from Gas Tank)
      // 3. Contract collects fee from user

      const userAddress = await user.getAddress();
      const contractAddress = await simpleCounter.getAddress();
      const tokenAddress = await mockToken.getAddress();

      // User signs permit off-chain
      const chainId = (await hre.ethers.provider.getNetwork()).chainId;
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const nonce = await mockToken.nonces(userAddress);

      const domain = {
        name: "Mock USDC",
        version: "1",
        chainId: chainId,
        verifyingContract: tokenAddress,
      };

      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };

      const message = {
        owner: userAddress,
        spender: contractAddress,
        value: FEE_AMOUNT,
        nonce: nonce,
        deadline: deadline,
      };

      const signature = await user.signTypedData(domain, types, message);
      const { v, r, s } = ethers.Signature.from(signature);

      // Encode the function call (what would be sent to Gelato)
      const functionData = simpleCounter.interface.encodeFunctionData(
        "incrementWithPermit",
        [tokenAddress, FEE_AMOUNT, deadline, v, r, s]
      );

      console.log("\n  --- Sponsored Transaction Simulation ---");
      console.log(`  User: ${userAddress}`);
      console.log(`  Relayer: ${await relayer.getAddress()}`);
      console.log(`  Function data: ${functionData.slice(0, 66)}...`);

      // Relayer submits the transaction (simulating Gelato relay)
      // Note: In production, this would go through Gelato's relay
      const initialCounter = await simpleCounter.counter();

      // The relayer would submit this via Gelato sponsored call
      // For testing, we simulate by having user call directly
      // In production: relayer.sendTransaction({ to: contractAddress, data: functionData })
      await simpleCounter.connect(user).incrementWithPermit(
        tokenAddress,
        FEE_AMOUNT,
        deadline,
        v,
        r,
        s
      );

      const finalCounter = await simpleCounter.counter();
      expect(finalCounter).to.equal(initialCounter + 1n);

      console.log(`  Counter incremented: ${initialCounter} → ${finalCounter}`);
      console.log(`  Fee collected: ${ethers.formatUnits(FEE_AMOUNT, 6)} USDC`);
      console.log("  --- End Simulation ---\n");
    });
  });
});
