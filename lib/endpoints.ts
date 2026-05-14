// Single source of truth for all external service URLs the app talks to.
// Values come from environment variables defined in `.env` (committed) and
// can be overridden per-deployment via `.env.local` or Vercel env vars.

const stripTrailingSlash = (s: string | undefined) => (s ?? "").replace(/\/$/, "");

export const endpoints = {
  apiV2: stripTrailingSlash(process.env.NEXT_PUBLIC_V2_API_BASE_URI),
  explorer: stripTrailingSlash(process.env.NEXT_PUBLIC_EXPLORER_BASE_URI),
  docs: stripTrailingSlash(process.env.NEXT_PUBLIC_DOCS_BASE_URI),
  website: stripTrailingSlash(process.env.NEXT_PUBLIC_WEBSITE_BASE_URI),
  mainnetRpc: stripTrailingSlash(process.env.NEXT_PUBLIC_MAINNET_RPC_URL),
  sepoliaRpc: stripTrailingSlash(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL),
};
