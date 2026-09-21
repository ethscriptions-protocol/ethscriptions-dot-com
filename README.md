# ethscriptions.com

Source for the [ethscriptions.com](https://ethscriptions.com) website — a Next.js app for creating and browsing ethscriptions on Ethereum L1.

## Stack

- Next.js (Pages Router)
- wagmi + viem + RainbowKit
- Tailwind + DaisyUI
- TypeScript

## Quick start

Requires Node `>=24` and npm.

```bash
npm install
npm start
```

The dev server runs on `http://localhost:3000`. No setup needed — defaults in [`.env`](.env) (committed) make the app talk to the Ethscriptions v2 API and Ethereum L1 RPCs out of the box.

To override anything (different network, your own indexer, WalletConnect project ID, analytics), create a `.env.local` file with the variables you want to change. `.env.local` is gitignored.

## Environment variables

All app config lives in [`.env`](.env) — the single source of truth for service URLs and feature flags. The most relevant variables:

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_NETWORK` | Target chain name (any key from `wagmi/chains`) |
| `NEXT_PUBLIC_V2_API_BASE_URI` | Ethscriptions v2 API |
| `NEXT_PUBLIC_EXPLORER_BASE_URI` | BlockScout-style explorer (collection snapshot script only; hosted explorer shuts down October 21, 2026) |
| `NEXT_PUBLIC_DOCS_BASE_URI` | Docs site (linked from header/landing) |
| `NEXT_PUBLIC_WEBSITE_BASE_URI` | Canonical site URL (used for the OG image) |
| `NEXT_PUBLIC_MAINNET_RPC_URL` / `NEXT_PUBLIC_SEPOLIA_RPC_URL` | Ethereum L1 RPC endpoints used by wagmi |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Required for mobile/QR wallet flows. Get one at [cloud.reown.com](https://cloud.reown.com) |
| `NEXT_PUBLIC_RPC_POLLING_INTERVAL` | Wagmi polling interval (ms) |
| `NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS` | Set to `true` to enable Vercel Web Analytics |
| `ETHSCRIPTIONS_MAINNET_RPC_URL` | Only used by `scripts/refresh-collections.py` |

## Scripts

| Command | Description |
|---|---|
| `npm start` / `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run serve` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run check-types` | TypeScript check |
| `npm run format` | Prettier |

## License

[MIT](LICENSE)
