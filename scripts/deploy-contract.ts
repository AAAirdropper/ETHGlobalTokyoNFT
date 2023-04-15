/* eslint-disable @typescript-eslint/naming-convention */
import hre from "hardhat";
import { GelatoOpsSDK, isGelatoOpsSupported, TaskTransaction, Web3Function } from "@gelatonetwork/ops-sdk";

async function main() {
  const chainId = hre.network.config.chainId as number;


  // Init GelatoOpsSDK
  const [signer] = await hre.ethers.getSigners();

  console.log(signer.address)


  const gelatoOps = new GelatoOpsSDK(80001, signer);
   const dedicatedMsgSender = await gelatoOps.getDedicatedMsgSender();
   console.log(`Dedicated msg.sender: ${dedicatedMsgSender.address} is deployed ${dedicatedMsgSender.isDeployed}`);

   let nonce = await signer.getTransactionCount();

  // Deploying NFT contract
  const nftFactory = await hre.ethers.getContractFactory("EthGlobalTokyoBotNft",signer);
  console.log("Deploying EthGlobalTokyoBotNft...");
  const gelatoBotNft = await nftFactory.deploy(dedicatedMsgSender.address,{  
    nonce,
    gasPrice:190000000000,
    gasLimit:10000000});
  await gelatoBotNft.deployed();


  console.log(`EthGlobalTokyoBotNft deployed to: ${gelatoBotNft.address}`);

}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
