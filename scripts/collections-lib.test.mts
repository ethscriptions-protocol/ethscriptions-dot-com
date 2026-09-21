import assert from "node:assert/strict";
import { test } from "node:test";
import { collectionSlug, lookupCollectionHits, selectDownloadedCollections, slugify } from "../lib/collections.ts";

test("slugify matches snapshot script", () => {
  assert.equal(slugify("Eths Maxis"), "eths-maxis");
  assert.equal(slugify("Scribble's Games"), "scribbles-games");
  assert.equal(slugify("erc-20 eths token"), "erc-20-eths-token");
});

test("collectionSlug prefers explicit slug", () => {
  assert.equal(collectionSlug({ name: "BLOCKS", slug: "blocks" }), "blocks");
  assert.equal(collectionSlug({ name: "Pillars" }), "pillars");
});

test("selectDownloadedCollections keeps only snapshotted slugs, sorted by holders", () => {
  const index = [
    { name: "mfpurrs", holders: "1835", supply: "10000" },
    { name: "BLOCKS", slug: "blocks", holders: "17", supply: "20", image: "/collection-images/blocks.svg" },
    { name: "Eths Maxis", slug: "eths-maxis", holders: "78", supply: "201" },
  ];
  const items = selectDownloadedCollections(index, new Set(["blocks", "eths-maxis"]));
  assert.deepEqual(
    items.map(c => c.slug),
    ["eths-maxis", "blocks"],
  );
  assert.equal(items[0].supply, 201);
  assert.equal(items[1].image, "/collection-images/blocks.svg");
  assert.equal(items.find(c => c.slug === "mfpurrs"), undefined);
});

test("lookupCollectionHits finds every membership for a hash", () => {
  const hid = "0x" + "ab".repeat(32);
  const other = "0x" + "cd".repeat(32);
  const hits = lookupCollectionHits(hid, [
    {
      slug: "mfpurrs",
      name: "mfpurrs",
      image: "/m.svg",
      symbol: "MFPURRS",
      type: "ERC-721",
      items: [
        { i: 9999, id: hid.toUpperCase(), n: "mfpurr #10000", a: [{ trait_type: "fur", value: "siamese" }] },
        { i: 0, id: other, n: "mfpurr #1", a: [] },
      ],
    },
    {
      slug: "other",
      name: "Other",
      image: null,
      symbol: null,
      type: null,
      items: [{ i: 1, id: hid, n: "also this", a: [] }],
    },
  ]);
  assert.equal(hits.length, 2);
  assert.equal(hits[0].slug, "mfpurrs");
  assert.equal(hits[0].item.i, 9999);
  assert.equal(hits[1].slug, "other");
  assert.deepEqual(lookupCollectionHits(other, []), []);
});
