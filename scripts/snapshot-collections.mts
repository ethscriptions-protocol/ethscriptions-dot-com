import { existsSync, readFileSync } from "node:fs";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Agent, fetch as undiciFetch, setGlobalDispatcher } from "undici";

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX_PATH = path.join(REPO, "data/collections.json");
const OUT_DIR = path.join(REPO, "data/collections");
const PROGRESS_DIR = path.join(OUT_DIR, ".progress");

const ETHSCRIPTION_ITEM_RE_SOURCE = '"id"\\s*:\\s*"(\\d+)"[\\s\\S]*?"ethscription_id"\\s*:\\s*"(0x[0-9a-fA-F]{64})"';

const DEFAULT_CONCURRENCY = 8;
const HTTP_TIMEOUT_MS = 120_000;
const RATE_LIMIT_BACKOFF_CAP_MS = 120_000;

export type PageItem = { tokenId: string; ethscriptionId: string };
export type PageParams = Record<string, string | number>;
export type ParsedPage = { items: PageItem[]; nextPageParams: PageParams | null };

type Collection = {
  name: string;
  address?: string;
  slug?: string;
  supply?: string;
  holders?: string;
  image?: string;
  type?: string;
};

type ProgressRecord = {
  cursor: number | null;
  items: PageItem[];
  nextPageParams?: PageParams | null;
};

type Pool = { run: <T>(fn: () => Promise<T>) => Promise<T> };

export type RateGate = {
  run: <T>(fn: () => Promise<T>) => Promise<T>;
  noteLimited: (retryAfterMs: number | null) => number;
  noteOk: () => void;
  snapshot: () => { limit: number; hits: number; pauseUntil: number };
};

type Clock = {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
};

class RateLimitedError extends Error {
  constructor(status: number, pauseMs: number) {
    super(`HTTP ${status}, pausing ${Math.round(pauseMs / 1000)}s`);
    this.name = "RateLimitedError";
  }
}

export class HttpStatusError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpStatusError";
    this.status = status;
  }
}

export function isServerErrorStatus(status: number): boolean {
  return status >= 500 && status < 600;
}

export function isServerError(e: unknown): boolean {
  return e instanceof HttpStatusError && isServerErrorStatus(e.status);
}

export function alternateCursors(failedCursor: number, pageSize: number): number[] {
  if (pageSize <= 1 || failedCursor <= 1) return [];
  const min = Math.max(1, failedCursor - pageSize + 1);
  const out: number[] = [];
  for (let t = failedCursor - 1; t >= min; t--) out.push(t);
  return out;
}

export async function recoverFromServerError<T>(
  failedCursor: number,
  pageSize: number,
  tryCursor: (cursor: number) => Promise<T>,
  isPoison: (e: unknown) => boolean,
): Promise<{ cursor: number; value: T } | null> {
  for (const cursor of alternateCursors(failedCursor, pageSize)) {
    try {
      return { cursor, value: await tryCursor(cursor) };
    } catch (e) {
      if (isPoison(e)) continue;
      throw e;
    }
  }
  return null;
}

type Args = {
  only: string[];
  force: boolean;
  concurrency: number;
  maxPages: number | null;
};

export function slugify(name: string): string {
  const s = name.trim().toLowerCase().replaceAll("&", " and ").replaceAll("'", "");
  return s.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function isConsecutiveDescending(tokenIds: number[]): boolean {
  for (let i = 1; i < tokenIds.length; i++) {
    if (tokenIds[i] !== tokenIds[i - 1] - 1) return false;
  }
  return true;
}

export function remainingCursors(lastTokenId: number, pageSize: number): number[] {
  if (pageSize <= 0 || lastTokenId <= 0) return [];
  const out: number[] = [];
  for (let t = lastTokenId; t > 0; t -= pageSize) out.push(t);
  return out;
}

function sliceBalanced(source: string): string {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (inString) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) return source.slice(0, i + 1);
    }
  }
  throw new Error("unterminated JSON value");
}

function parseJsonValue(source: string): unknown {
  const s = source.trimStart();
  if (s.startsWith("null")) return null;
  if (s[0] === "{" || s[0] === "[") return JSON.parse(sliceBalanced(s));
  throw new Error(`unexpected JSON value: ${s.slice(0, 48)}`);
}

export function parseInstancesPage(raw: string): ParsedPage {
  const itemRe = new RegExp(ETHSCRIPTION_ITEM_RE_SOURCE, "gi");
  const items: PageItem[] = [];
  for (const match of raw.matchAll(itemRe)) {
    items.push({ tokenId: match[1], ethscriptionId: match[2].toLowerCase() });
  }
  const key = '"next_page_params"';
  const idx = raw.lastIndexOf(key);
  if (idx === -1) return { items, nextPageParams: null };
  const colon = raw.indexOf(":", idx + key.length);
  if (colon === -1) return { items, nextPageParams: null };
  const val = parseJsonValue(raw.slice(colon + 1));
  if (val === null || typeof val !== "object" || Array.isArray(val)) {
    return { items, nextPageParams: null };
  }
  return { items, nextPageParams: val as PageParams };
}

export function instanceUrl(explorerBase: string, address: string, tokenId: number | string): string {
  return `${explorerBase.replace(/\/$/, "")}/api/v2/tokens/${address}/instances/${tokenId}`;
}

export function withApiKey(url: string, apiKey: string): string {
  if (!apiKey) return url;
  const u = new URL(url);
  u.searchParams.set("api_key", apiKey);
  return u.toString();
}

export function instancesUrl(explorerBase: string, address: string, nextPageParams: PageParams | null): string {
  const url = `${explorerBase.replace(/\/$/, "")}/api/v2/tokens/${address}/instances`;
  if (!nextPageParams) return url;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(nextPageParams)) {
    if (v === undefined || v === null) continue;
    qs.set(k, String(v));
  }
  const encoded = qs.toString();
  return encoded ? `${url}?${encoded}` : url;
}

export function createPool(limit: number): Pool {
  let active = 0;
  const waiting: Array<() => void> = [];
  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      if (active >= limit) await new Promise<void>(resolve => waiting.push(resolve));
      active++;
      try {
        return await fn();
      } finally {
        active--;
        waiting.shift()?.();
      }
    },
  };
}

const HTTP_MAX_ATTEMPTS = 12;
const SERVER_ERROR_ATTEMPTS = 1;

export function isRateLimitedStatus(status: number): boolean {
  return status === 403 || status === 429;
}

export function parseRetryAfterMs(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.max(0, Number(trimmed) * 1000);
  const date = Date.parse(trimmed);
  if (!Number.isFinite(date)) return null;
  return Math.max(0, date - now);
}

export function nextBackoffMs(hits: number, jitterMs = Math.floor(Math.random() * 1000)): number {
  const base = Math.min(5_000 * 2 ** Math.max(0, hits - 1), RATE_LIMIT_BACKOFF_CAP_MS);
  return base + jitterMs;
}

export function createRateGate(maxConcurrency: number, clock: Partial<Clock> = {}): RateGate {
  const now = clock.now ?? Date.now;
  const sleep = clock.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  let limit = maxConcurrency;
  let active = 0;
  const waiting: Array<() => void> = [];
  let pauseUntil = 0;
  let hits = 0;

  async function acquire() {
    for (;;) {
      const wait = pauseUntil - now();
      if (wait > 0) {
        await sleep(wait);
        continue;
      }
      if (active < limit) {
        active++;
        return;
      }
      await new Promise<void>(resolve => waiting.push(resolve));
    }
  }

  function release() {
    active--;
    waiting.shift()?.();
  }

  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await fn();
      } finally {
        release();
      }
    },
    noteLimited(retryAfterMs) {
      hits++;
      const ms = retryAfterMs && retryAfterMs > 0 ? retryAfterMs : nextBackoffMs(hits);
      pauseUntil = Math.max(pauseUntil, now() + ms);
      limit = 1;
      return ms;
    },
    noteOk() {
      hits = 0;
      if (limit < maxConcurrency) limit++;
      waiting.shift()?.();
    },
    snapshot() {
      return { limit, hits, pauseUntil };
    },
  };
}

export function parseArgs(argv: string[]): Args {
  const only: string[] = [];
  let force = false;
  let concurrency = DEFAULT_CONCURRENCY;
  let maxPages: number | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--only") only.push(argv[++i] ?? "");
    else if (a === "--force") force = true;
    else if (a === "--concurrency") concurrency = Number(argv[++i]);
    else if (a === "--max-pages") maxPages = Number(argv[++i]);
    else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown arg: ${a}`);
    }
  }
  if (!Number.isFinite(concurrency) || concurrency < 1) throw new Error("bad --concurrency");
  if (maxPages !== null && (!Number.isFinite(maxPages) || maxPages < 1)) throw new Error("bad --max-pages");
  return { only, force, concurrency: Math.floor(concurrency), maxPages: maxPages && Math.floor(maxPages) };
}

function printHelp() {
  console.log(`Snapshot collection ethscription IDs from BlockScout NFT instances.

ERC-404 is treated as ERC-721. Pages are fetched in parallel via unique_token
random access (id < cursor). Collections share one HTTP pool.

  node scripts/snapshot-collections.mts
  node scripts/snapshot-collections.mts --only blocks
  node scripts/snapshot-collections.mts --concurrency 128 --force --only mfpurrs

  --only NAME          Exact slug or collection name; repeatable
  --force              Redo even if output exists
  --concurrency N      Max parallel HTTP requests (default ${DEFAULT_CONCURRENCY}; drops to 1 on 403/429)
  --max-pages N        Max pages fetched per collection this run

Persistent HTTP 5xx on a unique_token page is not retried forever. The script
probes lower cursors in that page, then skips the window and continues.
`);
}

function loadDotenv(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSyncUtf8(filePath).split("\n")) {
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

function readFileSyncUtf8(filePath: string): string {
  return readFileSync(filePath, "utf8");
}

function progressPath(slug: string): string {
  return path.join(PROGRESS_DIR, `${slug}.jsonl`);
}

function legacyProgressPath(slug: string): string {
  return path.join(PROGRESS_DIR, `${slug}.json`);
}

function outputPath(slug: string): string {
  return path.join(OUT_DIR, `${slug}.json`);
}

function cursorKey(cursor: number | null): string {
  return cursor === null ? "first" : String(cursor);
}

async function atomicWrite(filePath: string, text: string): Promise<void> {
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

const progressLocks = new Map<string, Pool>();
const recoverLock = createPool(1);

function lockFor(slug: string): Pool {
  let pool = progressLocks.get(slug);
  if (!pool) {
    pool = createPool(1);
    progressLocks.set(slug, pool);
  }
  return pool;
}

async function appendProgress(
  slug: string,
  cursor: number | null,
  items: PageItem[],
  nextPageParams: PageParams | null = null,
): Promise<void> {
  await mkdir(PROGRESS_DIR, { recursive: true });
  const rec = JSON.stringify({ cursor, items, nextPageParams } satisfies ProgressRecord) + "\n";
  await lockFor(slug).run(async () => {
    const fh = await open(progressPath(slug), "a");
    try {
      await fh.writeFile(rec);
      await fh.sync();
    } finally {
      await fh.close();
    }
  });
}

async function clearProgress(slug: string): Promise<void> {
  for (const p of [progressPath(slug), legacyProgressPath(slug)]) {
    if (existsSync(p)) await unlink(p);
  }
}

function hasProgress(slug: string): boolean {
  return existsSync(progressPath(slug)) || existsSync(legacyProgressPath(slug));
}

function loadProgress(slug: string): {
  items: PageItem[];
  done: Set<string>;
  firstPage: PageItem[] | null;
  firstNext: PageParams | null;
} | null {
  const filePath = progressPath(slug);
  if (!existsSync(filePath)) return null;
  const items: PageItem[] = [];
  const done = new Set<string>();
  let firstPage: PageItem[] | null = null;
  let firstNext: PageParams | null = null;
  for (const line of readFileSyncUtf8(filePath).split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let rec: ProgressRecord;
    try {
      rec = JSON.parse(trimmed);
    } catch {
      break;
    }
    if (!("cursor" in rec) || !Array.isArray(rec.items)) return null;
    items.push(...rec.items);
    done.add(cursorKey(rec.cursor));
    if (rec.cursor === null) {
      firstPage = rec.items;
      firstNext = rec.nextPageParams ?? null;
    }
  }
  if (items.length === 0 && done.size === 0) return null;
  return { items, done, firstPage, firstNext };
}

export function matchesOnly(collection: Collection, slug: string, only: string[]): boolean {
  if (only.length === 0) return true;
  const name = collection.name.toLowerCase();
  return only.some(raw => {
    const needle = raw.trim().toLowerCase();
    if (!needle) return false;
    return slug === needle || name === needle || slug === slugify(raw);
  });
}

export function configureHttp(concurrency: number) {
  setGlobalDispatcher(
    new Agent({
      connections: concurrency,
      pipelining: 1,
      keepAliveTimeout: 30_000,
      keepAliveMaxTimeout: 60_000,
    }),
  );
}

export type HttpGetOptions = {
  maxAttempts?: number;
  serverErrorAttempts?: number;
};

export async function httpGet(url: string, gate: RateGate, opts: HttpGetOptions = {}): Promise<string> {
  const maxAttempts = opts.maxAttempts ?? HTTP_MAX_ATTEMPTS;
  const serverErrorAttempts = opts.serverErrorAttempts ?? SERVER_ERROR_ATTEMPTS;
  let transientFails = 0;
  let serverFails = 0;
  for (;;) {
    try {
      return await gate.run(async () => {
        const res = await undiciFetch(withApiKey(url, process.env.EXPLORER_API_KEY || ""), {
          headers: { "user-agent": "ethscriptions-snapshot/1.0" },
          signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
        });
        if (isRateLimitedStatus(res.status)) {
          const pauseMs = gate.noteLimited(parseRetryAfterMs(res.headers.get("retry-after")));
          console.log(
            `    rate limited HTTP ${res.status}, global pause ${Math.round(pauseMs / 1000)}s, concurrency=1`,
          );
          throw new RateLimitedError(res.status, pauseMs);
        }
        if (!res.ok) throw new HttpStatusError(res.status, `HTTP ${res.status} ${res.statusText}`);
        gate.noteOk();
        return await res.text();
      });
    } catch (e) {
      if (e instanceof RateLimitedError) continue;
      if (e instanceof HttpStatusError && !isServerError(e)) throw e;
      if (isServerError(e)) {
        serverFails++;
        if (serverFails >= serverErrorAttempts) throw e;
        const waitSec = Math.min(2 ** (serverFails - 1), 4);
        console.log(`    retry ${serverFails}/${serverErrorAttempts} after ${waitSec}s: ${e}`);
        await new Promise(r => setTimeout(r, (waitSec + Math.random()) * 1000));
        continue;
      }
      transientFails++;
      if (transientFails >= maxAttempts) throw e;
      const waitSec = Math.min(2 ** (transientFails - 1), 30);
      console.log(`    retry ${transientFails}/${maxAttempts} after ${waitSec}s: ${e}`);
      await new Promise(r => setTimeout(r, (waitSec + Math.random()) * 1000));
    }
  }
}

function sortAndDedupe(items: PageItem[]): string[] {
  const byToken = new Map<number, string>();
  for (const item of items) {
    const n = Number(item.tokenId);
    if (!Number.isFinite(n)) continue;
    if (!byToken.has(n)) byToken.set(n, item.ethscriptionId);
  }
  return [...byToken.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, id]) => id);
}

async function writeOutput(collection: Collection, slug: string, items: PageItem[]): Promise<string[]> {
  const ids = sortAndDedupe(items);
  const payload = {
    slug,
    name: collection.name,
    address: collection.address,
    ids,
  };
  await atomicWrite(outputPath(slug), JSON.stringify(payload));
  console.log(`  ${collection.name}: wrote ${ids.length} ids → ${outputPath(slug)}`);
  return ids;
}

async function snapshotOne(
  collection: Collection,
  explorerBase: string,
  gate: RateGate,
  args: Args,
  collections: Collection[],
  indexLock: Pool,
): Promise<{ count: number; complete: boolean }> {
  const address = collection.address;
  const name = collection.name;
  const slug = slugify(name);
  const out = outputPath(slug);
  if (!address) {
    console.log(`  ${name}: skip, no address`);
    return { count: 0, complete: false };
  }

  if (args.force) {
    if (existsSync(out)) await unlink(out);
    await clearProgress(slug);
  }

  if (existsSync(out) && !hasProgress(slug) && !args.force) {
    const existing = JSON.parse(await readFile(out, "utf8"));
    const n = Array.isArray(existing.ids) ? existing.ids.length : 0;
    console.log(`  ${name}: skip, ${n} ids already at ${out}`);
    return { count: n, complete: true };
  }

  const progress = args.force ? null : loadProgress(slug);
  if (!args.force && !progress && hasProgress(slug)) await clearProgress(slug);
  const items: PageItem[] = progress ? [...progress.items] : [];
  const done = progress ? new Set(progress.done) : new Set<string>();
  if (progress) console.log(`  ${name}: resume at ${items.length} ids, ${done.size} page(s)`);

  let fetchedThisRun = 0;
  let pageSize = 50;

  async function fetchParsed(cursor: number | null, httpOpts?: HttpGetOptions): Promise<ParsedPage> {
    const params = cursor === null ? null : { unique_token: cursor };
    const raw = await httpGet(instancesUrl(explorerBase, address, params), gate, httpOpts);
    return parseInstancesPage(raw);
  }

  async function fetchPage(cursor: number | null): Promise<ParsedPage> {
    let parsed: ParsedPage;
    try {
      parsed = await fetchParsed(cursor);
    } catch (e) {
      if (cursor === null || !isServerError(e)) throw e;
      const recovered = await recoverLock.run(() =>
        recoverFromServerError(
          cursor,
          pageSize,
          alt => fetchParsed(alt, { maxAttempts: 1, serverErrorAttempts: 1 }),
          isServerError,
        ),
      );
      if (recovered) {
        console.log(
          `  ${name}: unique_token=${cursor} HTTP ${(e as HttpStatusError).status}, used ${recovered.cursor} instead`,
        );
        parsed = recovered.value;
      } else {
        const next = cursor - pageSize;
        console.log(`  ${name}: skip unique_token=${cursor}, persistent HTTP ${(e as HttpStatusError).status}`);
        parsed = { items: [], nextPageParams: next > 0 ? { unique_token: next } : null };
      }
    }
    await appendProgress(slug, cursor, parsed.items, parsed.nextPageParams);
    done.add(cursorKey(cursor));
    fetchedThisRun++;
    console.log(`  ${name}: cursor=${cursor === null ? "first" : cursor} +${parsed.items.length}`);
    return parsed;
  }

  let firstPage = progress?.firstPage ?? null;
  let nextAfterFirst = progress?.firstNext ?? null;

  if (!done.has(cursorKey(null))) {
    if (args.maxPages !== null && fetchedThisRun >= args.maxPages) {
      console.log(`  ${name}: hit --max-pages ${args.maxPages} with ${items.length} ids`);
      return { count: items.length, complete: false };
    }
    const parsed = await fetchPage(null);
    items.push(...parsed.items);
    firstPage = parsed.items;
    nextAfterFirst = parsed.nextPageParams;
  }

  const planIds = (firstPage ?? []).map(i => Number(i.tokenId));
  const consecutive = isConsecutiveDescending(planIds);
  pageSize = planIds.length || pageSize;
  const lastTokenId = planIds.length ? planIds[planIds.length - 1] : 0;

  if (consecutive && pageSize > 0 && lastTokenId > 0) {
    let cursors = remainingCursors(lastTokenId, pageSize).filter(c => !done.has(cursorKey(c)));
    if (args.maxPages !== null) {
      cursors = cursors.slice(0, Math.max(0, args.maxPages - fetchedThisRun));
    }
    const pages = await Promise.all(cursors.map(cursor => fetchPage(cursor)));
    for (const page of pages) items.push(...page.items);
    const stillDue = remainingCursors(lastTokenId, pageSize).some(c => !done.has(cursorKey(c)));
    if (stillDue) {
      console.log(`  ${name}: incomplete (${items.length} ids so far)`);
      return { count: items.length, complete: false };
    }
  } else {
    if (!consecutive) console.log(`  ${name}: non-contiguous ids, sequential walk`);
    let nxt = nextAfterFirst;
    while (nxt) {
      if (args.maxPages !== null && fetchedThisRun >= args.maxPages) {
        console.log(`  ${name}: hit --max-pages ${args.maxPages} with ${items.length} ids`);
        return { count: items.length, complete: false };
      }
      const cursor = Number(nxt.unique_token);
      if (!Number.isFinite(cursor)) break;
      if (done.has(cursorKey(cursor))) {
        nxt = parsedNextFromDone(cursor, pageSize);
        continue;
      }
      const parsed = await fetchPage(cursor);
      items.push(...parsed.items);
      nxt = parsed.nextPageParams;
    }
  }

  const ids = await writeOutput(collection, slug, items);
  await clearProgress(slug);
  await indexLock.run(async () => {
    collection.slug = slug;
    collection.supply = String(ids.length);
    await atomicWrite(INDEX_PATH, JSON.stringify(collections, null, 2) + "\n");
  });
  return { count: ids.length, complete: true };
}

function parsedNextFromDone(cursor: number, pageSize: number): PageParams | null {
  const next = cursor - (pageSize || 50);
  if (next <= 0) return null;
  return { unique_token: next };
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

async function main(argv = process.argv.slice(2)): Promise<number> {
  const args = parseArgs(argv);
  const env = {
    ...loadDotenv(path.join(REPO, ".env")),
    ...loadDotenv(path.join(REPO, ".env.local")),
  };
  for (const [k, v] of Object.entries(env)) {
    if (!process.env[k]) process.env[k] = v;
  }
  const explorer = (process.env.NEXT_PUBLIC_EXPLORER_BASE_URI || env.NEXT_PUBLIC_EXPLORER_BASE_URI || "").replace(
    /\/$/,
    "",
  );
  if (!explorer) {
    console.error("NEXT_PUBLIC_EXPLORER_BASE_URI is not set");
    return 1;
  }

  const collections: Collection[] = JSON.parse(await readFile(INDEX_PATH, "utf8"));
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(PROGRESS_DIR, { recursive: true });

  configureHttp(args.concurrency);
  const gate = createRateGate(args.concurrency);
  const indexLock = createPool(1);

  const selected = collections.filter(c => matchesOnly(c, slugify(c.name), args.only));
  console.log(`Snapshotting ${selected.length} collection(s) with concurrency=${args.concurrency}`);

  const results = await Promise.all(
    selected.map(async collection => {
      try {
        const result = await snapshotOne(collection, explorer, gate, args, collections, indexLock);
        return { name: collection.name, ...result, error: null as string | null };
      } catch (e) {
        console.log(`  ${collection.name}: FAILED: ${e}`);
        return { name: collection.name, count: 0, complete: false, error: String(e) };
      }
    }),
  );

  const completeN = results.filter(r => r.complete && !r.error).length;
  const failed = results.filter(r => r.error);
  console.log(`\nFinished ${completeN} collection(s); ${failed.length} failed`);
  for (const f of failed) console.log(`  ${f.name}: ${f.error}`);
  return failed.length ? 1 : 0;
}

if (isDirectRun()) {
  main().then(code => process.exit(code), err => {
    console.error(err);
    process.exit(1);
  });
}

