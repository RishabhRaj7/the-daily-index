// Client-side persistence for digest preferences.
//
// Load order: localStorage copy (the reader's edits, from the settings GUI or
// anywhere else) → the default JSON shipped in the repo. Everything stays on
// the device; nothing is uploaded.
//
// `normalizePreferences()` is also used server-side by /api/digest to
// sanitise whatever the client posts, so both layers agree on the shape.

import DEFAULT_PREFERENCES from "./default-preferences.json";
import {
  NEWS_SLOTS,
  PREFERENCES_VERSION,
  type DigestGlobal,
  type DigestPreferences,
  type DigestSection,
  type NewsSlot,
} from "./types";

export const PREFERENCES_STORAGE_KEY = "daily-index:digest-preferences";

/** Fired on `window` after preferences are saved/reset, so an already-open
 *  front page can re-run the digest without a reload. */
export const PREFERENCES_CHANGED_EVENT = "daily-index:preferences-changed";

export const DEFAULT_DIGEST_PREFERENCES: DigestPreferences =
  DEFAULT_PREFERENCES as unknown as DigestPreferences;

// ---- tiny coercion helpers ---------------------------------------------------

const asString = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;

const asNumber = (v: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean)
    : [];

const asSlot = (v: unknown): NewsSlot | undefined =>
  typeof v === "string" && (NEWS_SLOTS as string[]).includes(v)
    ? (v as NewsSlot)
    : undefined;

export function slugifyId(label: string, fallback = "section"): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

/**
 * Coerce an arbitrary parsed object into a valid DigestPreferences. Invalid
 * bits fall back to the defaults instead of throwing, so a hand-edited JSON
 * with one typo never blanks the whole digest.
 */
export function normalizePreferences(raw: unknown): DigestPreferences {
  const d = DEFAULT_DIGEST_PREFERENCES;
  if (!raw || typeof raw !== "object") return structuredClone(d);
  const obj = raw as Record<string, unknown>;

  const rawGlobal = (obj.global ?? {}) as Record<string, unknown>;
  const global: DigestGlobal = {
    tone: asString(rawGlobal.tone, d.global.tone),
    watchTopics: asStringArray(
      rawGlobal.watchTopics ?? rawGlobal.topics ?? d.global.watchTopics ?? [],
    ),
    excludeKeywords: asStringArray(rawGlobal.excludeKeywords ?? d.global.excludeKeywords),
    maxAgeHours: asNumber(rawGlobal.maxAgeHours, d.global.maxAgeHours, 1, 24 * 14),
    summaryLengthWords: asNumber(rawGlobal.summaryLengthWords, d.global.summaryLengthWords, 10, 300),
  };

  const rawSections = Array.isArray(obj.sections) ? obj.sections : d.sections;
  const seenIds = new Set<string>();
  const sections: DigestSection[] = [];

  rawSections.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;
    const s = entry as Record<string, unknown>;
    const type = asString(s.type);
    const label = asString(s.label, `Section ${index + 1}`);
    let id = slugifyId(asString(s.id), slugifyId(label, `section-${index + 1}`));
    while (seenIds.has(id)) id = `${id}-${index + 1}`;
    seenIds.add(id);

    const parsedSlot = asSlot(s.slot);
    const base = {
      id,
      label,
      order: asNumber(s.order, (index + 1) * 10, 0, 9999),
      // Migrate the shipped Sports section from the old shared slot. Both
      // slots render on Paddock Notes, but the separate id keeps Digest
      // configuration clear and lets football/tennis share that topic.
      slot: id === "sports" && parsedSlot === "paddock-notes" ? "sports" : parsedSlot,
      preferredSources: asStringArray(s.preferredSources),
      excludeKeywords: asStringArray(s.excludeKeywords),
      watchEntities: asStringArray(s.watchEntities),
      prompt: asString(s.prompt),
    };

    if (type === "grouped") {
      const groups = asStringArray(s.groups);
      if (groups.length === 0) return; // a grouped section with no groups is unusable
      sections.push({
        ...base,
        type: "grouped",
        groupBy: asString(s.groupBy, "group"),
        groups,
        articleCountPerGroup: asNumber(s.articleCountPerGroup, 1, 1, 10),
      });
    } else if (type === "custom") {
      sections.push({
        ...base,
        type: "custom",
        instruction: asString(s.instruction, asString(s.prompt)),
        articleCount: asNumber(s.articleCount, 3, 1, 15),
      });
    } else {
      // Unknown / missing type → treat as a plain topic section.
      sections.push({
        ...base,
        type: "topic",
        articleCount: asNumber(s.articleCount, 5, 1, 15),
      });
    }
  });

  if (sections.length === 0) return structuredClone(d);
  sections.sort((a, b) => a.order - b.order);
  return { version: PREFERENCES_VERSION, global, sections };
}

/**
 * Version-aware migration for preferences persisted by older app versions.
 * Add a case per old version; each step upgrades one version at a time.
 */
export function migratePreferences(raw: unknown): DigestPreferences {
  if (!raw || typeof raw !== "object") return normalizePreferences(raw);
  const version = (raw as { version?: unknown }).version;

  switch (version) {
    case PREFERENCES_VERSION:
      return normalizePreferences(raw);
    // case 0: return migratePreferences(upgradeV0ToV1(raw));
    default:
      // Unknown future/unknown version: normalise defensively rather than
      // breaking silently — unknown fields are dropped, valid ones kept.
      return normalizePreferences(raw);
  }
}

// ---- localStorage ------------------------------------------------------------

function storageAvailable(): boolean {
  try {
    return typeof window !== "undefined" && Boolean(window.localStorage);
  } catch {
    return false;
  }
}

/** Load the reader's preferences: local copy first, repo defaults otherwise. */
export function loadDigestPreferences(): DigestPreferences {
  if (!storageAvailable()) return structuredClone(DEFAULT_DIGEST_PREFERENCES);
  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_DIGEST_PREFERENCES);
    return migratePreferences(JSON.parse(raw));
  } catch {
    return structuredClone(DEFAULT_DIGEST_PREFERENCES);
  }
}

/** Persist edited preferences and tell any open page they changed. */
export function saveDigestPreferences(prefs: DigestPreferences): void {
  if (!storageAvailable()) return;
  const normalized = normalizePreferences(prefs);
  window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent(PREFERENCES_CHANGED_EVENT));
}

/** Drop the local copy — the next load falls back to the shipped JSON. */
export function resetDigestPreferences(): DigestPreferences {
  if (storageAvailable()) {
    window.localStorage.removeItem(PREFERENCES_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(PREFERENCES_CHANGED_EVENT));
  }
  return structuredClone(DEFAULT_DIGEST_PREFERENCES);
}

/** True when the reader is running the shipped defaults untouched. */
export function hasStoredPreferences(): boolean {
  if (!storageAvailable()) return false;
  try {
    return window.localStorage.getItem(PREFERENCES_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

/** Short stable hash of the preferences — used to key the digest cache so a
 *  settings edit automatically invalidates yesterday's stored digest. */
export function hashPreferences(prefs: DigestPreferences): string {
  const text = JSON.stringify(normalizePreferences(prefs));
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}
