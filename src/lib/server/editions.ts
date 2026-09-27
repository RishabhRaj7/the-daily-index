import { createHash } from "node:crypto";
import { after } from "next/server";
import { generateDigest, type WritingCache } from "@/lib/live/digest";
import { DEFAULT_DIGEST_PREFERENCES, normalizePreferences } from "@/lib/preferences/storage";
import type { DigestPreferences, DigestResult } from "@/lib/preferences/types";
import { editionDate } from "@/lib/edition-date";
import { getStore, storeInfo } from "./store";
import { captureSnapshot, type EditionSnapshot } from "./snapshot";

// Server-built editions.
//
// An edition is the digest for one set of preferences on one day. It is keyed
// by a hash of the normalised preferences — there are no accounts: two
// readers with identical preferences share an edition, and changing any
// preference simply points the reader at a different (possibly not yet
// built) one. The reader's preferences themselves stay in their browser;
// the server keeps a copy only so the morning cron can rebuild editions that
// were read recently.
//
// Lifecycle:  missing ──request──► building ──► ready
//                                        └────► failed (retryable)
// A ready edition older than STALE_HOURS is served immediately while a fresh
// build runs in the background (stale-while-revalidate).

const DAY = 86_400;
const STALE_HOURS = Number(process.env.EDITION_STALE_HOURS ?? 6);
/** A build that has not finished in this long is presumed dead. */
const LOCK_SECONDS = 180;
/** Non-default editions expire; the default edition is the permanent archive. */
const CUSTOM_EDITION_TTL = 60 * DAY;
const PREFS_TTL = 14 * DAY;
/** Written summaries are reused across rebuilds for this long. */
const WRITING_TTL = 3 * DAY;

// Shared by every edition: a story selected again (by a refresh, the cron,
// or another reader with the same writing settings) keeps its summary.
const writingCache: WritingCache = {
  getMany: (keys) => getStore().getMany<string>(keys.map((k) => `w:${k}`)).then(
    (found) => new Map([...found].map(([k, v]) => [k.slice(2), v])),
  ),
  setMany: (entries) =>
    getStore().setMany(new Map([...entries].map(([k, v]) => [`w:${k}`, v])), WRITING_TTL),
};
/** Visitor-triggered builds per day — each one is two Gemini calls. */
const GLOBAL_DAILY_LIMIT = Number(process.env.EDITION_BUILDS_PER_DAY ?? 60);
const IP_DAILY_LIMIT = Number(process.env.EDITION_BUILDS_PER_IP ?? 8);

const key = {
  edition: (date: string, hash: string) => `edition:${date}:${hash}`,
  status: (date: string, hash: string) => `status:${date}:${hash}`,
  lock: (date: string, hash: string) => `lock:${date}:${hash}`,
  prefs: (hash: string) => `prefs:${hash}`,
  snapshot: (date: string) => `snapshot:${date}`,
  /** Which hash was "the default edition" on a date — defaults change. */
  defaultOn: (date: string) => `archive:default:${date}`,
  active: "editions:active",
  archive: "archive:dates",
  globalLimit: (date: string) => `limit:${date}`,
  ipLimit: (date: string, ip: string) => `limit:${date}:${ip}`,
};

/** Section names/order as they were when the edition was built, so an
 *  archived edition still reads correctly after preferences change. */
export interface EditionLayoutEntry {
  id: string;
  label: string;
  order: number;
  type: DigestPreferences["sections"][number]["type"];
}

export interface EditionRecord {
  date: string;
  hash: string;
  builtAt: string;
  digest: DigestResult;
  /** Absent on editions stored before the archive existed. */
  layout?: EditionLayoutEntry[];
  /** BUILD_VERSION of the code that built it; absent on older builds. */
  v?: number;
}

/**
 * Bumped when the way an edition is assembled changes (2: every section
 * carries a spare story for the front-page lead). An edition from older
 * code is served as it is but rebuilt in the background, like a stale one.
 */
const BUILD_VERSION = 2;

export type EditionState =
  | { state: "ready"; date: string; hash: string; edition: EditionRecord; refreshing: boolean; note?: string }
  | { state: "building"; date: string; hash: string; startedAt: string }
  | { state: "failed"; date: string; hash: string; error: string }
  | { state: "missing"; date: string; hash: string };

interface StatusRecord {
  state: "building" | "failed";
  at: string;
  error?: string;
}

export function prefsHash(prefs: DigestPreferences): string {
  return createHash("sha256")
    .update(JSON.stringify(normalizePreferences(prefs)))
    .digest("hex")
    .slice(0, 16);
}

export const DEFAULT_HASH = prefsHash(DEFAULT_DIGEST_PREFERENCES);

function ageHours(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

// A heuristic digest built while the AI was configured means the model call
// failed — retry it much sooner than a normal refresh.
function isStale(edition: EditionRecord): boolean {
  const aiConfigured = Boolean(process.env.GEMINI_API_KEY) && process.env.AI_SUMMARIZE !== "false";
  if ((edition.v ?? 1) < BUILD_VERSION) return true;
  const limit = edition.digest.engine === "heuristic" && aiConfigured ? 0.5 : STALE_HOURS;
  return ageHours(edition.builtAt) > limit;
}

export async function readEdition(date: string, hash: string): Promise<EditionRecord | null> {
  return getStore().get<EditionRecord>(key.edition(date, hash));
}

/** Current state of an edition without starting anything. */
export async function editionState(date: string, hash: string): Promise<EditionState> {
  const store = getStore();
  const [edition, status] = await Promise.all([
    readEdition(date, hash),
    store.get<StatusRecord>(key.status(date, hash)),
  ]);
  if (edition) {
    return { state: "ready", date, hash, edition, refreshing: status?.state === "building" };
  }
  if (status?.state === "building") return { state: "building", date, hash, startedAt: status.at };
  if (status?.state === "failed") {
    return { state: "failed", date, hash, error: status.error ?? "The edition could not be built." };
  }
  return { state: "missing", date, hash };
}

/**
 * Build one edition now and store it. Never throws. `ownsLock` is true when
 * the caller took the build lock (requestEdition) and must release it; the
 * cron builds without taking it and must not release someone else's.
 */
export async function buildEdition(
  date: string,
  hash: string,
  prefs: DigestPreferences,
  { ownsLock = false }: { ownsLock?: boolean } = {},
): Promise<EditionRecord | null> {
  const store = getStore();
  try {
    const [digest] = await Promise.all([generateDigest(prefs, { writingCache }), ensureSnapshot(date)]);
    const record: EditionRecord = {
      date,
      hash,
      builtAt: new Date().toISOString(),
      digest,
      v: BUILD_VERSION,
      layout: [...prefs.sections]
        .sort((a, b) => a.order - b.order)
        .map((sec) => ({ id: sec.id, label: sec.label, order: sec.order, type: sec.type })),
    };
    await store.set(
      key.edition(date, hash),
      record,
      hash === DEFAULT_HASH ? undefined : { ttlSeconds: CUSTOM_EDITION_TTL },
    );
    await store.zadd(key.archive, Date.parse(`${date}T00:00:00Z`) / 1000, date);
    // Editing the shipped defaults changes DEFAULT_HASH; remember which hash
    // was the default that day so the archive can still open it later.
    if (hash === DEFAULT_HASH) await store.set(key.defaultOn(date), hash);
    await store.del(key.status(date, hash));
    return record;
  } catch (err) {
    console.error(`[editions] build ${date}/${hash} failed:`, err);
    await store.set(
      key.status(date, hash),
      { state: "failed", at: new Date().toISOString(), error: "The edition could not be built." } satisfies StatusRecord,
      { ttlSeconds: 600 },
    );
    return null;
  } finally {
    if (ownsLock) await store.del(key.lock(date, hash));
  }
}

/**
 * Trusted (cron) build that respects the build lock: skipped when a visitor
 * build of the same edition is already running, so the two never duplicate
 * work — or double the Gemini calls — for one edition.
 */
export async function buildIfIdle(
  date: string,
  hash: string,
  prefs: DigestPreferences,
): Promise<EditionRecord | "busy" | null> {
  if (!(await getStore().setIfAbsent(key.lock(date, hash), 1, LOCK_SECONDS))) return "busy";
  return buildEdition(date, hash, prefs, { ownsLock: true });
}

async function withinLimits(date: string, ip: string | null): Promise<boolean> {
  const store = getStore();
  const global = await store.incr(key.globalLimit(date), DAY);
  if (global > GLOBAL_DAILY_LIMIT) return false;
  if (ip) {
    const perIp = await store.incr(key.ipLimit(date, ip), DAY);
    if (perIp > IP_DAILY_LIMIT) return false;
  }
  return true;
}

export interface RequestOptions {
  /** Rebuild even if today's edition exists (the "Refresh edition" button). */
  force?: boolean;
  /** Visitor IP for rate limiting; null for trusted callers (cron). */
  ip: string | null;
  /** Cron and other trusted callers skip the visitor limits. */
  trusted?: boolean;
}

/**
 * Return today's edition for these preferences, starting a build when there
 * is none (or it is stale, or `force`). With a persistent store the build
 * runs after the response is sent and the client polls; without one (no
 * Redis configured) it runs inline so the answer is still complete.
 */
export async function requestEdition(
  rawPrefs: unknown,
  opts: RequestOptions,
): Promise<EditionState> {
  const store = getStore();
  const prefs = normalizePreferences(rawPrefs);
  const hash = prefsHash(prefs);
  const date = editionDate();

  await Promise.all([
    store.set(key.prefs(hash), prefs, { ttlSeconds: PREFS_TTL }),
    store.zadd(key.active, Date.now(), hash),
  ]);

  const existing = await readEdition(date, hash);
  const wantsBuild = !existing || opts.force || isStale(existing);
  if (!wantsBuild) {
    // Say so when a rebuild someone else started (Refresh, cron) is running,
    // so a poller knows a newer edition is on its way.
    const running = await store.get<StatusRecord>(key.status(date, hash));
    return { state: "ready", date, hash, edition: existing, refreshing: running?.state === "building" };
  }

  // Only one build per edition at a time; a second request joins the first.
  const status = await store.get<StatusRecord>(key.status(date, hash));
  if (status?.state === "building" && ageHours(status.at) * 3600 < LOCK_SECONDS) {
    return existing
      ? { state: "ready", date, hash, edition: existing, refreshing: true }
      : { state: "building", date, hash, startedAt: status.at };
  }

  if (!opts.trusted && !(await withinLimits(date, opts.ip))) {
    return existing
      ? {
          state: "ready",
          date,
          hash,
          edition: existing,
          refreshing: false,
          note: "Today's rebuild limit is reached — showing the latest edition.",
        }
      : { state: "failed", date, hash, error: "Today's build limit is reached. Try again tomorrow." };
  }

  if (!(await store.setIfAbsent(key.lock(date, hash), 1, LOCK_SECONDS))) {
    return existing
      ? { state: "ready", date, hash, edition: existing, refreshing: true }
      : { state: "building", date, hash, startedAt: new Date().toISOString() };
  }

  const startedAt = new Date().toISOString();
  await store.set(key.status(date, hash), { state: "building", at: startedAt } satisfies StatusRecord, {
    ttlSeconds: LOCK_SECONDS,
  });

  if (!store.persistent) {
    const built = await buildEdition(date, hash, prefs, { ownsLock: true });
    return built
      ? { state: "ready", date, hash, edition: built, refreshing: false }
      : { state: "failed", date, hash, error: "The edition could not be built." };
  }

  after(() => buildEdition(date, hash, prefs, { ownsLock: true }));
  return existing
    ? { state: "ready", date, hash, edition: existing, refreshing: true }
    : { state: "building", date, hash, startedAt };
}

/** Preferences of editions read in the last `days` days (for the cron). */
export async function recentlyActive(days: number, limit: number): Promise<Array<{ hash: string; prefs: DigestPreferences }>> {
  const store = getStore();
  const hashes = await store.zrevrangeFrom(key.active, Date.now() - days * DAY * 1000, limit);
  const entries = await Promise.all(
    hashes.map(async (hash) => ({ hash, prefs: await store.get<DigestPreferences>(key.prefs(hash)) })),
  );
  return entries.filter((e): e is { hash: string; prefs: DigestPreferences } => e.prefs !== null);
}

export async function readStoredPrefs(hash: string): Promise<DigestPreferences | null> {
  return getStore().get<DigestPreferences>(key.prefs(hash));
}

/** Dates that have at least one stored edition, newest first. */
export async function archiveDates(limit = 400): Promise<string[]> {
  return getStore().zrevrange(key.archive, limit);
}

/**
 * First build of the day captures the day's numbers; later builds reuse
 * them. A failed capture never blocks the edition itself.
 */
async function ensureSnapshot(date: string): Promise<void> {
  const store = getStore();
  try {
    if (await store.get(key.snapshot(date))) return;
    await store.set(key.snapshot(date), await captureSnapshot());
  } catch (err) {
    console.error(`[editions] snapshot ${date} failed:`, err);
  }
}

export async function readSnapshot(date: string): Promise<EditionSnapshot | null> {
  return getStore().get<EditionSnapshot>(key.snapshot(date));
}

/**
 * The archived edition a reader sees for a date: their own (by the
 * preferences hash in their cookie) when one was built that day, else the
 * default edition, which the cron builds every morning and never expires.
 */
export async function archivedEdition(
  date: string,
  readerHash: string | null,
): Promise<{ edition: EditionRecord; isReaders: boolean } | null> {
  if (readerHash && /^[0-9a-f]{16}$/.test(readerHash)) {
    const own = await readEdition(date, readerHash);
    if (own) return { edition: own, isReaders: true };
  }
  const defaultHash = (await getStore().get<string>(key.defaultOn(date))) ?? DEFAULT_HASH;
  const fallback = await readEdition(date, defaultHash);
  return fallback ? { edition: fallback, isReaders: readerHash === defaultHash } : null;
}

/** Whether editions (and so the archive) survive between requests. */
export function archiveAvailable(): boolean {
  return getStore().persistent;
}

/**
 * What /api/health reports about editions: enough to tell "Redis isn't
 * connected" from "the build failed" from "looking at the wrong
 * deployment" without reading function logs.
 */
export async function editionDiagnostics() {
  const store = getStore();
  const date = editionDate();
  const info = storeInfo();
  try {
    const [dates, edition, status, snapshot] = await Promise.all([
      archiveDates(5),
      readEdition(date, DEFAULT_HASH),
      store.get<StatusRecord>(key.status(date, DEFAULT_HASH)),
      store.get(key.snapshot(date)),
    ]);
    return {
      store: info.kind,
      persistent: store.persistent,
      namespace: info.namespace,
      today: date,
      defaultEdition: edition
        ? { state: "ready", builtAt: edition.builtAt, engine: edition.digest.engine }
        : status
          ? { state: status.state, at: status.at, error: status.error }
          : { state: "missing" },
      snapshotToday: Boolean(snapshot),
      latestArchiveDates: dates,
    };
  } catch (err) {
    return {
      store: info.kind,
      persistent: store.persistent,
      namespace: info.namespace,
      today: date,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
