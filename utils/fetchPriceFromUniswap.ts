import { Fetcher, Route, Token } from "@uniswap/sdk";
import { ethers } from "ethers";
import { endpoints } from "~~/lib/endpoints";
import { getTargetNetwork } from "~~/utils/networks";

const mainnetProvider = new ethers.providers.JsonRpcProvider(endpoints.mainnetRpc);

export const fetchPriceFromUniswap = async (): Promise<number> => {
  const configuredNetwork = getTargetNetwork();
  if (configuredNetwork.nativeCurrency.symbol !== "ETH" && !configuredNetwork.nativeCurrencyTokenAddress) {
    return 0;
  }
  try {
    const DAI = new Token(1, "0x6B175474E89094C44Da98b954EedeAC495271d0F", 18);
    const TOKEN = await Fetcher.fetchTokenData(
      1,
      configuredNetwork.nativeCurrencyTokenAddress || "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      mainnetProvider,
    );
    const pair = await Fetcher.fetchPairData(DAI, TOKEN, mainnetProvider);
    const route = new Route([pair], TOKEN);
    return parseFloat(route.midPrice.toSignificant(6));
  } catch (error) {
    console.error("fetchPriceFromUniswap error:", error);
    return 0;
  }
};
