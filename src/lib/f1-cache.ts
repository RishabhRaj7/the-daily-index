// Client-side per-part cache for the F1 sidebar (sessionStorage).
//
// The sidebar's Refresh control is deliberately cache-first: it re-reads
// whatever is already stored locally and only goes to the network for parts
// that are missing or stale. That is what stops a refresh from wiping a
// perfectly good constructors' table just because one upstream endpoint
// happened to fail on that click.
//
// Full "Refresh edition" (the masthead button) clears this alongside every
// other cache, so a genuine from-scratch re-pull is still one click away.

const PREFIX = "daily-index:f1:v1:";

/** Parts older than this are re-fetched by the sidebar's refresh. */
export const F1_CACHE_TTL_MS = 10 * 60 * 1000;

export interface F1CacheEntry<T> {
  data: T;
  /** epoch ms the entry was stored */
  at: number;
}

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readF1Part<T>(part: string): F1CacheEntry<T> | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(PREFIX + part);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<F1CacheEntry<T>>;
    if (!parsed || typeof parsed.at !== "number" || parsed.data === undefined) return null;
    return { data: parsed.data as T, at: parsed.at };
  } catch {
    return null;
  }
}

export function writeF1Part<T>(part: string, data: T): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(PREFIX + part, JSON.stringify({ data, at: Date.now() }));
  } catch {
    // Storage full / private mode — the sidebar still holds the data in state.
  }
}

export function isFresh(entry: { at: number } | null, ttlMs = F1_CACHE_TTL_MS): boolean {
  return Boolean(entry) && Date.now() - (entry as { at: number }).at < ttlMs;
}

/** "Refresh edition" purge — the next sidebar mount re-pulls every part. */
export function clearF1ClientCache(): void {
  const s = storage();
  if (!s) return;
  try {
    const drop: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && k.startsWith(PREFIX)) drop.push(k);
    }
    drop.forEach((k) => s.removeItem(k));
  } catch {
    // ignore
  }
}
