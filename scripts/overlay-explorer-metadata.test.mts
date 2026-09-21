import assert from "node:assert/strict";
import { test } from "node:test";
import {
  compactSnapshotItem,
  overlaySnapshotItem,
  parseInstanceMetadata,
  parseOverlayArgs,
  selectOverlaySlugs,
  snapshotItemsEqual,
  uniquePendingIds,
} from "./overlay-explorer-metadata.mts";

test("parseOverlayArgs", () => {
  assert.deepEqual(parseOverlayArgs(["--only", "mfpurrs", "--token", "9999", "--concurrency", "4", "--batch", "25"]), {
    only: ["mfpurrs"],
    tokens: [9999],
    force: false,
    concurrency: 4,
    batch: 25,
  });
  assert.equal(parseOverlayArgs(["--force"]).force, true);
  assert.equal(parseOverlayArgs([]).concurrency, 8);
  assert.equal(parseOverlayArgs([]).batch, 50);
});

test("selectOverlaySlugs filters --only", () => {
  assert.deepEqual(selectOverlaySlugs(["mfpurrs", "blocks"], ["mfpurrs"]), ["mfpurrs"]);
  assert.deepEqual(selectOverlaySlugs(["mfpurrs", "blocks"], []), ["mfpurrs", "blocks"]);
});

test("parseInstanceMetadata reads BlockScout instance JSON and ignores media", () => {
  const hid = "0x" + "ab".repeat(32);
  const parsed = parseInstanceMetadata(
    JSON.stringify({
      id: "9999",
      image_url: "data:image/png;base64,AAAA",
      metadata: {
        name: "mfpurr #10000",
        ethscription_id: hid,
        image: "data:image/png;base64,AAAA",
        attributes: [
          { trait_type: "fur", value: "siamese" },
          { trait_type: "rank", value: "123" },
          { trait_type: "background", value: "none" },
        ],
      },
    }),
  );
  assert.deepEqual(parsed, {
    name: "mfpurr #10000",
    ethscription_id: hid,
    attributes: [
      { trait_type: "fur", value: "siamese" },
      { trait_type: "rank", value: "123" },
      { trait_type: "background", value: "none" },
    ],
  });
  assert.equal(parseInstanceMetadata("{"), null);
  assert.equal(parseInstanceMetadata(JSON.stringify({ id: "1", image_url: "x" })), null);
});

test("overlaySnapshotItem adds explorer traits without dropping dump traits", () => {
  const hid = "0x" + "ab".repeat(32);
  const item = {
    i: 9999,
    id: hid,
    n: "mfpurr #10000",
    a: [
      { trait_type: "fur", value: "siamese" },
      { trait_type: "hat", value: "safari" },
    ],
  };
  const next = overlaySnapshotItem(
    item,
    JSON.stringify({
      metadata: {
        name: "mfpurr #10000",
        ethscription_id: hid,
        attributes: [
          { trait_type: "Fur", value: "siamese" },
          { trait_type: "rank", value: "123" },
        ],
      },
    }),
  );
  assert.deepEqual(next.a, [
    { trait_type: "fur", value: "siamese" },
    { trait_type: "hat", value: "safari" },
    { trait_type: "rank", value: "123" },
  ]);
  assert.equal(next.n, "mfpurr #10000");
  assert.equal(snapshotItemsEqual(item, next), false);
  assert.equal(snapshotItemsEqual(next, overlaySnapshotItem(next, JSON.stringify({ metadata: { attributes: [{ trait_type: "rank", value: "123" }] } }))), true);
});

test("compactSnapshotItem omits empty name and attributes", () => {
  assert.deepEqual(compactSnapshotItem({ i: 1, id: "0x1", n: undefined, a: [] }), { i: 1, id: "0x1" });
});

test("uniquePendingIds skips completed and duplicate token ids", () => {
  assert.deepEqual(
    uniquePendingIds(
      [
        { i: 0 },
        { i: 0 },
        { i: 1 },
        { i: 2 },
      ],
      new Set([1]),
      null,
    ),
    [0, 2],
  );
});
