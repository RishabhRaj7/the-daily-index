import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// ---------------------------------------------------------------------------
// Database client — OPTIONAL.
//
// The Daily Index only needs Postgres for one feature (remembering a
// connected Reddit account). Everything else is live-fetched or lives in the
// browser. So the app must boot, build and render even when DATABASE_URL is
// missing or the server is unreachable.
//
// Nothing here throws at import time. `db` is a lazy proxy: the pool is only
// created on first real use, and if there is no DATABASE_URL a
// `DatabaseUnavailableError` is thrown *from the query*, which every caller
// already guards with try/catch.
// ---------------------------------------------------------------------------

export class DatabaseUnavailableError extends Error {
  constructor(message = "DATABASE_URL is not configured; database features are disabled.") {
    super(message);
    this.name = "DatabaseUnavailableError";
  }
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __arenaNextJsPostgresqlDb?: NodePgDatabase;
};

/** True when a DATABASE_URL is present in the environment. */
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
}

let localPool: Pool | null = null;
let localDb: NodePgDatabase | null = null;

/** The underlying pg Pool, or null when the database is not configured. */
export function getPool(): Pool | null {
  if (!isDatabaseConfigured()) return null;
  if (globalForDb.__arenaNextJsPostgresqlPool) return globalForDb.__arenaNextJsPostgresqlPool;
  if (localPool) return localPool;

  localPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Fail fast instead of hanging a page render when Postgres is down.
    connectionTimeoutMillis: 4000,
    max: 5,
  });
  // A broken idle client must never crash the Node process.
  localPool.on("error", (err) => {
    console.error("[db] idle client error:", err.message);
  });
  if (process.env.NODE_ENV !== "production") {
    globalForDb.__arenaNextJsPostgresqlPool = localPool;
  }
  return localPool;
}

/**
 * The Drizzle client, or null when DATABASE_URL is absent.
 * Prefer this in new code: `const client = getDb(); if (!client) return fallback;`
 */
export function getDb(): NodePgDatabase | null {
  if (globalForDb.__arenaNextJsPostgresqlDb) return globalForDb.__arenaNextJsPostgresqlDb;
  if (localDb) return localDb;
  const pool = getPool();
  if (!pool) return null;
  localDb = drizzle(pool);
  if (process.env.NODE_ENV !== "production") {
    globalForDb.__arenaNextJsPostgresqlDb = localDb;
  }
  return localDb;
}

/**
 * Backwards-compatible `db` export. Behaves exactly like a Drizzle client when
 * the database is configured; otherwise any member access throws a
 * DatabaseUnavailableError (caught by callers), instead of crashing at import.
 */
export const db: NodePgDatabase = new Proxy({} as NodePgDatabase, {
  get(_target, prop, _receiver) {
    const real = getDb();
    if (!real) {
      // Allow harmless introspection (e.g. `await db` / logging) without throwing.
      if (prop === "then" || prop === Symbol.toStringTag || prop === "toJSON") return undefined;
      throw new DatabaseUnavailableError();
    }
    const value = Reflect.get(real as object, prop, real);
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(real) : value;
  },
});

/**
 * Quick reachability probe used by /api/health. Never throws.
 */
export async function pingDatabase(): Promise<"ok" | "unconfigured" | "unreachable"> {
  const client = getDb();
  if (!client) return "unconfigured";
  try {
    await Promise.race([
      client.execute("select 1"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 4000)),
    ]);
    return "ok";
  } catch {
    return "unreachable";
  }
}
