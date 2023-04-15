/* eslint-disable @typescript-eslint/naming-convention */
import { Web3Function, Web3FunctionContext } from "@gelatonetwork/web3-functions-sdk";
import { Contract, utils } from "ethers";
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
const PROXY_ABI = ["function batchExecuteCall(address[] _targets, bytes[] _datas, uint256[] _values) payable"];
const NOT_REVEALED_URI = "ipfs://bafyreicwi7sbomz7lu5jozgeghclhptilbvvltpxt3hbpyazz5zxvqh62m/metadata.json";

function generateNftProperties(isNight: boolean) {
  const timeSelected = isNight ? "at night" : "at sunset";

  const description = `A cute robot eating an icecream with Zurich background ${timeSelected} in a cyberpunk art, 3D, video game, and pastel salmon colors`;
  return {
    description,
    attributes: [
      { trait_type: "Time", value: timeSelected },
      { trait_type: "Place", value: "Eth Zurich" },
      { trait_type: "Eating", value: "Gelato" },
      { trait_type: "Powered", value: "Web 3 Functions" },
    ],
  };
}

Web3Function.onRun(async (context: Web3FunctionContext) => {
  const { userArgs, storage, secrets, provider } = context;

  // Check required userArgs & secrets
  const nftAddress = userArgs.nftAddress;
  if (!nftAddress) throw new Error("Missing userArgs.nftAddress");
  const openAiApiKey = await secrets.get("OPEN_AI_API_KEY");
  if (!openAiApiKey) throw new Error("Missing secrets.OPEN_AI_API_KEY");
  const openai = new OpenAIApi(new Configuration({ apiKey: openAiApiKey }));
  const nftStorageApiKey = await secrets.get("NFT_STORAGE_API_KEY");
  if (!nftStorageApiKey) throw new Error("Missing secrets.NFT_STORAGE_API_KEY");
  const nftStorage = new NFTStorage({ token: nftStorageApiKey });

  // Retreive current state
  const nft = new Contract(nftAddress as string, NFT_ABI, provider);
  const lastProcessedId = parseInt((await storage.get("lastProcessedId")) ?? "0");
  const currentTokenId = (await nft.tokenIds()).toNumber();
  if (currentTokenId === lastProcessedId) {
    return { canExec: false, message: "No New Tokens" };
  }

  // Get batch of next token ids to process in parallel
  const tokenIds: number[] = [];
  let tokenId = lastProcessedId;
  let nbRpcCalls = 0;
  const MAX_RPC_CALLS = 30;
  const MAX_NFT_IN_BATCH = 5;
  while (tokenId < currentTokenId && tokenIds.length < MAX_NFT_IN_BATCH && nbRpcCalls < MAX_RPC_CALLS) {
    // Check if token needs to be revealed or is already revealed
    tokenId++;
    const tokenURI = await nft.tokenURI(tokenId);
    if (tokenURI === NOT_REVEALED_URI) {
      tokenIds.push(tokenId);
    } else {
      console.log(`#${tokenId} already revealed!`);
    }
    nbRpcCalls++;
  }

  if (tokenIds.length === 0) {
    console.log(`All NFTs already revealed!`);
    await storage.set("lastProcessedId", tokenId.toString());
    return { canExec: false, message: "All NFTs already revealed" };
  }

  console.log("NFTs to reveal:", tokenIds);
  const tokensData = await Promise.all(
    tokenIds.map(async (tokenId) => {
      // Generate NFT properties
      const isNight = await nft.nightTimeByToken(tokenId);
      const nftProps = generateNftProperties(isNight);
      console.log(`#${tokenId} Open AI prompt: ${nftProps.description}`);

      // Generate NFT image with OpenAI (Dall-E)
      let imageUrl: string;
      try {
        const response = await openai.createImage({
          prompt: nftProps.description,
          size: "512x512",
        });
        imageUrl = response.data.data[0].url as string;
        console.log(`#${tokenId} Open AI generated image: ${imageUrl}`);
      } catch (_err) {
        const openAiError = _err as AxiosError;
        const errrorMessage = openAiError.response
          ? `${openAiError.response.status}: ${(openAiError.response.data as any)?.error?.code}`
          : openAiError.message;
        throw new Error(`OpenAI error: ${errrorMessage}`);
      }

      // Publish NFT metadata on IPFS
      const imageBlob = (await axios.get(imageUrl, { responseType: "blob" })).data;
      const imageFile = new File([imageBlob], `gelato_bot_${tokenId}.png`, { type: "image/png" });
      const metadata = await nftStorage.store({
        name: `ETHGlobal Tokyo Bot#${tokenId}`,
        description: nftProps.description,
        image: imageFile,
        attributes: nftProps.attributes,
        collection: { name: "EthGlobalTokyo-Bots", family: "ethglobaltokyo-bots" },
      });
      console.log(`#${tokenId} IPFS Metadata ${metadata.url}`);

      return { id: tokenId, url: metadata.url };
    })
  );

  await storage.set("lastProcessedId", tokenId.toString());

  // Use Automate Proxy `batchExecuteCall` to send multiple requests in batch
  const proxyInterface = new utils.Interface(PROXY_ABI);
  const addresses: string[] = [];
  const calls: string[] = [];
  const values: number[] = [];
  tokensData.forEach((token) => {
    addresses.push(nft.address);
    calls.push(nft.interface.encodeFunctionData("revealNft", [token.id, token.url]));
    values.push(0);
  });
  return {
    canExec: true,
    callData: proxyInterface.encodeFunctionData("batchExecuteCall", [addresses, calls, values]),
  };
});
