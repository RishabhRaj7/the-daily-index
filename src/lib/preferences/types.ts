// Preference-driven digest — the single source of truth for the shape of
// reader preferences, the sections they define, and what the AI must return.
// These types are shared by the storage layer, the settings GUI, the
// /api/digest route, the prompt builder, and the display components.

/**
 * Bump whenever the on-disk JSON shape changes in a breaking way, and add a
 * migration case in `migratePreferences()` (storage.ts) so old stored copies
 * are upgraded instead of silently discarded.
 */
export const PREFERENCES_VERSION = 1;

/**
 * Display slots of the paper's existing news sections. A digest section whose
 * `slot` points at one of these feeds its AI-selected articles into that
 * section's component — including its sidebar widgets (F1 standings, indices
 * table, card gallery…), which stay exactly as they are. Digest sections
 * without a slot render as standalone sections of their own.
 */
export type NewsSlot =
  | "dateline"        // World & India
  | "sports"          // Optional football and tennis topic
  | "paddock-notes"   // Sports (F1 / football / tennis)
  | "circuit-board"   // Technology
  | "ledger"          // Finance & Markets
  | "plastic-points"; // India Credit Cards

export const NEWS_SLOTS: NewsSlot[] = [
  "dateline",
  "sports",
  "paddock-notes",
  "circuit-board",
  "ledger",
  "plastic-points",
];

export const SLOT_LABELS: Record<NewsSlot, string> = {
  dateline: "Dateline — World & India",
  sports: "Sports",
  "paddock-notes": "Paddock Notes — Sports",
  "circuit-board": "The Circuit Board — Tech",
  ledger: "The Ledger — Finance & Markets",
  "plastic-points": "Plastic & Points — Credit Cards",
};

/** Applies to every section, in addition to each section's own rules. */
export interface DigestGlobal {
  /** Voice the summaries should read like, e.g. "no fluff". */
  tone: string;
  /** Topics or entities to prioritise across every digest section. */
  watchTopics: string[];
  /** Articles matching any of these keywords never make the digest. */
  excludeKeywords: string[];
  /** Articles older than this are dropped. */
  maxAgeHours: number;
  /** Rough length, in words, each summary should aim for. */
  summaryLengthWords: number;
}

interface SectionBase {
  /** Stable id — the AI response is keyed by it. Lowercase, dash-separated. */
  id: string;
  /** Human name printed on the page. */
  label: string;
  /** Rendering order of the digest sections (ascending). */
  order: number;
  /** Existing paper section this digest section pours its articles into. */
  slot?: NewsSlot;
  /** Prefer articles from these domains/sources when choosing. */
  preferredSources?: string[];
  /** Section-level additions to `global.excludeKeywords`. */
  excludeKeywords?: string[];
  /**
   * Specific entities to prioritise within this section — a player, a stock,
   * a company, a person. Articles mentioning them rank above general news.
   * Reusable by every section type, not just sports.
   */
  watchEntities?: string[];
  /**
   * Free-form extra guidance layered on top of the section type's default
   * rules. Drives BOTH which articles get picked and how they're summarised.
   * Sections without a prompt use the default rules only.
   */
  prompt?: string;
}

/** Flat list of up to `articleCount` best-fit articles for the topic. */
export interface TopicSection extends SectionBase {
  type: "topic";
  articleCount: number;
}

/**
 * Up to `articleCountPerGroup` articles for each value in `groups`.
 * `groupBy` relabels the dimension: countries today, companies / cities /
 * people tomorrow — same shape either way.
 */
export interface GroupedSection extends SectionBase {
  type: "grouped";
  groupBy: string;
  groups: string[];
  articleCountPerGroup: number;
}

/**
 * A section the AI fills by following `instruction` literally — for one-off
 * experiments without touching any code.
 */
export interface CustomSection extends SectionBase {
  type: "custom";
  instruction: string;
  articleCount: number;
}

export type DigestSection = TopicSection | GroupedSection | CustomSection;

export interface DigestPreferences {
  version: number;
  global: DigestGlobal;
  sections: DigestSection[];
}

// ---- AI response shape ------------------------------------------------------

/** One article in the digest, exactly as the site renders it. */
export interface DigestArticle {
  title: string;
  summary: string;
  /** Publisher / domain, e.g. "bbc.co.uk". */
  source: string;
  /** Link to the full story — always a real corpus URL, never invented. */
  url: string;
  /** ISO timestamp when known, else the feed's own age string ("3h ago"). */
  publishedAt: string;
  /**
   * Bucket the article belongs to:
   *  - grouped sections → one of the section's `groups` values;
   *  - sections slotted into paddock-notes → "f1" | "football" | "tennis",
   *    so the sports section can keep its per-sport layout;
   *  - anything else → omitted.
   */
  group?: string;
  /** 1 = most important in its section; articles arrive pre-sorted by it. */
  priority: number;
  /** Set when the article earned its place via a watched entity. */
  matchedEntity?: string;
}

/** One collated article fed to the AI (or the heuristic fallback). */
export interface CorpusArticle {
  /** Index the model references in its reply — keeps responses small and
   *  makes hallucinated links impossible server-side. */
  i: number;
  title: string;
  /** Best available body text (RSS description / snippet). */
  text: string;
  url: string;
  /** Publisher domain. */
  source: string;
  /** Which wire the article came from: World, Markets, F1, Football, Tennis,
   *  Tech, Cards. */
  pool: string;
  /** Feed-reported age, e.g. "3h ago". */
  postedAgo: string;
  /** Parsed age in hours when derivable from postedAgo; else null. */
  ageHours: number | null;
}

/** What /api/digest returns and the display layer consumes. */
export interface DigestResult {
  /** Keyed by digest-section id. Sections with nothing qualifying are []. */
  sections: Record<string, DigestArticle[]>;
  generatedAt: string;
  /** "ai" when the model produced it, "heuristic" for the offline fallback. */
  engine: "ai" | "heuristic";
  /** How many collated articles the selection ran against. */
  corpusSize: number;
}
