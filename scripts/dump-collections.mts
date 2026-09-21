export type Trait = { trait_type: string; value: string };

export type SnapshotItem = {
  i: number;
  id: string;
  n?: string;
  a?: Trait[];
};

export const DUMP_SLUG_ALIASES: Record<string, string> = {
  "blood-trinity-coin": "blood-trinity-and-coin",
  "ebert-s-moon-mission": "eberts-moon-mission",
  mfpurrfect: "mfpurrfect-by-nvmd",
  pepepunks: "pepepunks-dao",
  "scribble-s-games": "scribbles-games",
};

export const SKIP_DUMP_SLUGS = new Set(["erc-20-nodes-token"]);

export function siteSlugFromDump(dumpSlug: string): string {
  return DUMP_SLUG_ALIASES[dumpSlug] ?? dumpSlug;
}

export function unescapeCopyField(field: string): string | null {
  if (field === "\\N") return null;
  let out = "";
  for (let i = 0; i < field.length; i++) {
    if (field[i] !== "\\" || i + 1 >= field.length) {
      out += field[i];
      continue;
    }
    const n = field[++i];
    if (n === "b") out += "\b";
    else if (n === "f") out += "\f";
    else if (n === "n") out += "\n";
    else if (n === "r") out += "\r";
    else if (n === "t") out += "\t";
    else if (n === "v") out += "\v";
    else out += n;
  }
  return out;
}

export function splitCopyRow(line: string, columns: number): string[] | null {
  const fields: string[] = [];
  let cur = "";
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "\t") {
      fields.push(cur);
      cur = "";
      continue;
    }
    if (line[i] === "\\" && i + 1 < line.length) {
      cur += line[i] + line[i + 1];
      i++;
      continue;
    }
    cur += line[i];
  }
  fields.push(cur);
  if (fields.length !== columns) return null;
  return fields;
}

export function compactAttributes(raw: unknown): Trait[] {
  if (!Array.isArray(raw)) return [];
  const out: Trait[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const trait_type = String((row as { trait_type?: unknown }).trait_type ?? "").trim();
    const value = String((row as { value?: unknown }).value ?? "").trim();
    if (!trait_type || !value) continue;
    if (value.toLowerCase() === "none") continue;
    out.push({ trait_type, value });
  }
  return out;
}

export function parseCollectionItemRow(line: string): {
  collectionId: string;
  item: SnapshotItem;
} | null {
  const fields = splitCopyRow(line.replace(/\n$/, ""), 11);
  if (!fields) return null;
  const collectionId = unescapeCopyField(fields[1]);
  const attrsRaw = unescapeCopyField(fields[2]);
  const name = unescapeCopyField(fields[3]);
  const ethscriptionId = unescapeCopyField(fields[9]);
  const indexRaw = unescapeCopyField(fields[10]);
  if (!collectionId || !ethscriptionId) return null;
  const i = Number(indexRaw);
  if (!Number.isFinite(i)) return null;
  let parsed: unknown = [];
  if (attrsRaw) {
    try {
      parsed = JSON.parse(attrsRaw);
    } catch {
      parsed = [];
    }
  }
  const a = compactAttributes(parsed);
  const item: SnapshotItem = { i, id: ethscriptionId.toLowerCase() };
  if (name) item.n = name;
  if (a.length) item.a = a;
  return { collectionId, item };
}

export function extrasToMerge(items: SnapshotItem[], extraIds: string[]): string[] {
  if (!extraIds.length) return [];
  if (!items.length) return extraIds.map(id => id.toLowerCase());
  const have = new Set(items.map(it => it.id.toLowerCase()));
  const extras = extraIds.map(id => id.toLowerCase()).filter(id => id && !have.has(id));
  const overlap = extraIds.length - extras.length;
  if (extraIds.length >= 50 && overlap === 0) return [];
  return extras;
}

export function mergeExtraIds(items: SnapshotItem[], extraIds: string[]): SnapshotItem[] {
  let next = items.reduce((m, it) => Math.max(m, it.i), -1) + 1;
  const out = [...items];
  for (const id of extrasToMerge(items, extraIds)) {
    out.push({ i: next, id });
    next++;
  }
  return out.sort((a, b) => a.i - b.i || a.id.localeCompare(b.id));
}

export function itemsToIds(items: SnapshotItem[]): string[] {
  return [...items].sort((a, b) => a.i - b.i).map(it => it.id);
}

export function mergeTraits(base: Trait[], extra: Trait[]): Trait[] {
  const by = new Map<string, Trait>();
  for (const t of base) by.set(t.trait_type.toLowerCase(), t);
  for (const t of extra) {
    const key = t.trait_type.toLowerCase();
    const prev = by.get(key);
    by.set(key, prev ? { trait_type: prev.trait_type, value: t.value } : t);
  }
  return [...by.values()];
}

export function applyExplorerMetadata(
  item: SnapshotItem,
  meta: { name?: string; ethscription_id?: string; attributes?: unknown },
): SnapshotItem {
  const extra = compactAttributes(meta.attributes);
  const a = mergeTraits(item.a ?? [], extra);
  const next: SnapshotItem = { ...item };
  if (meta.name) next.n = meta.name;
  if (a.length) next.a = a;
  const id = meta.ethscription_id?.toLowerCase();
  if (id && /^0x[0-9a-f]{64}$/.test(id)) next.id = id;
  return next;
}
