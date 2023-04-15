/* eslint-disable @typescript-eslint/naming-convention */
import hre from "hardhat";
import { GelatoOpsSDK, isGelatoOpsSupported, TaskTransaction, Web3Function } from "@gelatonetwork/ops-sdk";
import { Contract } from "ethers";

async function main() {
  const chainId = hre.network.config.chainId as number;

  // Init GelatoOpsSDK
  const NFT_ABI = [
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
    "function revealNft(uint256 tokenId, string memory tokenURI) external",
    "function tokenURI(uint256 tokenId) public view returns (string memory) ",
    "function tokenIds() public view returns(uint256)",
    "function mint(bool _isNight) external",
  ];

  let nftAddress = "0x5041c60C75633F29DEb2AED79cB0A9ed79202415";

  const [signer] = await hre.ethers.getSigners();
  const nft = new Contract(nftAddress as string, NFT_ABI, signer);

  let nonce = await signer.getTransactionCount();
  let tx = await nft.mint(false, {
    nonce,
    gasPrice: 190000000000,
    gasLimit: 10000000,
  });
  await tx.wait();

  let tokenId = await nft.tokenIds();
  console.log(tokenId.toString());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
