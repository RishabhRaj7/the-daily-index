import { Redis } from "@upstash/redis";

// Tiny key-value store behind the server-built editions and the archive.
//
// Production: Upstash Redis (free tier), added from the Vercel dashboard →
// Storage → Upstash for Redis. Vercel injects either the KV_REST_API_* or the
// UPSTASH_REDIS_REST_* pair depending on how the integration was created —
// both are accepted.
//
// Without those variables (local dev, or before the integration is added)
// the store falls back to process memory. That is enough for one dev server
// (one process, so background builds and polling work as in production),
// but NOT on Vercel, where every request may land on a different instance —
// there `persistent` is false and callers build synchronously instead.

export interface Store {
  /** True when data survives across serverless instances (Redis). */
  persistent: boolean;
  get<T>(key: string): Promise<T | null>;
  /** Several keys in one round trip; missing keys are absent from the map. */
  getMany<T>(keys: string[]): Promise<Map<string, T>>;
  set(key: string, value: unknown, opts?: { ttlSeconds?: number }): Promise<void>;
  /** Several writes in one round trip, all with the same expiry. */
  setMany(entries: Map<string, unknown>, ttlSeconds: number): Promise<void>;
  /** Set only if absent; true when this call took the key (a lock). */
  setIfAbsent(key: string, value: unknown, ttlSeconds: number): Promise<boolean>;
  del(key: string): Promise<void>;
  /** Atomic counter that expires `ttlSeconds` after its first increment. */
  incr(key: string, ttlSeconds: number): Promise<number>;
  /** Sorted set: add/update a member's score. */
  zadd(key: string, score: number, member: string): Promise<void>;
  /** Sorted set: members, highest score first. */
  zrevrange(key: string, limit: number): Promise<string[]>;
  /** Sorted set: members with score ≥ min, highest first. */
  zrevrangeFrom(key: string, min: number, limit: number): Promise<string[]>;
}

function redisFromEnv(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

// One free Upstash database serves every environment, so each environment
// writes under its own prefix: preview testing never lands in the live
// archive, and production never reads a preview's editions. Vercel sets
// VERCEL_ENV to "production" | "preview" | "development".
const NAMESPACE = process.env.STORE_NAMESPACE ?? process.env.VERCEL_ENV ?? "development";

function redisStore(redis: Redis): Store {
  const k = (key: string) => `${NAMESPACE}:${key}`;
  return {
    persistent: true,
    async get<T>(key: string) {
      return (await redis.get<T>(k(key))) ?? null;
    },
    async getMany<T>(keys: string[]) {
      const out = new Map<string, T>();
      if (keys.length === 0) return out;
      const values = await redis.mget<(T | null)[]>(...keys.map(k));
      keys.forEach((k, i) => {
        if (values[i] !== null && values[i] !== undefined) out.set(k, values[i] as T);
      });
      return out;
    },
    async setMany(entries, ttlSeconds) {
      if (entries.size === 0) return;
      const pipe = redis.pipeline();
      for (const [key, v] of entries) pipe.set(k(key), v, { ex: ttlSeconds });
      await pipe.exec();
    },
    async set(key, value, opts) {
      if (opts?.ttlSeconds) await redis.set(k(key), value, { ex: opts.ttlSeconds });
      else await redis.set(k(key), value);
    },
    async setIfAbsent(key, value, ttlSeconds) {
      return (await redis.set(k(key), value, { nx: true, ex: ttlSeconds })) === "OK";
    },
    async del(key) {
      await redis.del(k(key));
    },
    async incr(key, ttlSeconds) {
      const n = await redis.incr(k(key));
      if (n === 1) await redis.expire(k(key), ttlSeconds);
      return n;
    },
    async zadd(key, score, member) {
      await redis.zadd(k(key), { score, member });
    },
    async zrevrange(key, limit) {
      return redis.zrange<string[]>(k(key), 0, limit - 1, { rev: true });
    },
    async zrevrangeFrom(key, min, limit) {
      return redis.zrange<string[]>(k(key), "+inf", min, {
        byScore: true,
        rev: true,
        offset: 0,
        count: limit,
      });
    },
  };
}

// ---- in-memory fallback -------------------------------------------------------

function memoryStore(): Store {
  const g = globalThis as typeof globalThis & {
    __dailyIndexStore?: {
      kv: Map<string, { value: unknown; expires: number | null }>;
      zsets: Map<string, Map<string, number>>;
    };
  };
  g.__dailyIndexStore ??= { kv: new Map(), zsets: new Map() };
  const { kv, zsets } = g.__dailyIndexStore;

  const live = (key: string) => {
    const hit = kv.get(key);
    if (!hit) return undefined;
    if (hit.expires !== null && hit.expires < Date.now()) {
      kv.delete(key);
      return undefined;
    }
    return hit;
  };
  const expiry = (ttl?: number) => (ttl ? Date.now() + ttl * 1000 : null);
  const sorted = (key: string) =>
    [...(zsets.get(key) ?? new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]);

  return {
    persistent: process.env.VERCEL !== "1",
    async get<T>(key: string) {
      return (live(key)?.value as T | undefined) ?? null;
    },
    async getMany<T>(keys: string[]) {
      const out = new Map<string, T>();
      for (const k of keys) {
        const hit = live(k);
        if (hit) out.set(k, hit.value as T);
      }
      return out;
    },
    async setMany(entries, ttlSeconds) {
      for (const [k, v] of entries) kv.set(k, { value: v, expires: expiry(ttlSeconds) });
    },
    async set(key, value, opts) {
      kv.set(key, { value, expires: expiry(opts?.ttlSeconds) });
    },
    async setIfAbsent(key, value, ttlSeconds) {
      if (live(key)) return false;
      kv.set(key, { value, expires: expiry(ttlSeconds) });
      return true;
    },
    async del(key) {
      kv.delete(key);
    },
    async incr(key, ttlSeconds) {
      const hit = live(key);
      const n = (typeof hit?.value === "number" ? hit.value : 0) + 1;
      kv.set(key, { value: n, expires: hit?.expires ?? expiry(ttlSeconds) });
      return n;
    },
    async zadd(key, score, member) {
      const set = zsets.get(key) ?? new Map<string, number>();
      set.set(member, score);
      zsets.set(key, set);
    },
    async zrevrange(key, limit) {
      return sorted(key).slice(0, limit).map(([m]) => m);
    },
    async zrevrangeFrom(key, min, limit) {
      return sorted(key)
        .filter(([, s]) => s >= min)
        .slice(0, limit)
        .map(([m]) => m);
    },
  };
}

/** Where editions live, for /api/health — never includes credentials. */
export function storeInfo(): { kind: "redis" | "memory"; namespace: string } {
  return { kind: redisFromEnv() ? "redis" : "memory", namespace: NAMESPACE };
}

let cached: Store | null = null;

export function getStore(): Store {
  if (cached) return cached;
  const redis = redisFromEnv();
  cached = redis ? redisStore(redis) : memoryStore();
  return cached;
}
