import type { ReaderMemory } from "./types";

// Sync across devices: the shapes the browser and the server share.
//
// One profile per sync key. The reader's choices are kept field by field,
// each stamped by the server when it arrives, so the latest change to a field
// wins without undoing other fields changed elsewhere (a watchlist edit on the
// phone and a paddock change on the laptop both stand). A document kept whole
// (the puzzles) is one field, "_". Reading memory only ever grows, so
// it is merged instead: visits, issues and stories read from every device
// together.

/**
 * The documents that travel between devices. Anything else stays on the
 * device: the morning/evening override, the map's choices, travel mode
 * (where this device is), the cached edition, the Reddit connection.
 */
export const SYNC_DOCS = ["personalization", "preferences", "puzzles"] as const;
export type SyncDoc = (typeof SYNC_DOCS)[number];

export interface SyncField {
  v: unknown;
  /** When the server took it (ms). */
  t: number;
}

export interface SyncProfile {
  docs: Partial<Record<SyncDoc, Record<string, SyncField>>>;
  memory: ReaderMemory | null;
  /** When anything last changed. */
  at: number;
}

/** What a device sends: the fields it changed, and its reading memory when that grew. */
export interface SyncChanges {
  docs?: Partial<Record<SyncDoc, Record<string, unknown>>>;
  memory?: ReaderMemory | null;
}

const MAX_ISSUES = 400;
const MAX_ENGAGEMENTS = 600;

/** Two readers' memories as one: the union, with the larger tally for each affinity. Idempotent. */
export function mergeMemory(a: ReaderMemory | null | undefined, b: ReaderMemory | null | undefined): ReaderMemory | null {
  if (!a) return b ?? null;
  if (!b) return a;
  const visits = [...new Set([...(a.visits ?? []), ...(b.visits ?? [])])].sort();
  const issues = new Map<string, ReaderMemory["issues"][number]>();
  for (const i of [...(a.issues ?? []), ...(b.issues ?? [])]) {
    const had = issues.get(i.isoDate);
    issues.set(
      i.isoDate,
      had
        ? {
            ...had,
            heroHeadline: had.heroHeadline || i.heroHeadline,
            sectionsRead: [...new Set([...had.sectionsRead, ...i.sectionsRead])],
            openedAt: had.openedAt < i.openedAt ? had.openedAt : i.openedAt,
          }
        : i,
    );
  }
  const engagements = new Map<string, ReaderMemory["engagements"][number]>();
  for (const e of [...(a.engagements ?? []), ...(b.engagements ?? [])]) engagements.set(`${e.id}@${e.at}`, e);
  const most = <K extends string>(x: Partial<Record<K, number>> = {}, y: Partial<Record<K, number>> = {}) => {
    const out: Partial<Record<K, number>> = { ...x };
    for (const [k, v] of Object.entries(y) as [K, number][]) out[k] = Math.max(out[k] ?? 0, v);
    return out;
  };
  const firsts = [a.firstOpened, b.firstOpened].filter((x): x is string => !!x).sort();
  return {
    version: 1,
    firstOpened: firsts[0] ?? null,
    visits,
    issues: [...issues.values()].sort((x, y) => x.isoDate.localeCompare(y.isoDate)).slice(-MAX_ISSUES),
    engagements: [...engagements.values()].sort((x, y) => x.at.localeCompare(y.at)).slice(-MAX_ENGAGEMENTS),
    sectionAffinity: most(a.sectionAffinity, b.sectionAffinity),
    sourceAffinity: most(a.sourceAffinity, b.sourceAffinity) as Record<string, number>,
    tagAffinity: most(a.tagAffinity, b.tagAffinity) as Record<string, number>,
  };
}

/** A sync key: 32 characters of base64url (192 random bits). */
export const SYNC_KEY = /^[A-Za-z0-9_-]{32}$/;
