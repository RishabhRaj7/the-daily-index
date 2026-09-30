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

// The markets section used to be India-only. A reader who never edited it
// gets the current default (mostly India, some global markets).
const OLD_MARKETS_PROMPT =
  "Prioritize Nifty/Sensex movement, RBI policy, and SWP/mutual fund related news. Skip pure stock-tip articles.";
function upgradeMarketsSection(sections: DigestSection[]): void {
  const current = DEFAULT_DIGEST_PREFERENCES.sections.find((s) => s.id === "markets");
  const i = sections.findIndex(
    (s) => s.id === "markets" && s.label === "Indian Markets & Economy" && s.prompt === OLD_MARKETS_PROMPT,
  );
  if (current && i >= 0) sections[i] = { ...sections[i], label: current.label, prompt: current.prompt };
}

// v1 → v2: Two Cities arrived after readers had saved preferences. Each
// saved copy gets the default city section once; removing it afterwards
// (a v2 save) sticks.
function upgradeV1ToV2(raw: Record<string, unknown>): Record<string, unknown> {
  const sections = Array.isArray(raw.sections) ? [...raw.sections] : [];
  const cities = DEFAULT_DIGEST_PREFERENCES.sections.find((s) => s.slot === "two-cities");
  const has = sections.some((s) => (s as { slot?: unknown })?.slot === "two-cities");
  if (cities && !has) {
    const ids = new Set(sections.map((s) => (s as { id?: unknown })?.id));
    let id = cities.id;
    while (ids.has(id)) id = `${id}-2`;
    sections.push({ ...structuredClone(cities), id });
  }
  return { ...raw, sections, version: 2 };
}

// v2 → v3: India's national news moved out of World into its own section,
// The Nation. Each saved copy gets the default India section once. A World
// section still on the old default loses its India group and gets the new
// note; one the reader edited is left as they made it.
const OLD_WORLD_GROUPS = ["United States", "China", "United Kingdom", "India", "Japan"];
const OLD_WORLD_PROMPT = "Favor geopolitics and economic policy over local/domestic stories.";
function upgradeV2ToV3(raw: Record<string, unknown>): Record<string, unknown> {
  const sections = Array.isArray(raw.sections) ? raw.sections.map((s) => ({ ...(s as Record<string, unknown>) })) : [];
  const nation = DEFAULT_DIGEST_PREFERENCES.sections.find((s) => s.slot === "the-nation");
  const world = DEFAULT_DIGEST_PREFERENCES.sections.find((s) => s.slot === "dateline");
  if (nation && !sections.some((s) => s.slot === "the-nation")) {
    const ids = new Set(sections.map((s) => s.id));
    let id = nation.id;
    while (ids.has(id)) id = `${id}-2`;
    const worldAt = sections.find((s) => s.slot === "dateline");
    // Same order as World: the stable sort then prints it right after World.
    const order = typeof worldAt?.order === "number" ? worldAt.order : nation.order;
    sections.push({ ...structuredClone(nation), id, order });
  }
  const saved = sections.find((s) => s.slot === "dateline" && s.type === "grouped");
  if (saved && world?.type === "grouped" && JSON.stringify(saved.groups) === JSON.stringify(OLD_WORLD_GROUPS)) {
    saved.groups = [...world.groups];
    if (saved.prompt === OLD_WORLD_PROMPT) saved.prompt = world.prompt;
  }
  return { ...raw, sections, version: 3 };
}

// The length presets grew (35/60/100 → 50/90/140). Saved preferences that
// picked an old preset move to its new size, so the setting stays selected.
const LEGACY_LENGTHS: Record<number, number> = { 35: 50, 60: 90, 100: 140 };
const upgradeLength = (words: number): number => LEGACY_LENGTHS[words] ?? words;

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean)
    : [];

const asSlot = (v: unknown): NewsSlot | undefined =>
  typeof v === "string" && (NEWS_SLOTS as string[]).includes(v)
    ? (v as NewsSlot)
    : undefined;

function slugifyId(label: string, fallback = "section"): string {
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
    summaryLengthWords: upgradeLength(
      asNumber(rawGlobal.summaryLengthWords, d.global.summaryLengthWords, 10, 300),
    ),
    avoidPolitics:
      typeof rawGlobal.avoidPolitics === "boolean" ? rawGlobal.avoidPolitics : d.global.avoidPolitics,
    rivals: asStringArray(rawGlobal.rivals ?? []).slice(0, 6),
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

    // The credit-card section was retired; a stored copy of it must not
    // resurface as a standalone section once its slot no longer exists.
    if (s.slot === "plastic-points") return;

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
  upgradeMarketsSection(sections);
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
    case 2:
      return migratePreferences(upgradeV2ToV3(raw as Record<string, unknown>));
    case 1:
      return migratePreferences(upgradeV1ToV2(raw as Record<string, unknown>));
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
