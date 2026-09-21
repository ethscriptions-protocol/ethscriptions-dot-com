import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyExplorerMetadata,
  compactAttributes,
  itemsToIds,
  mergeExtraIds,
  mergeTraits,
  parseCollectionItemRow,
  siteSlugFromDump,
  splitCopyRow,
  unescapeCopyField,
} from "./dump-collections.mts";

test("siteSlugFromDump maps FriendlyId dump slugs onto site slugs", () => {
  assert.equal(siteSlugFromDump("mfpurrs"), "mfpurrs");
  assert.equal(siteSlugFromDump("scribble-s-games"), "scribbles-games");
  assert.equal(siteSlugFromDump("pepepunks"), "pepepunks-dao");
  assert.equal(siteSlugFromDump("blood-trinity-coin"), "blood-trinity-and-coin");
});

test("unescapeCopyField handles nulls and postgres escapes", () => {
  assert.equal(unescapeCopyField("\\N"), null);
  assert.equal(unescapeCopyField("mfpurr #1"), "mfpurr #1");
  assert.equal(unescapeCopyField("a\\\\b"), "a\\b");
});

test("splitCopyRow keeps escaped tabs inside fields", () => {
  assert.deepEqual(splitCopyRow("a\tb\tc", 3), ["a", "b", "c"]);
  assert.deepEqual(splitCopyRow("a\tb\\tc\td", 3), ["a", "b\\tc", "d"]);
});

test("compactAttributes drops none/empty and keeps OpenSea traits", () => {
  assert.deepEqual(
    compactAttributes([
      { trait_type: "fur", value: "siamese" },
      { trait_type: "background", value: "none" },
      { trait_type: "hat", value: "safari" },
      { trait_type: "x", value: "" },
    ]),
    [
      { trait_type: "fur", value: "siamese" },
      { trait_type: "hat", value: "safari" },
    ],
  );
  assert.deepEqual(compactAttributes({}), []);
});

test("parseCollectionItemRow reads dump COPY columns", () => {
  const attrs = JSON.stringify([{ value: "siamese", trait_type: "fur" }, { value: "none", trait_type: "background" }]);
  const hid = "0x" + "ab".repeat(32);
  const line = [
    "1",
    "77",
    attrs,
    "mfpurr #10000",
    "\\N",
    "\\N",
    "\\N",
    "2023-01-01 00:00:00",
    "2023-01-01 00:00:00",
    hid,
    "9999",
  ].join("\t");
  const parsed = parseCollectionItemRow(line);
  assert.equal(parsed?.collectionId, "77");
  assert.deepEqual(parsed?.item, {
    i: 9999,
    id: hid,
    n: "mfpurr #10000",
    a: [{ trait_type: "fur", value: "siamese" }],
  });
});

test("mergeExtraIds skips extras when hashes do not overlap a large dump set", () => {
  const hid = (n: number, ch: string) => "0x" + ch.repeat(32);
  const items = Array.from({ length: 50 }, (_, i) => ({ i, id: hid(i, "a") }));
  const extras = Array.from({ length: 50 }, (_, i) => hid(i, "b"));
  assert.equal(mergeExtraIds(items, extras).length, 50);
});

test("mergeExtraIds appends post-dump hashes after max token id", () => {
  const hid = (n: string) => "0x" + n.repeat(32);
  const merged = mergeExtraIds(
    [
      { i: 0, id: hid("aa"), n: "A" },
      { i: 1, id: hid("bb"), n: "B" },
    ],
    [hid("bb"), hid("cc"), hid("dd")],
  );
  assert.deepEqual(
    merged.map(it => it.i),
    [0, 1, 2, 3],
  );
  assert.equal(merged[2].id, hid("cc"));
  assert.equal(merged[2].n, undefined);
});

test("itemsToIds is token-id order", () => {
  assert.deepEqual(
    itemsToIds([
      { i: 2, id: "0x2" },
      { i: 0, id: "0x0" },
      { i: 1, id: "0x1" },
    ]),
    ["0x0", "0x1", "0x2"],
  );
});

test("mergeTraits prefers explorer values and adds missing traits", () => {
  assert.deepEqual(
    mergeTraits(
      [
        { trait_type: "fur", value: "siamese" },
        { trait_type: "hat", value: "safari" },
      ],
      [
        { trait_type: "Fur", value: "siamese" },
        { trait_type: "rank", value: "123" },
      ],
    ),
    [
      { trait_type: "fur", value: "siamese" },
      { trait_type: "hat", value: "safari" },
      { trait_type: "rank", value: "123" },
    ],
  );
});

test("applyExplorerMetadata fills name, hash, and extra traits", () => {
  const hid = "0x" + "ab".repeat(32);
  const updated = applyExplorerMetadata(
    { i: 9999, id: "0x" + "00".repeat(32), n: "old" },
    {
      name: "mfpurr #10000",
      ethscription_id: hid,
      attributes: [
        { trait_type: "fur", value: "siamese" },
        { trait_type: "rank", value: "123" },
        { trait_type: "background", value: "none" },
      ],
    },
  );
  assert.equal(updated.n, "mfpurr #10000");
  assert.equal(updated.id, hid);
  assert.deepEqual(updated.a, [
    { trait_type: "fur", value: "siamese" },
    { trait_type: "rank", value: "123" },
  ]);
});
