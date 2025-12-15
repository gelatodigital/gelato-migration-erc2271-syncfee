import hre, { deployments, getNamedAccounts } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const isHardhat = hre.network.name === "hardhat";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  if (!isHardhat) {
    console.log(
      `\nDeploying Contracts to to ${hre.network.name}. Hit ctrl + c to abort`
    );
  }
  const SimpleCounterHash = await deploy("SimpleCounterHash", {
    from: deployer,
    log: !isHardhat,
  });
  console.log("SimpleCounterHash deployed to", SimpleCounterHash.address);
};

func.tags = ["SimpleCounterHash"];

export default func;
