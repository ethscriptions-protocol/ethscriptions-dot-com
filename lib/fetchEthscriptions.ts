export const V2_HASH_FILTER_LIMIT = 100;

export function ethscriptionsByHashParams(hashes: string[]): {
  transaction_hash: string[];
  max_results: number;
} {
  return {
    transaction_hash: hashes,
    max_results: hashes.length,
  };
}

export function chunkHashes(hashes: string[], size = V2_HASH_FILTER_LIMIT): string[][] {
  if (size <= 0) return hashes.length ? [hashes] : [];
  const chunks: string[][] = [];
  for (let i = 0; i < hashes.length; i += size) chunks.push(hashes.slice(i, i + size));
  return chunks;
}

export function orderByRequestedHashes<T extends { transaction_hash: string }>(
  items: T[],
  hashes: string[],
): Array<{ item: T; index: number }> {
  const byHash = new Map<string, T>();
  for (const item of items) byHash.set(item.transaction_hash.toLowerCase(), item);
  const ordered: Array<{ item: T; index: number }> = [];
  hashes.forEach((hash, index) => {
    const item = byHash.get(hash.toLowerCase());
    if (item) ordered.push({ item, index });
  });
  return ordered;
}
