import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fetch as undiciFetch } from "undici";
import { applyExplorerMetadata, itemsToIds, type SnapshotItem, type Trait } from "./dump-collections.mts";
import { buildTokenUriBatch, chunkList, decodeAbiString, fetchTokenUriJson } from "./rpc-token-uri.mts";
import {
  configureHttp,
  createPool,
  createRateGate,
  HttpStatusError,
  isRateLimitedStatus,
  parseRetryAfterMs,
  type RateGate,
} from "./snapshot-collections.mts";

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(REPO, "data/collections");
const PROGRESS_DIR = path.join(OUT_DIR, ".progress");

const DEFAULT_CONCURRENCY = 8;
const DEFAULT_BATCH = 50;
const WRITE_EVERY = 200;
const RPC_TIMEOUT_MS = 120_000;

export type ExplorerInstanceMeta = {
  name?: string;
  ethscription_id?: string;
  attributes?: unknown;
};

export type OverlayArgs = {
  only: string[];
  tokens: number[];
  force: boolean;
  concurrency: number;
  batch: number;
};

type SnapshotFile = {
  slug?: string;
  name?: string;
  address?: string;
  items?: SnapshotItem[];
  ids?: string[];
  [key: string]: unknown;
};

type OverlayProgress = { completed: number[] };

class RateLimitedError extends Error {
  constructor(status: number, pauseMs: number) {
    super(`HTTP ${status}, pausing ${Math.round(pauseMs / 1000)}s`);
    this.name = "RateLimitedError";
  }
}

export function parseOverlayArgs(argv: string[]): OverlayArgs {
  const only: string[] = [];
  const tokens: number[] = [];
  let force = false;
  let concurrency = DEFAULT_CONCURRENCY;
  let batch = DEFAULT_BATCH;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--only") only.push((argv[++i] ?? "").trim().toLowerCase());
    else if (a === "--token") {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n)) throw new Error("bad --token");
      tokens.push(n);
    } else if (a === "--force") force = true;
    else if (a === "--concurrency") concurrency = Number(argv[++i]);
    else if (a === "--batch") batch = Number(argv[++i]);
    else throw new Error(`Unknown arg: ${a}`);
  }
  if (!Number.isFinite(concurrency) || concurrency < 1) throw new Error("bad --concurrency");
  if (!Number.isFinite(batch) || batch < 1) throw new Error("bad --batch");
  return {
    only: only.filter(Boolean),
    tokens,
    force,
    concurrency: Math.floor(concurrency),
    batch: Math.floor(batch),
  };
}

export function parseInstanceMetadata(raw: string | unknown): ExplorerInstanceMeta | null {
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  const nested = obj.metadata && typeof obj.metadata === "object" ? (obj.metadata as Record<string, unknown>) : obj;
  const name = typeof nested.name === "string" ? nested.name : undefined;
  const ethscription_id =
    typeof nested.ethscription_id === "string"
      ? nested.ethscription_id
      : typeof obj.ethscription_id === "string"
        ? obj.ethscription_id
        : undefined;
  const attributes = nested.attributes ?? obj.attributes;
  if (!name && !ethscription_id && attributes == null) return null;
  return { name, ethscription_id, attributes };
}

export function compactSnapshotItem(item: SnapshotItem): SnapshotItem {
  const out: SnapshotItem = { i: item.i, id: item.id };
  if (item.n) out.n = item.n;
  if (item.a?.length) out.a = item.a;
  return out;
}

export function snapshotItemsEqual(a: SnapshotItem, b: SnapshotItem): boolean {
  return JSON.stringify(compactSnapshotItem(a)) === JSON.stringify(compactSnapshotItem(b));
}

export function overlaySnapshotItem(item: SnapshotItem, raw: string | unknown): SnapshotItem {
  const meta = parseInstanceMetadata(raw);
  if (!meta) return item;
  return compactSnapshotItem(applyExplorerMetadata(item, meta));
}

export function uniquePendingIds(
  items: Array<{ i: number }>,
  completed: Set<number>,
  wanted: Set<number> | null,
): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const it of items) {
    if (wanted && !wanted.has(it.i)) continue;
    if (completed.has(it.i) || seen.has(it.i)) continue;
    seen.add(it.i);
    out.push(it.i);
  }
  return out;
}

function loadDotenv(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const stripped = line.trim();
    if (!stripped || stripped.startsWith("#") || !stripped.includes("=")) continue;
    const eq = stripped.indexOf("=");
    const key = stripped.slice(0, eq).trim();
    let value = stripped.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

async function atomicWrite(filePath: string, text: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  const fh = await open(tmp, "w");
  try {
    await fh.writeFile(text);
    await fh.sync();
  } finally {
    await fh.close();
  }
  await rename(tmp, filePath);
}

function progressPath(slug: string) {
  return path.join(PROGRESS_DIR, `${slug}.overlay.json`);
}

function snapshotPath(slug: string) {
  return path.join(OUT_DIR, `${slug}.json`);
}

function listSnapshotSlugs(): string[] {
  if (!existsSync(OUT_DIR)) return [];
  return readdirSync(OUT_DIR)
    .filter(name => name.endsWith(".json"))
    .map(name => name.slice(0, -".json".length));
}

export function selectOverlaySlugs(slugs: string[], only: string[]): string[] {
  if (!only.length) return slugs;
  const needles = new Set(only);
  return slugs.filter(slug => needles.has(slug));
}

async function readProgress(slug: string, force: boolean): Promise<Set<number>> {
  if (force || !existsSync(progressPath(slug))) return new Set();
  try {
    const raw = JSON.parse(await readFile(progressPath(slug), "utf8")) as OverlayProgress;
    return new Set((raw.completed ?? []).filter(n => Number.isFinite(n)));
  } catch {
    return new Set();
  }
}

async function writeProgress(slug: string, completed: Set<number>) {
  await atomicWrite(progressPath(slug), JSON.stringify({ completed: [...completed].sort((a, b) => a - b) }));
}

function normalizeItems(snapshot: SnapshotFile): SnapshotItem[] {
  if (!Array.isArray(snapshot.items)) return [];
  return snapshot.items
    .filter(it => typeof it?.id === "string" && Number.isFinite(Number(it.i)))
    .map(it => compactSnapshotItem({ i: Number(it.i), id: it.id, n: it.n, a: Array.isArray(it.a) ? (it.a as Trait[]) : [] }));
}

async function writeSnapshot(filePath: string, snapshot: SnapshotFile, items: SnapshotItem[]) {
  const compact = items.map(compactSnapshotItem).sort((a, b) => a.i - b.i);
  const payload = { ...snapshot, items: compact, ids: itemsToIds(compact) };
  await atomicWrite(filePath, JSON.stringify(payload));
}

function applyMetaToItems(items: SnapshotItem[], tokenId: number, meta: ExplorerInstanceMeta): number {
  const group: number[] = [];
  for (let idx = 0; idx < items.length; idx++) {
    if (items[idx].i === tokenId) group.push(idx);
  }
  const metaId = meta.ethscription_id?.toLowerCase();
  const targets =
    group.length === 1 ? group : metaId ? group.filter(idx => items[idx].id.toLowerCase() === metaId) : group.slice(0, 1);
  let changed = 0;
  for (const idx of targets) {
    const next = overlaySnapshotItem(items[idx], meta);
    if (!snapshotItemsEqual(items[idx], next)) {
      items[idx] = next;
      changed++;
    }
  }
  return changed;
}

async function rpcBatch(rpcUrl: string, payload: unknown, gate: RateGate): Promise<unknown> {
  let transientFails = 0;
  for (;;) {
    try {
      return await gate.run(async () => {
        const res = await undiciFetch(rpcUrl, {
          method: "POST",
          headers: { "content-type": "application/json", "user-agent": "ethscriptions-snapshot/1.0" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
        });
        if (isRateLimitedStatus(res.status)) {
          const pauseMs = gate.noteLimited(parseRetryAfterMs(res.headers.get("retry-after")));
          console.log(`    rate limited HTTP ${res.status}, global pause ${Math.round(pauseMs / 1000)}s`);
          throw new RateLimitedError(res.status, pauseMs);
        }
        if (!res.ok) throw new HttpStatusError(res.status, `HTTP ${res.status} ${res.statusText}`);
        gate.noteOk();
        return await res.json();
      });
    } catch (e) {
      if (e instanceof RateLimitedError) continue;
      if (e instanceof HttpStatusError && e.status < 500) throw e;
      transientFails++;
      if (transientFails >= 8) throw e;
      const waitSec = Math.min(2 ** transientFails, 16);
      console.log(`    rpc retry ${transientFails}/8 after ${waitSec}s: ${e}`);
      await new Promise(r => setTimeout(r, waitSec * 1000));
    }
  }
}

async function fetchTokenUris(
  rpcUrl: string,
  address: string,
  tokenIds: number[],
  gate: RateGate,
): Promise<Map<number, string | null>> {
  const raw = await rpcBatch(rpcUrl, buildTokenUriBatch(address, tokenIds), gate);
  const rows = Array.isArray(raw) ? raw : [raw];
  const byId = new Map<number, { result?: unknown; error?: unknown }>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const rec = row as { id?: number; result?: unknown; error?: unknown };
    if (typeof rec.id === "number") byId.set(rec.id, rec);
  }
  const out = new Map<number, string | null>();
  tokenIds.forEach((tokenId, index) => {
    const rec = byId.get(index);
    const hex = typeof rec?.result === "string" ? rec.result : "";
    out.set(tokenId, rec?.error ? null : decodeAbiString(hex));
  });
  return out;
}

async function overlayOne(
  slug: string,
  rpcUrl: string,
  gate: RateGate,
  args: OverlayArgs,
): Promise<{ changed: number; fetched: number; skipped: number }> {
  const filePath = snapshotPath(slug);
  const snapshot = JSON.parse(await readFile(filePath, "utf8")) as SnapshotFile;
  const address = snapshot.address;
  if (!address) {
    console.log(`  ${slug}: no address, skip`);
    return { changed: 0, fetched: 0, skipped: 0 };
  }
  const items = normalizeItems(snapshot);
  const completed = await readProgress(slug, args.force);
  const wanted = args.tokens.length ? new Set(args.tokens) : null;
  const pendingIds = uniquePendingIds(items, completed, wanted);
  const writeLock = createPool(1);
  let changed = 0;
  let fetched = 0;
  let skipped = 0;
  let sinceWrite = 0;

  const persist = async () => {
    await writeLock.run(async () => {
      await writeSnapshot(filePath, snapshot, items);
      await writeProgress(slug, completed);
      sinceWrite = 0;
    });
  };

  const uniq = new Set(items.map(it => it.i));

  await Promise.all(
    chunkList(pendingIds, args.batch).map(async batch => {
      try {
        const uris = await fetchTokenUris(rpcUrl, address, batch, gate);
        for (const tokenId of batch) {
          fetched++;
          completed.add(tokenId);
          const uri = uris.get(tokenId);
          if (!uri) {
            skipped++;
            continue;
          }
          const json = await fetchTokenUriJson(uri);
          const meta = parseInstanceMetadata(json);
          if (meta) changed += applyMetaToItems(items, tokenId, meta);
          else skipped++;
        }
        sinceWrite += batch.length;
        if (sinceWrite >= WRITE_EVERY) await persist();
      } catch (e) {
        console.log(`    ${slug} batch ${batch[0]}-${batch.at(-1)}: ${e}`);
      }
    }),
  );

  await persist();
  const remaining = [...uniq].filter(i => !completed.has(i)).length;
  console.log(`  ${slug}: fetched=${fetched} changed=${changed} missing=${skipped} remaining=${remaining}`);
  return { changed, fetched, skipped };
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

async function main(argv = process.argv.slice(2)): Promise<number> {
  const args = parseOverlayArgs(argv);
  const env = {
    ...loadDotenv(path.join(REPO, ".env")),
    ...loadDotenv(path.join(REPO, ".env.local")),
  };
  for (const [k, v] of Object.entries(env)) {
    if (!process.env[k]) process.env[k] = v;
  }
  const rpcUrl = (process.env.ETHSCRIPTIONS_MAINNET_RPC_URL || env.ETHSCRIPTIONS_MAINNET_RPC_URL || "").replace(
    /\/$/,
    "",
  );
  if (!rpcUrl) {
    console.error("ETHSCRIPTIONS_MAINNET_RPC_URL is not set");
    return 1;
  }

  const slugs = selectOverlaySlugs(listSnapshotSlugs(), args.only).sort(
    (a, b) => statSync(snapshotPath(a)).size - statSync(snapshotPath(b)).size,
  );
  if (!slugs.length) {
    console.error("no snapshot collections matched");
    return 1;
  }

  await mkdir(PROGRESS_DIR, { recursive: true });
  configureHttp(args.concurrency);
  const gate = createRateGate(args.concurrency);
  console.log(
    `Overlaying ${slugs.length} collection(s) via RPC ${rpcUrl} concurrency=${args.concurrency} batch=${args.batch}`,
  );

  let failed = 0;
  for (const slug of slugs) {
    try {
      await overlayOne(slug, rpcUrl, gate, args);
    } catch (e) {
      failed++;
      console.log(`  ${slug}: FAILED: ${e}`);
    }
  }
  return failed ? 1 : 0;
}

if (isDirectRun()) {
  main().then(
    code => process.exit(code),
    err => {
      console.error(err);
      process.exit(1);
    },
  );
}
