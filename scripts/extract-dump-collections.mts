import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rename, open } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fetch as undiciFetch } from "undici";
import { withApiKey } from "./snapshot-collections.mts";
import {
  SKIP_DUMP_SLUGS,
  itemsToIds,
  mergeExtraIds,
  parseCollectionItemRow,
  siteSlugFromDump,
  splitCopyRow,
  unescapeCopyField,
  type SnapshotItem,
} from "./dump-collections.mts";

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX_PATH = path.join(REPO, "data/collections.json");
const OUT_DIR = path.join(REPO, "data/collections");
const DEFAULT_DUMP = path.join(REPO, "eth-script-indexer-2026-01-18.dump");

type IndexEntry = {
  name: string;
  address?: string;
  slug?: string;
  image?: string;
  type?: string;
  holders?: string;
};

type DumpCollection = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  twitter: string | null;
  discord: string | null;
  website: string | null;
};

type ExplorerToken = {
  symbol: string | null;
  type: string | null;
  holders: number | null;
  transfers: number | null;
  totalSupply: number | null;
};

function parseArgs(argv: string[]) {
  let dump = DEFAULT_DUMP;
  let explorer = "";
  let skipExplorer = false;
  const only: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dump") dump = argv[++i] ?? dump;
    else if (a === "--explorer") explorer = argv[++i] ?? "";
    else if (a === "--skip-explorer") skipExplorer = true;
    else if (a === "--only") only.push(argv[++i] ?? "");
    else throw new Error(`Unknown arg: ${a}`);
  }
  return { dump, explorer, skipExplorer, only: only.map(s => s.trim().toLowerCase()).filter(Boolean) };
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

function pgRestoreCopy(dump: string, table: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("pg_restore", ["-a", "-t", table, "-f", "-", dump], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    proc.stdout.setEncoding("utf8");
    proc.stdout.on("data", chunk => {
      out += chunk;
    });
    proc.stderr.setEncoding("utf8");
    proc.stderr.on("data", chunk => {
      err += chunk;
    });
    proc.on("error", reject);
    proc.on("close", code => {
      if (code !== 0) reject(new Error(`pg_restore ${table} exited ${code}: ${err}`));
      else resolve(out);
    });
  });
}

function parseCollectionsCopy(text: string): DumpCollection[] {
  const out: DumpCollection[] = [];
  let inCopy = false;
  for (const line of text.split("\n")) {
    if (line.startsWith("COPY ")) {
      inCopy = true;
      continue;
    }
    if (!inCopy) continue;
    if (line === "\\.") break;
    const fields = splitCopyRow(line, 14);
    if (!fields) continue;
    const dumpSlug = unescapeCopyField(fields[5]);
    const name = unescapeCopyField(fields[1]);
    const id = unescapeCopyField(fields[0]);
    if (!dumpSlug || !name || !id) continue;
    out.push({
      id,
      name,
      slug: siteSlugFromDump(dumpSlug),
      description: unescapeCopyField(fields[6]),
      twitter: unescapeCopyField(fields[7]),
      discord: unescapeCopyField(fields[8]),
      website: unescapeCopyField(fields[9]),
    });
  }
  return out;
}

async function streamCollectionItems(
  dump: string,
  byId: Map<string, SnapshotItem[]>,
  skipIds: Set<string>,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn("pg_restore", ["-a", "-t", "collection_items", "-f", "-", dump], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const rl = createInterface({ input: proc.stdout });
    let inCopy = false;
    rl.on("line", line => {
      if (line.startsWith("COPY ")) {
        inCopy = true;
        return;
      }
      if (!inCopy) return;
      if (line === "\\.") return;
      const parsed = parseCollectionItemRow(line);
      if (!parsed || skipIds.has(parsed.collectionId)) return;
      let list = byId.get(parsed.collectionId);
      if (!list) {
        list = [];
        byId.set(parsed.collectionId, list);
      }
      list.push(parsed.item);
    });
    proc.stderr.resume();
    proc.on("error", reject);
    proc.on("close", code => {
      rl.close();
      if (code && code !== 0) reject(new Error(`pg_restore collection_items exited ${code}`));
      else resolve();
    });
  });
}

function existingIds(slug: string): string[] {
  const filePath = path.join(OUT_DIR, `${slug}.json`);
  if (!existsSync(filePath)) return [];
  try {
    const data = JSON.parse(readFileSync(filePath, "utf8"));
    if (Array.isArray(data.items) && data.items.length) return [];
    if (Array.isArray(data.ids)) return data.ids;
  } catch {
    return [];
  }
  return [];
}

async function fetchExplorerToken(explorer: string, address: string): Promise<ExplorerToken> {
  const empty: ExplorerToken = { symbol: null, type: null, holders: null, transfers: null, totalSupply: null };
  const base = explorer.replace(/\/$/, "");
  try {
    const tokenRes = await undiciFetch(withApiKey(`${base}/api/v2/tokens/${address}`, process.env.EXPLORER_API_KEY || ""), {
      headers: { "user-agent": "ethscriptions-snapshot/1.0" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!tokenRes.ok) return empty;
    const token = (await tokenRes.json()) as {
      symbol?: string;
      type?: string;
      holders_count?: string;
      total_supply?: string;
    };
    let transfers: number | null = null;
    try {
      const cRes = await undiciFetch(withApiKey(`${base}/api/v2/tokens/${address}/counters`, process.env.EXPLORER_API_KEY || ""), {
        headers: { "user-agent": "ethscriptions-snapshot/1.0" },
        signal: AbortSignal.timeout(30_000),
      });
      if (cRes.ok) {
        const c = (await cRes.json()) as { transfers_count?: string };
        const n = Number(c.transfers_count);
        if (Number.isFinite(n)) transfers = n;
      }
    } catch {}
    const holders = Number(token.holders_count);
    const supply = Number(token.total_supply);
    return {
      symbol: token.symbol || null,
      type: token.type || null,
      holders: Number.isFinite(holders) ? holders : null,
      transfers,
      totalSupply: Number.isFinite(supply) && supply < 1e12 ? supply : null,
    };
  } catch {
    return empty;
  }
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!existsSync(args.dump)) {
    console.error(`dump not found: ${args.dump}`);
    return 1;
  }
  const env = {
    ...loadDotenv(path.join(REPO, ".env")),
    ...loadDotenv(path.join(REPO, ".env.local")),
  };
  for (const [k, v] of Object.entries(env)) {
    if (!process.env[k]) process.env[k] = v;
  }
  const explorer =
    args.explorer ||
    process.env.NEXT_PUBLIC_EXPLORER_BASE_URI ||
    env.NEXT_PUBLIC_EXPLORER_BASE_URI ||
    "";

  const index: IndexEntry[] = JSON.parse(await readFile(INDEX_PATH, "utf8"));
  const indexBySlug = new Map(index.map(c => [c.slug || c.name.toLowerCase(), c]));

  console.log(`Reading collections from ${args.dump}`);
  const dumpCols = parseCollectionsCopy(await pgRestoreCopy(args.dump, "collections"));
  const selected = dumpCols.filter(c => {
    if (SKIP_DUMP_SLUGS.has(c.slug)) return false;
    if (args.only.length && !args.only.includes(c.slug) && !args.only.includes(c.name.toLowerCase())) return false;
    return true;
  });
  const skipIds = new Set(dumpCols.filter(c => SKIP_DUMP_SLUGS.has(c.slug)).map(c => c.id));
  for (const c of dumpCols.filter(c => SKIP_DUMP_SLUGS.has(c.slug))) console.log(`  skip ${c.slug}`);

  const itemsByCollectionId = new Map<string, SnapshotItem[]>();
  console.log("Streaming collection_items…");
  await streamCollectionItems(args.dump, itemsByCollectionId, skipIds);

  await mkdir(OUT_DIR, { recursive: true });

  for (const col of selected) {
    const entry = indexBySlug.get(col.slug);
    let items = itemsByCollectionId.get(col.id) ?? [];
    items = mergeExtraIds(items, existingIds(col.slug));
    items.sort((a, b) => a.i - b.i);
    const ids = itemsToIds(items);
    let explorerInfo: ExplorerToken = {
      symbol: null,
      type: entry?.type || null,
      holders: entry?.holders ? Number(entry.holders) : null,
      transfers: null,
      totalSupply: null,
    };
    if (!args.skipExplorer && explorer && entry?.address) {
      explorerInfo = await fetchExplorerToken(explorer, entry.address);
      console.log(
        `  ${col.slug}: explorer type=${explorerInfo.type} holders=${explorerInfo.holders} transfers=${explorerInfo.transfers}`,
      );
    }
    const payload = {
      slug: col.slug,
      name: entry?.name || col.name,
      address: entry?.address,
      symbol: explorerInfo.symbol,
      type: explorerInfo.type || entry?.type || null,
      description: col.description,
      twitter: col.twitter,
      discord: col.discord,
      website: col.website,
      holders: explorerInfo.holders,
      transfers: explorerInfo.transfers,
      items,
      ids,
    };
    const outPath = path.join(OUT_DIR, `${col.slug}.json`);
    await atomicWrite(outPath, JSON.stringify(payload));
    console.log(`  ${col.name}: wrote ${items.length} items → ${outPath}`);
  }
  return 0;
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
