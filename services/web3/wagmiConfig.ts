import { connectorsForWallets, type WalletList } from "@rainbow-me/rainbowkit";
import {
  braveWallet,
  coinbaseWallet,
  ledgerWallet,
  metaMaskWallet,
  okxWallet,
  rainbowWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { http, createConfig } from "wagmi";
import * as chains from "wagmi/chains";
import { endpoints } from "~~/lib/endpoints";
import chainConfig from "~~/chain.config";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

const targetNetwork = chainConfig.targetNetwork;

const enabledChains =
  targetNetwork.id === chains.mainnet.id
    ? ([chains.mainnet] as const)
    : ([targetNetwork, chains.mainnet] as const);

const transports: Record<number, ReturnType<typeof http>> = {
  [chains.mainnet.id]: http(endpoints.mainnetRpc),
};
if (targetNetwork.id === chains.sepolia.id) {
  transports[chains.sepolia.id] = http(endpoints.sepoliaRpc);
} else if (targetNetwork.id !== chains.mainnet.id) {
  transports[targetNetwork.id] = http();
}

// RainbowKit wallet factories that depend on WalletConnect (require a projectId at
// construction time). When projectId is missing we omit these so the app still boots
// in dev with browser-injected wallets only.
const walletList: WalletList = projectId
  ? [
      {
        groupName: "Supported Wallets",
        wallets: [
          metaMaskWallet,
          walletConnectWallet,
          ledgerWallet,
          braveWallet,
          coinbaseWallet,
          rainbowWallet,
          okxWallet,
        ],
      },
    ]
  : [
      {
        groupName: "Supported Wallets",
        wallets: [coinbaseWallet, braveWallet],
      },
    ];

if (!projectId) {
  // eslint-disable-next-line no-console
  console.warn(
    "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set; WalletConnect-based wallets (mobile MetaMask, Rainbow, Trust, Phantom, Ledger Live, OKX, etc.) will be unavailable. Falling back to Coinbase/Brave plus EIP-6963-discovered browser wallets.",
  );
}

const connectors = connectorsForWallets(walletList, {
  appName: "Ethscriptions",
  projectId: projectId ?? "",
});

export const wagmiConfig = createConfig({
  chains: enabledChains as unknown as readonly [chains.Chain, ...chains.Chain[]],
  connectors,
  transports,
  ssr: true,
  pollingInterval: chainConfig.pollingInterval,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
