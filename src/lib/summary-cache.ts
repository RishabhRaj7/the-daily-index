// Client-side cache for the AI layer of an edition (article summaries, the
// "at a glance" brief, Editor's Picks blurbs, the Editor's Desk note).
//
// Everything lives in sessionStorage, keyed by the edition date. Summaries are
// keyed by article URL — never by positional story id — so a cached paragraph
// can only ever land under the headline it was written for.
//
// Bumped to v3: v2 cached whatever /api/summarize returned, including an empty
// map after a failed call, and the presence of the key alone was treated as
// "already summarised". That is why a reload (even a hard one) never
// re-triggered summarisation. v3 stores a structured record and the reader of
// the cache decides what is still missing.

export interface SummaryCacheRecord {
  /** article URL → summary text (as returned by the model or its fallback) */
  byUrl: Record<string, string>;
  /** article URLs we have asked about at least once (even if the model only
   *  handed back the RSS snippet). Lets us skip re-requesting them. */
  asked: string[];
  /** true once we have asked for the brief / pick blurbs / editor's note for
   *  this edition, whether or not the model returned them. */
  extrasAsked: boolean;
  savedAt: number;
}

const PREFIX = "daily-index:";
const SUMMARIES = (date: string) => `${PREFIX}summaries:v3:${date}`;
const BRIEF = (date: string) => `${PREFIX}brief:${date}`;
const PICKS = (date: string) => `${PREFIX}picks:${date}`;
const NOTE = (date: string) => `${PREFIX}note:${date}`;
const FORCE_FLAG = `${PREFIX}force-summarize`;

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readJson<T>(key: string): T | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function readSummaryRecord(date: string): SummaryCacheRecord | null {
  const rec = readJson<Partial<SummaryCacheRecord>>(SUMMARIES(date));
  if (!rec || typeof rec !== "object") return null;
  const byUrl =
    rec.byUrl && typeof rec.byUrl === "object" ? (rec.byUrl as Record<string, string>) : {};
  const asked = Array.isArray(rec.asked) ? rec.asked.filter((u) => typeof u === "string") : [];
  return {
    byUrl,
    asked,
    extrasAsked: rec.extrasAsked === true,
    savedAt: typeof rec.savedAt === "number" ? rec.savedAt : 0,
  };
}

/** Merge new summaries into today's record (never drops what we already had). */
export function mergeSummaryRecord(
  date: string,
  byUrl: Record<string, string>,
  askedUrls: string[],
  opts: { extrasAsked?: boolean } = {},
): SummaryCacheRecord {
  const prev = readSummaryRecord(date) ?? { byUrl: {}, asked: [], extrasAsked: false, savedAt: 0 };
  const next: SummaryCacheRecord = {
    byUrl: { ...prev.byUrl, ...byUrl },
    asked: Array.from(new Set([...prev.asked, ...askedUrls])),
    extrasAsked: prev.extrasAsked || opts.extrasAsked === true,
    savedAt: Date.now(),
  };
  writeJson(SUMMARIES(date), next);
  return next;
}

export function readBrief<T>(date: string): T | null {
  return readJson<T>(BRIEF(date));
}
export function writeBrief(date: string, brief: unknown) {
  writeJson(BRIEF(date), brief);
}

export function readPickBlurbs(date: string): Record<string, string> | null {
  return readJson<Record<string, string>>(PICKS(date));
}
export function writePickBlurbs(date: string, blurbs: Record<string, string>) {
  writeJson(PICKS(date), blurbs);
}

export function readNote(date: string): string | null {
  const s = storage();
  if (!s) return null;
  try {
    return s.getItem(NOTE(date));
  } catch {
    return null;
  }
}
export function writeNote(date: string, note: string) {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(NOTE(date), note);
  } catch {}
}

/** Remove every cached AI artefact for every date (used by "Refresh edition"). */
export function clearSummaryCaches() {
  const s = storage();
  if (!s) return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (!k) continue;
      if (
        k.startsWith(`${PREFIX}summaries:`) ||
        k.startsWith(`${PREFIX}brief:`) ||
        k.startsWith(`${PREFIX}picks:`) ||
        k.startsWith(`${PREFIX}note:`)
      ) {
        doomed.push(k);
      }
    }
    doomed.forEach((k) => s.removeItem(k));
  } catch {}
}

/** Ask the next EditionView mount to summarise from scratch. */
export function requestForcedSummarize() {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(FORCE_FLAG, String(Date.now()));
  } catch {}
}

/** Read-and-clear the one-shot force flag. */
export function consumeForcedSummarize(): boolean {
  const s = storage();
  if (!s) return false;
  try {
    const v = s.getItem(FORCE_FLAG);
    if (v) s.removeItem(FORCE_FLAG);
    return Boolean(v);
  } catch {
    return false;
  }
}
