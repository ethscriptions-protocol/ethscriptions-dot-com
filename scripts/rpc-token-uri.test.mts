import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildTokenUriBatch,
  chunkList,
  decodeAbiString,
  fetchTokenUriJson,
  parseTokenUriJson,
  resolveTokenUriUrl,
  TOKEN_URI_SELECTOR,
  tokenUriCalldata,
} from "./rpc-token-uri.mts";

test("tokenUriCalldata is tokenURI(uint256)", () => {
  assert.equal(tokenUriCalldata(0), TOKEN_URI_SELECTOR + "0".repeat(64));
  assert.equal(tokenUriCalldata(9999).endsWith("270f"), true);
  assert.equal(tokenUriCalldata(9999).length, 2 + 8 + 64);
});

test("chunkList", () => {
  assert.deepEqual(chunkList([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunkList([], 50), []);
});

test("buildTokenUriBatch ids match call order", () => {
  const batch = buildTokenUriBatch("0xabc", [1, 2]);
  assert.equal(batch.length, 2);
  assert.equal(batch[0].params[0].to, "0xabc");
  assert.equal(batch[0].params[0].data, tokenUriCalldata(1));
  assert.equal(batch[1].id, 1);
});

test("decodeAbiString reads a UTF-8 string", () => {
  const payload = Buffer.from("hi", "utf8");
  const buf = Buffer.alloc(32 + 32 + 32);
  buf.writeBigUInt64BE(32n, 24);
  buf.writeBigUInt64BE(2n, 32 + 24);
  payload.copy(buf, 64);
  assert.equal(decodeAbiString("0x" + buf.toString("hex")), "hi");
  assert.equal(decodeAbiString("0x"), null);
  assert.equal(decodeAbiString("0x" + "0".repeat(64)), null);
});

test("parseTokenUriJson reads data URIs and raw JSON", () => {
  const json = { name: "mfpurr #10000", attributes: [{ trait_type: "rank", value: "123" }] };
  const b64 = Buffer.from(JSON.stringify(json), "utf8").toString("base64");
  assert.deepEqual(parseTokenUriJson(`data:application/json;base64,${b64}`), json);
  assert.deepEqual(parseTokenUriJson(JSON.stringify(json)), json);
  assert.equal(parseTokenUriJson("ipfs://foo"), null);
});

test("resolveTokenUriUrl handles ipfs, arweave, and http", () => {
  assert.equal(resolveTokenUriUrl("https://example.com/meta.json"), "https://example.com/meta.json");
  assert.equal(resolveTokenUriUrl("http://example.com/meta.json"), "http://example.com/meta.json");
  assert.equal(resolveTokenUriUrl("ipfs://QmXyz123"), "https://ipfs.io/ipfs/QmXyz123");
  assert.equal(resolveTokenUriUrl("ipfs://ipfs/QmXyz123"), "https://ipfs.io/ipfs/QmXyz123");
  assert.equal(resolveTokenUriUrl("ar://tx123"), "https://arweave.net/tx123");
  assert.equal(resolveTokenUriUrl("data:application/json;base64,abc"), null);
});

test("fetchTokenUriJson resolves inline and remote URIs", async () => {
  const dataJson = { name: "Inline Item" };
  const b64 = Buffer.from(JSON.stringify(dataJson)).toString("base64");
  assert.deepEqual(await fetchTokenUriJson(`data:application/json;base64,${b64}`), dataJson);

  const mockFetch = async (url: string) => {
    if (url === "https://ipfs.io/ipfs/test-cid") {
      return {
        ok: true,
        text: async () => JSON.stringify({ name: "IPFS Item", attributes: [{ trait_type: "color", value: "blue" }] }),
      };
    }
    return { ok: false, status: 404 };
  };

  const remote = await fetchTokenUriJson("ipfs://test-cid", { fetchFn: mockFetch as any });
  assert.deepEqual(remote, { name: "IPFS Item", attributes: [{ trait_type: "color", value: "blue" }] });

  const failing = await fetchTokenUriJson("ipfs://bad-cid", { fetchFn: mockFetch as any });
  assert.equal(failing, null);
});
