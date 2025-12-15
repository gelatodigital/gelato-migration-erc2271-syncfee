import hre, { deployments, getNamedAccounts } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const isHardhat = hre.network.name === "hardhat";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  if (!isHardhat) {
    console.log(
      `\nDeploying SimpleCounterTrustedConcurrent to ${hre.network.name}. Hit ctrl + c to abort`
    );
  }

  // Get the TrustedForwarderConcurrentERC2771 address
  const trustedForwarderConcurrent = await get("TrustedForwarderConcurrentERC2771");

  const SimpleCounterTrustedConcurrent = await deploy("SimpleCounterTrustedConcurrent", {
    from: deployer,
    args: [trustedForwarderConcurrent.address],
    log: !isHardhat,
  });

  console.log("SimpleCounterTrustedConcurrent deployed to", SimpleCounterTrustedConcurrent.address);
  console.log("Using TrustedForwarderConcurrentERC2771 at", trustedForwarderConcurrent.address);
};

func.tags = ["SimpleCounterTrustedConcurrent"];
func.dependencies = ["TrustedForwarderConcurrent"];

export default func;
