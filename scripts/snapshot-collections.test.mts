import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  alternateCursors,
  createRateGate,
  HttpStatusError,
  instanceUrl,
  instancesUrl,
  withApiKey,
  isConsecutiveDescending,
  isRateLimitedStatus,
  isServerError,
  isServerErrorStatus,
  matchesOnly,
  nextBackoffMs,
  parseArgs,
  parseInstancesPage,
  parseRetryAfterMs,
  recoverFromServerError,
  remainingCursors,
  slugify,
} from "./snapshot-collections.mts";

const here = path.dirname(fileURLToPath(import.meta.url));

test("slugify", () => {
  assert.equal(slugify("mfpurrs"), "mfpurrs");
  assert.equal(slugify("Eths Maxis"), "eths-maxis");
  assert.equal(slugify("Scribble's Games"), "scribbles-games");
  assert.equal(slugify("noise."), "noise");
  assert.equal(slugify("erc-20 eths token"), "erc-20-eths-token");
  assert.equal(slugify("blood, trinity, & coin"), "blood-trinity-and-coin");
  assert.equal(slugify("0xEthereals"), "0xethereals");
  assert.equal(slugify("Milady on-chain"), "milady-on-chain");
});

test("all collection names produce unique slugs", () => {
  const indexPath = path.join(here, "..", "data", "collections.json");
  const names = JSON.parse(readFileSync(indexPath, "utf8")).map((c: { name: string }) => c.name);
  const slugs = names.map(slugify);
  assert.equal(new Set(slugs).size, slugs.length, `collisions: ${slugs}`);
  assert.ok(slugs.every(Boolean));
});

test("parseInstancesPage extracts token ids and hashes, skips missing metadata", () => {
  const hid = "0x" + "ab".repeat(32);
  const hid2 = "0x" + "cd".repeat(32);
  const raw = JSON.stringify({
    items: [
      {
        id: "2",
        image_url: "data:image/svg+xml;base64,AAAA",
        metadata: { ethscription_id: hid, image: "data:image/svg+xml;base64,AAAA" },
      },
      { id: "1", metadata: { ethscription_id: hid2 } },
      { id: "0", metadata: {} },
    ],
    next_page_params: { unique_token: 0 },
  });
  const parsed = parseInstancesPage(raw);
  assert.deepEqual(
    parsed.items.map(i => i.ethscriptionId),
    [hid, hid2],
  );
  assert.deepEqual(
    parsed.items.map(i => i.tokenId),
    ["2", "1"],
  );
  assert.deepEqual(parsed.nextPageParams, { unique_token: 0 });
});

test("parseInstancesPage lowercases hashes and accepts null next", () => {
  const hid = "0x" + "11".repeat(32);
  const raw = JSON.stringify({
    items: [{ id: "0", metadata: { ethscription_id: hid.toUpperCase() } }],
    next_page_params: null,
  });
  const parsed = parseInstancesPage(raw);
  assert.deepEqual(
    parsed.items.map(i => i.ethscriptionId),
    [hid],
  );
  assert.equal(parsed.nextPageParams, null);
});

test("instancesUrl", () => {
  const base = "https://explorer.ethscriptions.com";
  const addr = "0xBCaC1c9C9848a47F6a49E886eC66E81A859b47Fa";
  assert.equal(instancesUrl(base, addr, null), `${base}/api/v2/tokens/${addr}/instances`);
  assert.equal(
    instancesUrl(base, addr, { unique_token: 9950 }),
    `${base}/api/v2/tokens/${addr}/instances?unique_token=9950`,
  );
  assert.equal(instanceUrl(base, addr, 9999), `${base}/api/v2/tokens/${addr}/instances/9999`);
  assert.equal(withApiKey(instanceUrl(base, addr, 9999), ""), instanceUrl(base, addr, 9999));
  assert.equal(
    withApiKey(instanceUrl(base, addr, 9999), "test-key"),
    `${base}/api/v2/tokens/${addr}/instances/9999?api_key=test-key`,
  );
  assert.equal(
    withApiKey(instancesUrl(base, addr, { unique_token: 9950 }), "test-key"),
    `${base}/api/v2/tokens/${addr}/instances?unique_token=9950&api_key=test-key`,
  );
});

test("remainingCursors walks unique_token backwards by page size", () => {
  const cursors = remainingCursors(9950, 50);
  assert.equal(cursors[0], 9950);
  assert.equal(cursors.at(-1), 50);
  assert.equal(cursors.length, 199);
  assert.deepEqual(remainingCursors(50, 50), [50]);
  assert.deepEqual(remainingCursors(0, 50), []);
});

test("matchesOnly is exact slug or name, not a substring", () => {
  const mfpurrs = { name: "mfpurrs" };
  const token = { name: "erc-20 mfpurrs token" };
  const maxis = { name: "Eths Maxis" };
  assert.equal(matchesOnly(mfpurrs, "mfpurrs", []), true);
  assert.equal(matchesOnly(mfpurrs, "mfpurrs", ["mfpurrs"]), true);
  assert.equal(matchesOnly(token, "erc-20-mfpurrs-token", ["mfpurrs"]), false);
  assert.equal(matchesOnly(maxis, "eths-maxis", ["Eths Maxis"]), true);
  assert.equal(matchesOnly(maxis, "eths-maxis", ["eths-maxis"]), true);
  assert.equal(matchesOnly(maxis, "eths-maxis", ["eths"]), false);
});

test("isConsecutiveDescending", () => {
  assert.equal(isConsecutiveDescending([9999, 9998, 9997]), true);
  assert.equal(isConsecutiveDescending([5]), true);
  assert.equal(isConsecutiveDescending([]), true);
  assert.equal(isConsecutiveDescending([9999, 9997]), false);
});

test("403 and 429 are rate limits; 500 is not", () => {
  assert.equal(isRateLimitedStatus(403), true);
  assert.equal(isRateLimitedStatus(429), true);
  assert.equal(isRateLimitedStatus(500), false);
  assert.equal(isRateLimitedStatus(200), false);
});

test("parseRetryAfterMs reads delta-seconds and HTTP dates", () => {
  assert.equal(parseRetryAfterMs("12"), 12_000);
  assert.equal(parseRetryAfterMs(null), null);
  assert.equal(parseRetryAfterMs("nope"), null);
  const now = Date.parse("Wed, 21 Oct 2015 07:28:00 GMT");
  assert.equal(parseRetryAfterMs("Wed, 21 Oct 2015 07:28:10 GMT", now), 10_000);
});

test("nextBackoffMs is 5s doubling capped at 120s plus jitter", () => {
  assert.equal(nextBackoffMs(1, 0), 5_000);
  assert.equal(nextBackoffMs(2, 0), 10_000);
  assert.equal(nextBackoffMs(3, 250), 20_250);
  assert.equal(nextBackoffMs(8, 0), 120_000);
});

test("parseArgs defaults concurrency to 8", () => {
  assert.equal(parseArgs([]).concurrency, 8);
});

test("isServerErrorStatus is 5xx only", () => {
  assert.equal(isServerErrorStatus(500), true);
  assert.equal(isServerErrorStatus(503), true);
  assert.equal(isServerErrorStatus(499), false);
  assert.equal(isServerErrorStatus(404), false);
  assert.equal(isServerError(new HttpStatusError(500, "HTTP 500")), true);
  assert.equal(isServerError(new HttpStatusError(404, "HTTP 404")), false);
  assert.equal(isServerError(new Error("HTTP 500 Internal Server Error")), false);
});

test("alternateCursors walks down inside the failed page, not onto the next planned cursor", () => {
  assert.deepEqual(alternateCursors(19551, 50), Array.from({ length: 49 }, (_, i) => 19550 - i));
  assert.equal(alternateCursors(19551, 50).at(-1), 19502);
  assert.deepEqual(alternateCursors(50, 50), Array.from({ length: 49 }, (_, i) => 49 - i).filter(n => n >= 1));
  assert.deepEqual(alternateCursors(1, 50), []);
  assert.deepEqual(alternateCursors(80, 1), []);
});

test("recoverFromServerError uses the first working lower cursor, then gives up", async () => {
  const tried: number[] = [];
  const recovered = await recoverFromServerError(
    19551,
    50,
    async cursor => {
      tried.push(cursor);
      if (cursor > 19520) throw new HttpStatusError(500, "HTTP 500");
      return { items: [{ tokenId: String(cursor - 1), ethscriptionId: "0x1" }] };
    },
    isServerError,
  );
  assert.equal(tried[0], 19550);
  assert.equal(tried.at(-1), 19520);
  assert.equal(tried.length, 31);
  assert.equal(recovered?.cursor, 19520);
  assert.equal(recovered?.value.items[0].tokenId, "19519");

  const none = await recoverFromServerError(
    10,
    5,
    async () => {
      throw new HttpStatusError(500, "HTTP 500");
    },
    isServerError,
  );
  assert.equal(none, null);
});

test("recoverFromServerError does not swallow non-500 errors", async () => {
  await assert.rejects(
    () =>
      recoverFromServerError(
        20,
        5,
        async () => {
          throw new Error("network down");
        },
        isServerError,
      ),
    /network down/,
  );
});

test("rate gate drops to 1 worker and honors Retry-After after a 403", async () => {
  let now = 0;
  const sleeps: number[] = [];
  const gate = createRateGate(8, {
    now: () => now,
    sleep: async ms => {
      sleeps.push(ms);
      now += ms;
    },
  });
  assert.equal(gate.snapshot().limit, 8);
  const paused = gate.noteLimited(15_000);
  assert.equal(paused, 15_000);
  assert.equal(gate.snapshot().limit, 1);
  await gate.run(async () => "ok");
  assert.deepEqual(sleeps, [15_000]);
  gate.noteOk();
  assert.equal(gate.snapshot().limit, 2);
});
