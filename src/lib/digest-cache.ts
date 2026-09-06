// Client-side cache for the preference-driven digest (localStorage).
//
// Keyed by edition date AND a hash of the preferences that produced the
// digest — so editing settings in /settings automatically invalidates the
// stored digest and the next visit generates a fresh one.

import type { DigestResult } from "./preferences/types";

const PREFIX = "daily-index:digest:";

function digestKey(isoDate: string, prefsHash: string): string {
  return `${PREFIX}${isoDate}:${prefsHash}`;
}

export function readDigestCache(
  isoDate: string,
  prefsHash: string,
): DigestResult | null {
  try {
    const raw = window.localStorage.getItem(digestKey(isoDate, prefsHash));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DigestResult;
    if (!parsed || typeof parsed.sections !== "object" || parsed.sections === null) {
      return null;
    }
    // Never serve a digest generated more than two days ago, whatever key
    // it was hiding under.
    const age = Date.now() - new Date(parsed.generatedAt).getTime();
    if (!Number.isFinite(age) || age > 48 * 3_600_000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeDigestCache(
  isoDate: string,
  prefsHash: string,
  result: DigestResult,
): void {
  try {
    window.localStorage.setItem(digestKey(isoDate, prefsHash), JSON.stringify(result));
    pruneDigestCache(isoDate);
  } catch {
    // Storage full / private mode — the digest still applies from memory.
  }
}

/** Drop digests from other days and stale preference variants. */
export function pruneDigestCache(keepIsoDate: string): void {
  try {
    const drop: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(PREFIX) && !key.startsWith(`${PREFIX}${keepIsoDate}:`)) {
        drop.push(key);
      }
    }
    drop.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

/** "Refresh edition" purge — forces a from-scratch digest on next mount. */
export function clearDigestCache(): void {
  try {
    const drop: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(PREFIX)) drop.push(key);
    }
    drop.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // ignore
  }
}
