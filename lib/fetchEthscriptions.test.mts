import {
  V2_HASH_FILTER_LIMIT,
  chunkHashes,
  ethscriptionsByHashParams,
  orderByRequestedHashes,
} from "./fetchEthscriptions.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

test("ethscriptionsByHashParams sends an array filter and max_results", () => {
  const hashes = ["0xaaa", "0xbbb"];
  assert.deepEqual(ethscriptionsByHashParams(hashes), {
    transaction_hash: hashes,
    max_results: 2,
  });
});

test("chunkHashes stays at the v2 filter cap", () => {
  assert.equal(V2_HASH_FILTER_LIMIT, 100);
  const hashes = Array.from({ length: 250 }, (_, i) => `0x${i}`);
  const chunks = chunkHashes(hashes);
  assert.deepEqual(
    chunks.map(c => c.length),
    [100, 100, 50],
  );
  assert.deepEqual(chunkHashes([]), []);
});

test("orderByRequestedHashes restores snapshot order and drops misses", () => {
  const hashes = ["0xAA", "0xbb", "0xcc"];
  const items = [{ transaction_hash: "0xcc" }, { transaction_hash: "0xaa" }];
  assert.deepEqual(
    orderByRequestedHashes(items, hashes).map(row => [row.item.transaction_hash, row.index]),
    [
      ["0xaa", 0],
      ["0xcc", 2],
    ],
  );
});
