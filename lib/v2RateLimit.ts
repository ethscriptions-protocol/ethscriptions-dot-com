import type { AxiosInstance, InternalAxiosRequestConfig } from "axios";
import axios from "axios";

export const DEFAULT_V2_RATE_LIMIT_MAX = 100;
export const DEFAULT_V2_RATE_WINDOW_MS = 10_000;

const INSTALLED = "__ethsV2RateLimit";

type Clock = {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
};

export type RateLimiter = {
  acquire: () => Promise<void>;
};

export function parseRateLimitConfig(env: Record<string, string | undefined> = process.env): {
  max: number;
  windowMs: number;
} {
  return {
    max: positiveInt(env.NEXT_PUBLIC_V2_RATE_LIMIT_MAX, DEFAULT_V2_RATE_LIMIT_MAX),
    windowMs: positiveInt(env.NEXT_PUBLIC_V2_RATE_WINDOW_MS, DEFAULT_V2_RATE_WINDOW_MS),
  };
}

export function isV2ApiUrl(url: string | undefined, base: string): boolean {
  if (!url || !base) return false;
  return url === base || url.startsWith(`${base}/`) || url.startsWith(`${base}?`);
}

export function createSlidingWindowLimiter(max: number, windowMs: number, clock: Partial<Clock> = {}): RateLimiter {
  const now = clock.now ?? Date.now;
  const sleep = clock.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const times: number[] = [];
  let chain = Promise.resolve();

  async function acquire(): Promise<void> {
    const prev = chain;
    let release!: () => void;
    chain = new Promise<void>(resolve => {
      release = resolve;
    });
    await prev;
    try {
      for (;;) {
        const t = now();
        while (times.length && times[0] <= t - windowMs) times.shift();
        if (times.length < max) {
          times.push(t);
          return;
        }
        await sleep(Math.max(1, times[0] + windowMs - t));
      }
    } finally {
      release();
    }
  }

  return { acquire };
}

export function requestUrl(config: InternalAxiosRequestConfig): string {
  const url = config.url ?? "";
  if (/^https?:\/\//i.test(url)) return url;
  const base = config.baseURL ?? "";
  if (!base) return url;
  return `${base.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
}

export function attachV2RateLimitInterceptor(client: AxiosInstance, limiter: RateLimiter, apiBase: string): void {
  client.interceptors.request.use(async config => {
    if (isV2ApiUrl(requestUrl(config), apiBase)) await limiter.acquire();
    return config;
  });
}

export function installV2RateLimit(client: AxiosInstance = axios): void {
  if ((client as AxiosInstance & { [INSTALLED]?: boolean })[INSTALLED]) return;
  (client as AxiosInstance & { [INSTALLED]?: boolean })[INSTALLED] = true;
  const { max, windowMs } = parseRateLimitConfig();
  const apiBase = (process.env.NEXT_PUBLIC_V2_API_BASE_URI ?? "").replace(/\/$/, "");
  attachV2RateLimitInterceptor(client, createSlidingWindowLimiter(max, windowMs), apiBase);
}

function positiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}
