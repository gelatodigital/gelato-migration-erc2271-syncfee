import hre, { deployments, getNamedAccounts } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const isHardhat = hre.network.name === "hardhat";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  if (!isHardhat) {
    console.log(
      `\nDeploying TrustedForwarderConcurrentERC2771 to ${hre.network.name}. Hit ctrl + c to abort`
    );
  }

  const TrustedForwarderConcurrent = await deploy("TrustedForwarderConcurrentERC2771", {
    from: deployer,
    log: !isHardhat,
  });

  console.log("TrustedForwarderConcurrentERC2771 deployed to", TrustedForwarderConcurrent.address);
};

func.tags = ["TrustedForwarderConcurrent"];

export default func;
