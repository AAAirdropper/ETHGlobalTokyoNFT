/* eslint-disable @typescript-eslint/naming-convention */
import { Web3Function, Web3FunctionContext } from "@gelatonetwork/web3-functions-sdk";
import { Contract, BigNumber } from "ethers";
import { Configuration, OpenAIApi } from "openai";
import { NFTStorage, File } from "nft.storage";
import axios, { AxiosError } from "axios";

const NFT_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "function revealNft(uint256 tokenId, string memory tokenURI) external",
  "function tokenURI(uint256 tokenId) public view returns (string memory) ",
  "function tokenIds() public view returns(uint256)",
  "function tokenIdByUser(address) public view returns(uint256)",
  "function nightTimeByToken(uint256) public view returns(bool)",
  "function mint(bool _isNight) external",
  "event MintEvent(uint256 _tokenId)",
];
const NOT_REVEALED_URI = "ipfs://bafybeigfcu57orxvt2fyn7gku5c27e7ama6yxmk5tq6xjqkfjptaxfmici/metadata.json";

function generateNftProperties(isNight: boolean) {
  const timeSelected = isNight ? "at night" : "at sunset";

  const description = `Spectacular Background of Tokyo in Spring ${timeSelected} in a cyberpunk art, 3D, video game, and pastel salmon colors`;
  return {
    description,
    attributes: [
      { trait_type: "Time", value: timeSelected },
      { trait_type: "Place", value: "Tokyo" },
      { trait_type: "Eating", value: "Ramen" },
      { trait_type: "Powered", value: "Web3" },
    ],
  };
}

Web3Function.onRun(async (context: Web3FunctionContext) => {
  const { userArgs, storage, secrets, provider } = context;

  ////// User Arguments
  const nftAddress = userArgs.nftAddress;
  if (!nftAddress) throw new Error("Missing userArgs.nftAddress please provide");

  ////// User Secrets
  const nftStorageApiKey = await secrets.get("NFT_STORAGE_API_KEY");
  if (!nftStorageApiKey) throw new Error("Missing secrets.NFT_STORAGE_API_KEY");

  const openAiApiKey = await secrets.get("OPEN_AI_API_KEY");
  if (!openAiApiKey) throw new Error("Missing secrets.OPEN_AI_API_KEY");

 ////// User Storage
  const lastProcessedId = parseInt((await storage.get("lastProcessedId")) ?? "0");


  const nft = new Contract(nftAddress as string, NFT_ABI, provider);


  const currentTokenId = await nft.tokenIds();
  if (currentTokenId.eq(BigNumber.from(lastProcessedId))) {
    return { canExec: false, message: "No New Tokens" };
  }

  const tokenId = lastProcessedId + 1;
  const tokenURI = await nft.tokenURI(tokenId);
  if (tokenURI == NOT_REVEALED_URI) {
    // Generate NFT properties
    const isNight = await nft.nightTimeByToken(tokenId);
    const nftProps = generateNftProperties(isNight);
    console.log(`Open AI prompt: ${nftProps.description}`);

    // Generate NFT image with OpenAI (Dall-E)

    const openai = new OpenAIApi(new Configuration({ apiKey: openAiApiKey }));
    let imageUrl: string;
    try {
      const response = await openai.createImage({
        prompt: nftProps.description,
        size: "512x512",
      });
      imageUrl = response.data.data[0].url as string;
      console.log(`Open AI generated image: ${imageUrl}`);
    } catch (_err) {
      const openAiError = _err as AxiosError;
      const errrorMessage = openAiError.response
        ? `${openAiError.response.status}: ${openAiError.response.data}`
        : openAiError.message;
      return { canExec: false, message: `OpenAI error: ${errrorMessage}` };
    }

    // Publish NFT metadata on IPFS
    const imageBlob = (await axios.get(imageUrl, { responseType: "blob" })).data;
 
    const client = new NFTStorage({ token: nftStorageApiKey });
    const imageFile = new File([imageBlob], `gelato_bot_${tokenId}.png`, { type: "image/png" });

    const metadata = await client.store({
      name: `ETHGlobal Tokyo Bot#${tokenId}`,
      description: nftProps.description,
      image: imageFile,
      attributes: nftProps.attributes,
      collection: { name: "EthGlobalTokyo-Bots", family: "ethglobaltokyo-bots" },
    });
    console.log("IPFS Metadata:", metadata.url);

    await storage.set("lastProcessedId", tokenId.toString());

    return {
      canExec: true,
      callData: nft.interface.encodeFunctionData("revealNft", [tokenId, metadata.url]),
    };
  } else {
    console.log(`#${tokenId} already minted!`);
    await storage.set("lastProcessedId", tokenId.toString());
    return { canExec: false, message: "Token already Minted" };
  }
});
