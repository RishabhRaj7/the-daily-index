import { getStore } from "@/lib/server/store";
import type { LiveMarkets } from "./indices";

// The last link in the live-data chain: primary source → backup → the last
// good reading, marked stale with its time → nothing. A tile whose source
// failed this minute shows what it last read and when, instead of vanishing
// (or worse, showing a zero). Only a figure that has never been read is
// left out.
//
// The last good board lives in the store, refreshed at most every few
// minutes however many readers poll /api/markets.

const KEY = "live:markets:last";
const WRITE_LOCK = "live:markets:last:w";
const WRITE_EVERY_SECONDS = 300;
/** Older than this, a reading is no longer worth showing at all. */
const MAX_AGE_MS = 4 * 86_400_000;

type Item = { id?: string; region?: string; asOf?: string; stale?: boolean };

const keyOf = (x: Item) => x.id ?? x.region ?? "";

/** Fresh items as they are; stored ones fill the gaps, marked stale. */
function merge<T extends Item>(fresh: T[], stored: T[] | undefined, savedAt: string): T[] {
  const have = new Set(fresh.map(keyOf));
  const out = [...fresh];
  for (const old of stored ?? []) {
    const asOf = old.asOf ?? savedAt;
    if (have.has(keyOf(old)) || Date.now() - Date.parse(asOf) > MAX_AGE_MS) continue;
    // Put it back where it was, so a stale tile keeps its place in the grid.
    const at = (stored ?? []).indexOf(old);
    out.splice(Math.min(at, out.length), 0, { ...old, stale: true, asOf });
  }
  return out;
}

/**
 * What to keep for next time: everything on the board, in board order.
 * A fresh reading is stamped with now; a stale one keeps its old time.
 */
function keep<T extends Item>(items: T[], now: string): T[] {
  return items.map(({ stale, ...x }) => ({ ...x, asOf: stale ? x.asOf : (x.asOf ?? now) }) as T);
}

export async function withLastGood(fresh: LiveMarkets | null): Promise<LiveMarkets | null> {
  const store = getStore();
  const now = new Date().toISOString();
  const stored = await store.get<LiveMarkets & { savedAt: string }>(KEY).catch(() => null);

  const savedAt = stored?.savedAt ?? now;
  const moods = merge(fresh?.moods ?? [], stored?.moods, savedAt);
  const merged: LiveMarkets = {
    indices: merge(fresh?.indices ?? [], stored?.indices, savedAt),
    moods,
    mood: moods.find((m) => m.region === "India") ?? moods[0],
    commodities: merge(fresh?.commodities ?? [], stored?.commodities, savedAt),
    crypto: merge(fresh?.crypto ?? [], stored?.crypto, savedAt),
  };

  // Save the board at most every few minutes, and only when this read
  // actually reached Yahoo.
  if (fresh && fresh.indices.length > 0 && (await store.setIfAbsent(WRITE_LOCK, 1, WRITE_EVERY_SECONDS).catch(() => false))) {
    const next = {
      indices: keep(merged.indices, now),
      moods: keep(merged.moods, now),
      commodities: keep(merged.commodities, now),
      crypto: keep(merged.crypto, now),
    };
    await store.set(KEY, { ...next, mood: next.moods[0], savedAt: now }, { ttlSeconds: 7 * 86_400 }).catch(() => {});
  }

  return merged.indices.length > 0 ? merged : null;
}
