import hre, { deployments, getNamedAccounts } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const isHardhat = hre.network.name === "hardhat";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  if (!isHardhat) {
    console.log(
      `\nDeploying SimpleCounterTrusted to ${hre.network.name}. Hit ctrl + c to abort`
    );
  }

  // Get the TrustedForwarder address
  const trustedForwarder = await get("TrustedForwarderERC2771");

  const SimpleCounterTrusted = await deploy("SimpleCounterTrusted", {
    from: deployer,
    args: [trustedForwarder.address],
    log: !isHardhat,
  });

  console.log("SimpleCounterTrusted deployed to", SimpleCounterTrusted.address);
  console.log("Using TrustedForwarder at", trustedForwarder.address);
};

func.tags = ["SimpleCounterTrusted"];
func.dependencies = ["TrustedForwarder"];

export default func;
