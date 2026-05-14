import { simulateContract } from "@wagmi/core";
import axios from "axios";
import { type Hex } from "viem";
import { wagmiConfig } from "~~/services/web3/wagmiConfig";
import { Ethscription } from "~~/types/ethscriptions";
import { v2 } from "~~/utils/escUrl";

// Mainnet marketplace proxy (EIP-1967, implementation at
// 0xd28596d71998a31c286687050c54e0a3b811360f as of writing). Kept as an array so future
// migrations / additional deployments can be added without touching call sites.
export const MARKETPLACE_ADDRESSES = [
  "0xd729a94d6366a4feac4a6869c8b3573cee4701a9",
] as const satisfies readonly Hex[];

// Current proxy. Writes (withdraw, cancel-all) target this one.
export const MARKETPLACE_ADDRESS: Hex = MARKETPLACE_ADDRESSES[0];

const MARKETPLACE_ADDRESS_SET = new Set<string>(MARKETPLACE_ADDRESSES.map(a => a.toLowerCase()));

export const isMarketplaceAddress = (address?: string | null): boolean =>
  !!address && MARKETPLACE_ADDRESS_SET.has(address.toLowerCase());

// Display labels for addresses we want to render as named entities (e.g. the marketplace
// proxy) rather than as raw hex / ENS. Keyed by lowercased address.
export const KNOWN_ADDRESS_LABELS: Record<string, string> = Object.fromEntries(
  MARKETPLACE_ADDRESSES.map(a => [a.toLowerCase(), "Marketplace Contract"]),
);

// Hand-rolled minimal ABI. cancelAllListings (V1/V2) was renamed to cancelAllListingsOfUser
// in V3; we keep both and probe at runtime which the live impl accepts.
export const marketplaceAbi = [
  {
    type: "function",
    name: "withdrawEthscription",
    stateMutability: "nonpayable",
    inputs: [{ name: "ethscriptionId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelAllListings",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelAllListingsOfUser",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
] as const;

// Return every ethscription currently escrowed for `user`: V2 indexes
// (previous_owner=user, current_owner=marketplace) directly. Paginates each marketplace
// until exhausted. No on-chain log scan required.
export async function getEscrowedEthscriptions(user: Hex): Promise<Ethscription[]> {
  const all: Ethscription[] = [];
  for (const marketplace of MARKETPLACE_ADDRESSES) {
    let pageKey: string | undefined;
    do {
      const params: Record<string, string | number> = {
        previous_owner: user.toLowerCase(),
        current_owner: marketplace.toLowerCase(),
        max_results: 100,
      };
      if (pageKey) params.page_key = pageKey;
      const res = await axios.get(v2("ethscriptions"), { params });
      const items = (res.data.result ?? []) as Ethscription[];
      all.push(...items);
      pageKey = res.data.pagination?.has_more ? res.data.pagination?.page_key : undefined;
    } while (pageKey);
  }
  return all;
}

const cancelFnCache = new Map<Hex, "cancelAllListingsOfUser" | "cancelAllListings">();

// Try the V3 name first; if simulation reverts, fall back to V1/V2 name. Result is
// cached per address for the page session.
export async function pickCancelAllFunctionName(
  user: Hex,
): Promise<"cancelAllListingsOfUser" | "cancelAllListings"> {
  const cached = cancelFnCache.get(user);
  if (cached) return cached;
  try {
    await simulateContract(wagmiConfig, {
      address: MARKETPLACE_ADDRESS,
      abi: marketplaceAbi,
      functionName: "cancelAllListingsOfUser",
      account: user,
    });
    cancelFnCache.set(user, "cancelAllListingsOfUser");
    return "cancelAllListingsOfUser";
  } catch {
    cancelFnCache.set(user, "cancelAllListings");
    return "cancelAllListings";
  }
}
