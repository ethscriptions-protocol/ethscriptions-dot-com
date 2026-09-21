export type CollectionIndexEntry = {
  name: string;
  address?: string;
  supply?: string;
  holders?: string;
  image?: string;
  slug?: string;
  type?: string;
};

export type CollectionListItem = {
  name: string;
  slug: string;
  image: string | null;
  supply: number | null;
  holders: number | null;
};

export type CollectionTrait = { trait_type: string; value: string };

export type CollectionItemRecord = {
  i: number;
  id: string;
  n: string | null;
  a: CollectionTrait[];
};

export type CollectionPageData = {
  name: string;
  slug: string;
  image: string | null;
  symbol: string | null;
  type: string | null;
  supply: number;
  holders: number | null;
  transfers: number | null;
  description: string | null;
  twitter: string | null;
  discord: string | null;
  website: string | null;
  items: Array<{ i: number; id: string; n: string | null }>;
};

export type CollectionTokenPageData = {
  name: string;
  slug: string;
  image: string | null;
  symbol: string | null;
  type: string | null;
  item: CollectionItemRecord;
};

export type CollectionHit = {
  slug: string;
  name: string;
  image: string | null;
  symbol: string | null;
  type: string | null;
  item: CollectionItemRecord;
};

export type CollectionHitSource = {
  slug: string;
  name: string;
  image: string | null;
  symbol: string | null;
  type: string | null;
  items: CollectionItemRecord[];
};

export function lookupCollectionHits(hash: string, collections: CollectionHitSource[]): CollectionHit[] {
  const needle = hash.toLowerCase();
  const hits: CollectionHit[] = [];
  for (const collection of collections) {
    for (const item of collection.items) {
      if (item.id.toLowerCase() !== needle) continue;
      hits.push({
        slug: collection.slug,
        name: collection.name,
        image: collection.image,
        symbol: collection.symbol,
        type: collection.type,
        item: { ...item, id: item.id.toLowerCase() },
      });
    }
  }
  return hits;
}

export function slugify(name: string): string {
  const s = name.trim().toLowerCase().replaceAll("&", " and ").replaceAll("'", "");
  return s.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function collectionSlug(entry: Pick<CollectionIndexEntry, "name" | "slug">): string {
  return entry.slug || slugify(entry.name);
}

export function selectDownloadedCollections(
  index: CollectionIndexEntry[],
  downloadedSlugs: Set<string>,
): CollectionListItem[] {
  const items: CollectionListItem[] = [];
  for (const entry of index) {
    const slug = collectionSlug(entry);
    if (!downloadedSlugs.has(slug)) continue;
    items.push({
      name: entry.name,
      slug,
      image: entry.image || null,
      supply: parseCount(entry.supply),
      holders: parseCount(entry.holders),
    });
  }
  items.sort((a, b) => (b.holders ?? -1) - (a.holders ?? -1) || a.name.localeCompare(b.name));
  return items;
}

function parseCount(value?: string): number | null {
  if (!value) return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}
