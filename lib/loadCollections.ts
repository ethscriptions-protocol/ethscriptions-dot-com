import type {
  CollectionHit,
  CollectionIndexEntry,
  CollectionItemRecord,
  CollectionPageData,
  CollectionTokenPageData,
  CollectionTrait,
} from "./collections";
import { type CollectionListItem, collectionSlug, selectDownloadedCollections } from "./collections";
import fs from "fs";
import path from "path";

const INDEX_PATH = path.join(process.cwd(), "data", "collections.json");
const SNAPSHOT_DIR = path.join(process.cwd(), "data", "collections");

type SnapshotFile = {
  slug?: string;
  name?: string;
  address?: string;
  symbol?: string | null;
  type?: string | null;
  description?: string | null;
  twitter?: string | null;
  discord?: string | null;
  website?: string | null;
  holders?: number | null;
  transfers?: number | null;
  ids?: string[];
  items?: Array<{ i?: number; id?: string; n?: string; a?: CollectionTrait[] }>;
};

function downloadedSlugs(): Set<string> {
  if (!fs.existsSync(SNAPSHOT_DIR)) return new Set();
  return new Set(
    fs
      .readdirSync(SNAPSHOT_DIR)
      .filter(name => name.endsWith(".json"))
      .map(name => name.slice(0, -".json".length)),
  );
}

function readIndex(): CollectionIndexEntry[] {
  return JSON.parse(fs.readFileSync(INDEX_PATH, "utf8"));
}

function readSnapshot(slug: string): SnapshotFile | null {
  const snapshotPath = path.join(SNAPSHOT_DIR, `${slug}.json`);
  if (!fs.existsSync(snapshotPath)) return null;
  return JSON.parse(fs.readFileSync(snapshotPath, "utf8")) as SnapshotFile;
}

function snapshotItems(snapshot: SnapshotFile): CollectionItemRecord[] {
  if (Array.isArray(snapshot.items) && snapshot.items.length) {
    return snapshot.items
      .filter(it => typeof it.id === "string" && Number.isFinite(Number(it.i)))
      .map(it => ({
        i: Number(it.i),
        id: it.id as string,
        n: it.n ?? null,
        a: Array.isArray(it.a) ? it.a : [],
      }))
      .sort((a, b) => a.i - b.i);
  }
  const ids = Array.isArray(snapshot.ids) ? snapshot.ids : [];
  return ids.map((id, i) => ({ i, id, n: null, a: [] }));
}

export function listDownloadedCollections(): CollectionListItem[] {
  return selectDownloadedCollections(readIndex(), downloadedSlugs()).map(item => {
    const page = loadCollectionPage(item.slug);
    return page ? { ...item, supply: page.supply, holders: page.holders ?? item.holders } : item;
  });
}

export function loadCollectionPage(slug: string): CollectionPageData | null {
  const snapshot = readSnapshot(slug);
  if (!snapshot) return null;
  const records = snapshotItems(snapshot);
  const entry = readIndex().find(c => collectionSlug(c) === slug);
  return {
    name: snapshot.name || entry?.name || slug,
    slug,
    image: entry?.image || null,
    symbol: snapshot.symbol ?? null,
    type: snapshot.type ?? entry?.type ?? null,
    supply: records.length,
    holders: snapshot.holders ?? null,
    transfers: snapshot.transfers ?? null,
    description: snapshot.description || null,
    twitter: snapshot.twitter || null,
    discord: snapshot.discord || null,
    website: snapshot.website || null,
    items: records.map(({ i, id, n }) => ({ i, id, n })),
  };
}

export function loadCollectionToken(slug: string, tokenId: string): CollectionTokenPageData | null {
  const snapshot = readSnapshot(slug);
  if (!snapshot) return null;
  const i = Number(tokenId);
  if (!Number.isFinite(i)) return null;
  const records = snapshotItems(snapshot);
  const item = records.find(it => it.i === i);
  if (!item) return null;
  const page = loadCollectionPage(slug);
  if (!page) return null;
  return {
    name: page.name,
    slug,
    image: page.image,
    symbol: page.symbol,
    type: page.type,
    item,
  };
}

let hitIndex: Map<string, CollectionHit[]> | null = null;

function collectionHitIndex(): Map<string, CollectionHit[]> {
  if (hitIndex) return hitIndex;
  const index = readIndex();
  hitIndex = new Map();
  for (const slug of downloadedSlugs()) {
    const snapshot = readSnapshot(slug);
    const entry = index.find(c => collectionSlug(c) === slug);
    const records = snapshot ? snapshotItems(snapshot) : [];
    const source = {
      slug,
      name: snapshot?.name || entry?.name || slug,
      image: entry?.image || null,
      symbol: snapshot?.symbol ?? null,
      type: snapshot?.type ?? entry?.type ?? null,
    };
    for (const item of records) {
      const key = item.id.toLowerCase();
      const hit: CollectionHit = { ...source, item: { ...item, id: key } };
      const list = hitIndex.get(key);
      if (list) list.push(hit);
      else hitIndex.set(key, [hit]);
    }
  }
  return hitIndex;
}

export function findCollectionHitsByHash(hash: string): CollectionHit[] {
  if (!hash) return [];
  return collectionHitIndex().get(hash.toLowerCase()) ?? [];
}
