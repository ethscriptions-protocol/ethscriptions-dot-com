import { fetch as undiciFetch } from "undici";

export const TOKEN_URI_SELECTOR = "0xc87b56dd";
export const DEFAULT_IPFS_GATEWAY = "https://ipfs.io/ipfs/";
export const DEFAULT_ARWEAVE_GATEWAY = "https://arweave.net/";

export function tokenUriCalldata(tokenId: number): string {
  if (!Number.isFinite(tokenId) || tokenId < 0) throw new Error("bad token id");
  return TOKEN_URI_SELECTOR + BigInt(tokenId).toString(16).padStart(64, "0");
}

export function chunkList<T>(items: T[], size: number): T[][] {
  if (size <= 0) return items.length ? [items] : [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function buildTokenUriBatch(address: string, tokenIds: number[]): Array<{
  jsonrpc: "2.0";
  id: number;
  method: "eth_call";
  params: [{ to: string; data: string }, "latest"];
}> {
  return tokenIds.map((tokenId, id) => ({
    jsonrpc: "2.0" as const,
    id,
    method: "eth_call" as const,
    params: [{ to: address, data: tokenUriCalldata(tokenId) }, "latest" as const],
  }));
}

export function decodeAbiString(hex: string): string | null {
  if (!hex || hex === "0x" || hex === "0X") return null;
  const h = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (!h || /^0+$/.test(h)) return null;
  if (h.length % 2) return null;
  const buf = Buffer.from(h, "hex");
  if (buf.length < 64) return null;
  const offset = Number(buf.readBigUInt64BE(24));
  if (!Number.isFinite(offset) || offset + 32 > buf.length) return null;
  const length = Number(buf.readBigUInt64BE(offset + 24));
  if (!Number.isFinite(length) || offset + 32 + length > buf.length) return null;
  return buf.subarray(offset + 32, offset + 32 + length).toString("utf8");
}

export function parseTokenUriJson(uri: string): unknown | null {
  const s = uri.trim();
  if (!s) return null;
  try {
    if (s.startsWith("data:application/json")) {
      const comma = s.indexOf(",");
      if (comma === -1) return null;
      const header = s.slice(0, comma).toLowerCase();
      const payload = s.slice(comma + 1);
      const text = header.includes(";base64") ? Buffer.from(payload, "base64").toString("utf8") : decodeURIComponent(payload);
      return JSON.parse(text);
    }
    if (s.startsWith("{")) return JSON.parse(s);
  } catch {
    return null;
  }
  return null;
}

export function resolveTokenUriUrl(
  uri: string,
  ipfsGateway = DEFAULT_IPFS_GATEWAY,
  arweaveGateway = DEFAULT_ARWEAVE_GATEWAY,
): string | null {
  const s = uri.trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("ipfs://")) {
    return `${ipfsGateway.replace(/\/$/, "")}/${s.slice("ipfs://".length).replace(/^ipfs\//, "")}`;
  }
  if (s.startsWith("ar://")) {
    return `${arweaveGateway.replace(/\/$/, "")}/${s.slice("ar://".length)}`;
  }
  return null;
}

export async function fetchTokenUriJson(
  uri: string,
  opts: {
    ipfsGateway?: string;
    arweaveGateway?: string;
    timeoutMs?: number;
    fetchFn?: (url: string, init?: any) => Promise<any>;
  } = {},
): Promise<unknown | null> {
  const inline = parseTokenUriJson(uri);
  if (inline !== null) return inline;
  const url = resolveTokenUriUrl(uri, opts.ipfsGateway, opts.arweaveGateway);
  if (!url) return null;
  const fetcher = opts.fetchFn ?? undiciFetch;
  try {
    const res = await fetcher(url, {
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
      headers: { accept: "application/json, text/plain, */*" },
    });
    if (!res.ok) return null;
    const text = await res.text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}
