import hre, { deployments, getNamedAccounts } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const isHardhat = hre.network.name === "hardhat";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  if (!isHardhat) {
    console.log(
      `\nDeploying TrustedForwarder to ${hre.network.name}. Hit ctrl + c to abort`
    );
  }

  const TrustedForwarder = await deploy("TrustedForwarderERC2771", {
    from: deployer,
    log: !isHardhat,
  });

  console.log("TrustedForwarderERC2771 deployed to", TrustedForwarder.address);
};

func.tags = ["TrustedForwarder"];

export default func;
