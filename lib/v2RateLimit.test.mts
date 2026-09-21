import {
  attachV2RateLimitInterceptor,
  createSlidingWindowLimiter,
  isV2ApiUrl,
  parseRateLimitConfig,
} from "./v2RateLimit.ts";
import axios from "axios";
import assert from "node:assert/strict";
import { test } from "node:test";

test("isV2ApiUrl matches the API origin only", () => {
  const base = "https://api-v2.ethscriptions.com";
  assert.equal(isV2ApiUrl(`${base}/ethscriptions/0xabc`, base), true);
  assert.equal(isV2ApiUrl(base, base), true);
  assert.equal(isV2ApiUrl("https://explorer.ethscriptions.com/api/v2/tokens/0x1", base), false);
  assert.equal(isV2ApiUrl(undefined, base), false);
});

test("parseRateLimitConfig defaults to 100 requests per 10s", () => {
  assert.deepEqual(parseRateLimitConfig({}), { max: 100, windowMs: 10_000 });
});

test("parseRateLimitConfig reads env and rejects junk", () => {
  assert.deepEqual(
    parseRateLimitConfig({
      NEXT_PUBLIC_V2_RATE_LIMIT_MAX: "40",
      NEXT_PUBLIC_V2_RATE_WINDOW_MS: "5000",
    }),
    { max: 40, windowMs: 5000 },
  );
  assert.deepEqual(
    parseRateLimitConfig({
      NEXT_PUBLIC_V2_RATE_LIMIT_MAX: "nope",
      NEXT_PUBLIC_V2_RATE_WINDOW_MS: "-1",
    }),
    { max: 100, windowMs: 10_000 },
  );
});

test("limiter allows max acquires in the window then waits", async () => {
  let now = 0;
  const sleeps: number[] = [];
  const limiter = createSlidingWindowLimiter(2, 1000, {
    now: () => now,
    sleep: async ms => {
      sleeps.push(ms);
      now += ms;
    },
  });
  await limiter.acquire();
  await limiter.acquire();
  await limiter.acquire();
  assert.deepEqual(sleeps, [1000]);
});

test("concurrent acquires cannot exceed max in the same window", async () => {
  let now = 0;
  const sleeps: number[] = [];
  const limiter = createSlidingWindowLimiter(3, 1000, {
    now: () => now,
    sleep: async ms => {
      sleeps.push(ms);
      now += ms;
    },
  });
  await Promise.all(Array.from({ length: 5 }, () => limiter.acquire()));
  assert.equal(sleeps.length, 1);
  assert.equal(sleeps[0], 1000);
});

test("interceptor throttles v2 URLs and skips others", async () => {
  let acquired = 0;
  const client = axios.create({
    adapter: async config => ({
      data: "ok",
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    }),
  });
  attachV2RateLimitInterceptor(
    client,
    {
      acquire: async () => {
        acquired++;
      },
    },
    "https://api-v2.ethscriptions.com",
  );
  await client.get("https://api-v2.ethscriptions.com/ethscriptions/0x1");
  await client.get("https://explorer.ethscriptions.com/api/v2/tokens/0x1");
  assert.equal(acquired, 1);
});
