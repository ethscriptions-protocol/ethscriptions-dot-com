import * as chains from "wagmi/chains";

export type ChainConfig = {
  targetNetwork: chains.Chain;
  pollingInterval: number;
};

const parsedPollingInterval = Number(process.env.NEXT_PUBLIC_RPC_POLLING_INTERVAL);

const chainConfig = {
  targetNetwork: chains[(process.env.NEXT_PUBLIC_NETWORK ?? "mainnet") as keyof typeof chains] as chains.Chain,
  pollingInterval: Number.isFinite(parsedPollingInterval) && parsedPollingInterval > 0 ? parsedPollingInterval : 10000,
} satisfies ChainConfig;

export default chainConfig;
