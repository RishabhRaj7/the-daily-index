// The preference-driven digest pipeline (server side).
//
//   1. collectCorpus() — fetch every news wire (World/India, Markets, F1,
//      Football, Tennis, Tech), dedupe, and drop what the
//      reader's age window / literal exclusions rule out. RSS snippets only —
//      no article pages are fetched yet.
//   2. Selection pass — the model sees titles + short snippets and returns,
//      per section, which corpus indices run and in what order, plus the six
//      "At a glance" picks. Small prompt, no writing.
//   3. Full text — only the shortlisted articles' pages are fetched (a few
//      dozen instead of ~130), each checked against its headline.
//   4. Writing pass — the model writes each summary / gist from that text, a
//      few articles to a call (writeAll): one bad call can't blank the paper,
//      and whatever comes back missing or wrong is asked for again.
//
// Selection answers with corpus indices; we rehydrate real article metadata,
// so no link can be invented. Writing answers with a per-article code plus the
// first words of the headline, both checked, because a slip there would put a
// paragraph under the wrong headline.
//
// Every step degrades on its own and says so (DigestResult.writing, printed by
// chrome/WritingNotice.tsx): no model → deterministic heuristic; selection
// fails → keyword picks, still written by the model; a story it can't write →
// the publisher's own description, or just the headline, marked unwritten
// (DigestArticle.written) for writeMissing to retry on the stored edition.

import { createHash } from "node:crypto";
import { isSponsored } from "./sponsored";
import { aiEnabled, generateJson, geminiFailure, summaryModels, Type, type Schema } from "@/lib/server/gemini";
import { dedupeWires } from "./rss";
import { getWorldIndiaWire, getIndiaWire, getMarketsWire, getMoneyWire } from "./news";
import { getSignalStories, matchSignal, missingLeads, signalIndex } from "./signals";
import { isGoogleNewsUrl, resolveGoogleLinks } from "./google-links";
import { finishReport, recordExtra, runWithCollector, startCollector, timed, type BuildReport, type WritingReport } from "./build-report";
import { copyIssues, fixCopy } from "./copy-check";
import { isPolitical } from "./politics-filter";
import { getF1News } from "./f1-news";
import { getFootballNews } from "./football-news";
import { getTennisNews } from "./tennis-news";
import { getTechNews } from "./tech-news";
import { cityAliases, getCityWire } from "./cities";
import { aboutMatches, fetchArticle, fetchedTextMatches, fitsAnotherBetter, groundedIn, headlineFit, humanise, looksOnTopic, type FetchedArticle } from "./summarize";
import { buildSelectionPrompt, buildWritingPrompt, isCitySection, isSportsSection, WRITING_TEXT_CHARS, type WritingItem, sectionTarget } from "@/lib/preferences/prompt";
import type {
  AtAGlanceItem,
  CorpusArticle,
  DigestArticle,
  DigestPreferences,
  DigestResult,
  DigestSection,
  NewsSlot,
  WritingStatus,
} from "@/lib/preferences/types";
import type { WireBrief } from "@/lib/types";

const SELECTION_TIMEOUT_MS = 45_000;
/** Articles to one writing call, on the first pass and on the retry. */
const WRITING_BATCH = 8;
const WRITING_RETRY_BATCH = 3;
const WRITING_CONCURRENCY = 3;
/** One call, its own retries included. */
const WRITING_CALL_TIMEOUT_MS = 45_000;
/** No retry pass starts after this long, so a build ends inside its function. */
const WRITING_BUDGET_MS = 150_000;
const RSS_FALLBACK_CHARS = 2000;
const MAX_GLANCE_PICKS = 6;

// "just now" → 0, "3h ago" → 3, "2d ago" → 48. Anything else → unknown.
function parseAgeHours(postedAgo: string): number | null {
  const t = postedAgo.trim().toLowerCase();
  if (t.startsWith("just now")) return 0;
  const m = t.match(/^(\d+)\s*(m|min|h|d)\b/);
  if (!m) return null;
  const n = Number(m[1]);
  if (m[2] === "d") return n * 24;
  if (m[2] === "h") return n;
  return Math.max(0, n / 60);
}

function tagPool(briefs: WireBrief[], pool: string): Array<WireBrief & { pool: string }> {
  return briefs.map((b) => ({ ...b, pool }));
}

// Bounded worker pool, so the full-text step never fires dozens of page
// fetches at publisher origins at once.
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

// Live blogs ("Iran war live: …", /live/ URLs) are rolling pages, not
// stories: their snippet is whatever the latest post was, and the model
// picked them despite being told not to. Dropped before it sees them.
const LIVE_TITLE = /(^|[\s–—-])live(:|\s+updates?\b|\s+blog\b|\s+[–—-]\s)|\bas it happened\b/i;

function isLiveBlog(title: string, url: string): boolean {
  if (LIVE_TITLE.test(title)) return true;
  try {
    // A "/live/" path segment (Guardian, BBC) — not any slug starting "live-".
    return /\/live(\/|$)/.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/**
 * Collate every news wire into one deduplicated corpus of RSS excerpts, then
 * drop what the reader's preferences rule out deterministically: articles
 * past the age window and literal global exclude keywords. The model never has to spend attention on either.
 *
 * `i` always equals the article's position in the returned array.
 */
export async function collectCorpus(prefs: DigestPreferences): Promise<CorpusArticle[]> {
  // Every city a city section follows gets a pool of its own, named after it.
  const cities = [
    ...new Set(prefs.sections.flatMap((s) => (s.type === "grouped" && isCitySection(s) ? s.groups.map((g) => g.trim()) : []))),
  ].filter(Boolean);
  const [signals, world, india, markets, money, f1, football, tennis, tech, ...cityWires] = await Promise.all([
    getSignalStories(),
    getWorldIndiaWire(24),
    getIndiaWire(20),
    getMarketsWire(28),
    getMoneyWire(18),
    getF1News(20),
    getFootballNews(20),
    getTennisNews(20),
    getTechNews(20),
    ...cities.map((city) => getCityWire(city, 16)),
  ]);

  const pooled = [
    ...tagPool(world, "World"),
    ...tagPool(india, "India"),
    ...tagPool(markets, "Markets"),
    ...tagPool(money, "Money"),
    ...tagPool(f1, "F1"),
    ...tagPool(football, "Football"),
    ...tagPool(tennis, "Tennis"),
    ...tagPool(tech, "Tech"),
    ...cityWires.flatMap((wire, n) => tagPool(wire, cities[n])),
  ];

  // URL-level dedupe first (the same link can appear in two wires), then the
  // near-duplicate title filter.
  const seen = new Set<string>();
  const poolByUrl = new Map<string, string>();
  const unique = pooled.filter((b) => {
    if (seen.has(b.url)) return false;
    seen.add(b.url);
    poolByUrl.set(b.url, b.pool);
    return true;
  });

  const excluded = prefs.global.excludeKeywords.map((k) => k.toLowerCase().trim()).filter(Boolean);
  const maxAge = prefs.global.maxAgeHours;

  const articles = dedupeWires(unique)
    .map((b) => {
      const pool = poolByUrl.get(b.url) ?? "World";
      return {
        i: 0,
        title: b.title,
        text: (b.summary ?? "").slice(0, RSS_FALLBACK_CHARS),
        url: b.url,
        source: b.domain,
        pool,
        postedAgo: b.postedAgo,
        ...(b.postedAt ? { postedAt: b.postedAt } : {}),
        ageHours: parseAgeHours(b.postedAgo),
      };
    })
    .filter((a) => {
      if (a.ageHours !== null && a.ageHours > maxAge) return false;
      if (isLiveBlog(a.title, a.url)) return false;
      if (isSponsored(a.title, a.text, a.url)) return false;
      const hay = `${a.title} ${a.text}`.toLowerCase();
      return !excluded.some((k) => hay.includes(k));
    });

  // Google News signal: tag each article with how widely its story is
  // covered and where it leads, and give every version of one story the
  // same event id.
  const index = signalIndex(signals);
  const matched = new Set<string>();
  const tagged: Array<Omit<CorpusArticle, "i">> = articles.map((a) => {
    const story = matchSignal(a.title, signals, index);
    if (!story) return a;
    matched.add(story.id);
    return { ...a, coverage: story.outlets.length, ...(story.lead ? { lead: story.lead } : {}), event: story.id };
  });

  // A story leading the country's news that none of our feeds carried joins
  // the corpus through its Google link (decoded to the publisher once it is
  // picked, which is also where its text comes from). Until then it is a
  // headline with its reach (`coverage`, `lead`).
  const added = missingLeads(signals, matched, MAX_SIGNAL_ADDS)
    .filter((s) => maxAge === undefined || s.ageHours === null || s.ageHours <= maxAge)
    .filter((s) => !excluded.some((k) => s.title.toLowerCase().includes(k)))
    .map((s): Omit<CorpusArticle, "i"> => ({
      title: s.title,
      text: "",
      url: s.url,
      source: s.domain || s.outlet,
      pool: s.pool,
      postedAgo: s.ageHours === null ? "" : s.ageHours < 1 ? "just now" : `${s.ageHours}h ago`,
      ...(s.ageHours === null ? {} : { postedAt: new Date(Date.now() - s.ageHours * 3_600_000).toISOString() }),
      ageHours: s.ageHours,
      coverage: s.outlets.length,
      ...(s.lead ? { lead: s.lead } : {}),
      event: s.id,
    }));
  recordExtra({ signals: { clusters: signals.length, matched: matched.size, added: added.length } });

  return [...tagged, ...added].map((a, i) => ({ ...a, i }));
}

/** Leading stories added from Google News when our feeds missed them. */
const MAX_SIGNAL_ADDS = 8;

// ---- In Brief ------------------------------------------------------------------
//
// A story leading the country's news (on Google's India top page within the
// first 12, or carried by 3+ outlets) that no section printed goes to the
// foot of the section it belongs to, a line each: At a Glance holds six, and
// a busy day misses more than that. Filed by the pool it came from.

const BRIEF_SLOTS: Record<string, NewsSlot> = {
  India: "the-nation",
  World: "dateline",
  Markets: "ledger",
  Money: "ledger",
  Tech: "circuit-board",
};
const BRIEF_PER_SECTION = 4;
const PARTY_POLITICS =
  /\b(india bloc|nda|congress|bjp|aap|tmc|dmk|bsp|election commission|poll panel|voters?|chief minister|mla|rahul gandhi|kejriwal|mamata|opposition)\b/i;

function missedLeads(prefs: DigestPreferences, corpus: CorpusArticle[], printed: Iterable<string>): Map<NewsSlot, CorpusArticle[]> {
  const slots = new Set(prefs.sections.map((s) => s.slot).filter(Boolean));
  const byUrl = new Map(corpus.map((a) => [a.url, a]));
  const printedUrls = new Set(printed);
  const printedEvents = new Set([...printedUrls].map((u) => byUrl.get(u)?.event).filter(Boolean));
  const best = new Map<string, CorpusArticle>();
  for (const a of corpus) {
    if (!a.event || printedEvents.has(a.event) || printedUrls.has(a.url)) continue;
    if (!((a.lead !== undefined && a.lead <= 12) || (a.coverage ?? 0) >= 3)) continue;
    const slot = BRIEF_SLOTS[a.pool];
    if (!slot || !slots.has(slot) || NOT_NEWS.test(a.title)) continue;
    // No editor chose these, so a reader skipping party politics gets the
    // stricter test here.
    if (prefs.global.avoidPolitics && (isPolitical(a.title) || PARTY_POLITICS.test(a.title))) continue;
    const had = best.get(a.event);
    // One copy per story: ours (it has text and a publisher link) over Google's.
    if (!had || (!had.text && a.text)) best.set(a.event, a);
  }
  const out = new Map<NewsSlot, CorpusArticle[]>();
  const ranked = [...best.values()].sort((x, y) => (x.lead ?? 99) - (y.lead ?? 99) || (y.coverage ?? 0) - (x.coverage ?? 0));
  for (const a of ranked) {
    const slot = BRIEF_SLOTS[a.pool];
    const list = out.get(slot) ?? [];
    if (list.length < BRIEF_PER_SECTION) out.set(slot, [...list, a]);
  }
  return out;
}

/** In Brief prints headlines alone: the writer's whole headline when the feed's was cut off or unclear. */
function toBriefs(
  missed: Map<NewsSlot, CorpusArticle[]>,
  titleOf: (a: CorpusArticle) => string | undefined = () => undefined,
): DigestResult["briefs"] {
  const briefs: NonNullable<DigestResult["briefs"]> = {};
  for (const [slot, list] of missed) {
    briefs[slot] = list.map((a) => {
      const title = titleOf(a) ?? mendTitle(a.title, a.text);
      return {
        title,
        source: a.source,
        url: a.url,
        publishedAt: a.postedAgo,
        ...(a.postedAt ? { postedAt: a.postedAt } : {}),
        outlets: a.coverage ?? 1,
        ...(a.lead ? { lead: a.lead } : {}),
      };
    });
  }
  recordExtra({ briefs: Object.values(briefs).reduce((n, l) => n + (l?.length ?? 0), 0) });
  return briefs;
}

const STOP = new Set("a an the of in on at to for and or by with from as is are was were be after over into its his her their this that new says said".split(" "));
const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
      .map((w) => w.replace(/(ing|ed|es|s)$/, "")),
  );

/** True when a line under a headline mostly repeats it: a third or more of
 *  its words are the headline's own (a reworded headline, not news). */
export function echoes(title: string, line: string): boolean {
  const t = words(title);
  const l = [...words(line)];
  if (l.length === 0) return true;
  return l.filter((w) => t.has(w)).length / l.length >= 0.35;
}

/** Some feeds cut a headline off mid-word ("…attends prayer mee"). When the
 *  last word is only the start of a word in the text, the stub goes and an
 *  ellipsis says so; the writing pass replaces it with a whole headline. */
export function mendTitle(title: string, text = ""): string {
  const t = title.trim();
  if (t.length < 60 || /[.!?'"’”)\]…]$/.test(t)) return t;
  const last = t.match(/([A-Za-z]+)$/)?.[1];
  if (!last) return t;
  const body = text.toLowerCase();
  const lower = last.toLowerCase();
  const whole = new RegExp(`\\b${lower}\\b`).test(body);
  const prefix = new RegExp(`\\b${lower}[a-z]+`).test(body);
  return !whole && prefix ? `${t.slice(0, -last.length).trimEnd()}…` : t;
}

// ---- validation / rehydration ------------------------------------------------

interface RawPick {
  i?: unknown;
  priority?: unknown;
  group?: unknown;
}

function toIndex(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

// Common ways a story names a country without spelling out the group label.
const GROUP_ALIASES: Record<string, string[]> = {
  "united states": ["u.s.", "us", "usa", "america", "american", "washington", "new york", "white house"],
  "united kingdom": ["uk", "u.k.", "britain", "british", "england", "london", "scotland", "wales"],
  china: ["chinese", "beijing", "shanghai", "hong kong", "xi jinping"],
  india: ["indian", "delhi", "mumbai", "rbi", "sebi", "rupee"],
  japan: ["japanese", "tokyo", "osaka", "yen"],
};

// Indian business desks write "the Centre", not "India", so their articles
// count as mentioning India. Only India needs this: SCMP and Japan Times
// stories name their country, and SCMP's China feed also carries regional
// stories (an EU–Philippines deal) that must not pass as "China".
// International outlets (BBC, Guardian, Al Jazeera) never get a pass —
// filing by outlet nationality is the mistake this check exists to catch.
const GROUP_SOURCES: Record<string, string[]> = {
  india: ["thehindu.com", "economictimes.indiatimes.com", "livemint.com", "business-standard.com"],
};

// Whole-word match: "us" must not hit "bonus", "uk" must not hit "duke".
function hasTerm(hay: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`).test(hay);
}

/**
 * A grouped pick must actually be about its group. Models sometimes file a
 * story under the outlet's country (a Guardian report on Athens under
 * "United Kingdom"); requiring the article to mention the group — or a
 * common alias — catches that without a second model call.
 */
function mentionsGroup(article: CorpusArticle, group: string): boolean {
  const hay = `${article.title} ${article.text}`.toLowerCase();
  const key = group.toLowerCase();
  if (GROUP_SOURCES[key]?.some((d) => article.source.endsWith(d))) return true;
  // A city's own local desk (TOI Ranchi's "Kidnapped boy rescued") is about
  // that city even when the headline doesn't say so.
  if (article.pool.toLowerCase() === key) return true;
  const places = cityAliases(group);
  if (places.length > 0) return [key, ...places].some((t) => hasTerm(hay, t));
  // Groups without an alias list (companies, people…) also match on their
  // last word ("Elon Musk" → "musk"); known countries use their curated
  // aliases instead, since "states" or "kingdom" alone would match anything.
  const shortName = key.split(/\s+/).pop() ?? key;
  const aliases = GROUP_ALIASES[key];
  const terms = aliases ? [key, ...aliases] : [key, ...(shortName.length > 2 ? [shortName] : [])];
  return terms.some((t) => hasTerm(hay, t));
}

// Summaries are filled in after the writing pass; rehydration only decides
// which real corpus article sits where.
function toDigestArticle(
  entry: RawPick,
  corpus: CorpusArticle[],
  position: number,
  section: DigestSection,
  watchTopics: string[],
): DigestArticle | null {
  const article = corpus[toIndex(entry.i)];
  if (!article) return null; // unknown index → the model pointed at nothing

  let group: string | undefined;
  if (typeof entry.group === "string" && entry.group.trim()) {
    const g = entry.group.trim();
    if (section.type === "grouped") {
      // A listed group, or — when the model backfills an empty group — the
      // name of another place the story is actually about.
      group = section.groups.find((x) => x.toLowerCase() === g.toLowerCase()) ?? g;
      if (!mentionsGroup(article, group)) group = undefined;
      // City sections only carry their own cities.
      if (group && isCitySection(section) && !section.groups.includes(group)) group = undefined;
    } else if (isSportsSection(section)) {
      const sport = g.toLowerCase();
      if (sport === "f1" || sport === "football" || sport === "tennis") group = sport;
    }
  }

  const priority =
    typeof entry.priority === "number" && Number.isFinite(entry.priority)
      ? entry.priority
      : position + 1;

  const haystack = `${article.title} ${article.text}`.toLowerCase();
  const matchedEntity = [...watchTopics, ...(section.watchEntities ?? [])].find((e) =>
    haystack.includes(e.toLowerCase()),
  );

  return {
    title: article.title,
    summary: "",
    source: article.source,
    url: article.url,
    publishedAt: article.postedAgo,
    ...(article.postedAt ? { postedAt: article.postedAt } : {}),
    priority,
    ...(group ? { group } : {}),
    ...(matchedEntity ? { matchedEntity } : {}),
  };
}

/** Cap + dedupe the model's selections per the section's own rules. */
function rehydrateSection(
  section: DigestSection,
  raw: unknown,
  corpus: CorpusArticle[],
  usedUrls: Set<string>,
  watchTopics: string[],
): DigestArticle[] {
  const entries = Array.isArray(raw) ? (raw as RawPick[]) : [];
  const out: DigestArticle[] = [];
  const perGroup = new Map<string, number>();

  entries.forEach((entry, position) => {
    const article = toDigestArticle(entry, corpus, position, section, watchTopics);
    if (!article) return;
    if (usedUrls.has(article.url)) return; // one section per article, paper-wide

    if (section.type === "grouped") {
      if (!article.group) return; // grouped selections must name a real group
      const key = article.group.toLowerCase();
      const count = perGroup.get(key) ?? 0;
      // A city gets exactly its share, so the columns stay even.
      if (count >= section.articleCountPerGroup + (isCitySection(section) ? 0 : 1)) return;
      // Backfilled places share the section's total, never exceed it.
      if (out.length >= sectionTarget(section)) return;
      perGroup.set(key, count + 1);
    } else if (out.length >= sectionTarget(section)) {
      return;
    }

    usedUrls.add(article.url);
    out.push(article);
  });

  out.sort((a, b) => a.priority - b.priority);
  return out;
}

/**
 * Rehydrate the "At a Glance" picks: capped at 6, URL-deduped, and
 * independent of the sections' usedUrls — these overlay the digest rather
 * than compete with it for articles. Gists are filled in after writing.
 */
function rehydrateAtAGlance(raw: unknown, corpus: CorpusArticle[]): AtAGlanceItem[] {
  const entries = Array.isArray(raw) ? raw : [];
  const out: AtAGlanceItem[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    if (out.length >= MAX_GLANCE_PICKS) break;
    const idx = toIndex(typeof entry === "object" && entry !== null ? (entry as RawPick).i : entry);
    const article = corpus[idx];
    if (!article || seen.has(article.url)) continue;
    seen.add(article.url);
    out.push({
      title: article.title,
      summary: article.title,
      source: article.source,
      url: article.url,
      publishedAt: article.postedAgo,
      ...(article.postedAt ? { postedAt: article.postedAt } : {}),
      pool: article.pool,
    });
  }

  return out;
}

// ---- AI passes -----------------------------------------------------------------

const SELECTION_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    sections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          picks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                i: { type: Type.INTEGER },
                priority: { type: Type.INTEGER },
                group: { type: Type.STRING, nullable: true },
              },
              required: ["i", "priority"],
            },
          },
        },
        required: ["id", "picks"],
      },
    },
    atAGlance: { type: Type.ARRAY, items: { type: Type.INTEGER } },
    rivals: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { i: { type: Type.INTEGER }, rival: { type: Type.STRING } },
        required: ["i", "rival"],
      },
    },
  },
  // "rivals" is required so the editor always answers it (an empty list is
  // fine); left optional, the model quietly skipped the task.
  required: ["sections", "atAGlance", "rivals"],
};

const WRITING_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          ref: { type: Type.STRING },
          about: { type: Type.STRING },
          summary: { type: Type.STRING, nullable: true },
          why: { type: Type.STRING, nullable: true },
          gist: { type: Type.STRING, nullable: true },
          headline: { type: Type.STRING, nullable: true },
        },
        required: ["ref", "about"],
      },
    },
  },
  required: ["items"],
};

interface Selection {
  sections: Record<string, RawPick[]>;
  atAGlance: unknown[];
  rivals: Array<{ i?: unknown; rival?: unknown }>;
}

async function runSelection(prefs: DigestPreferences, corpus: CorpusArticle[]): Promise<Selection> {
  // Temperature 0: the same corpus and preferences should pick the same
  // stories, so a refresh only changes what the news itself changed.
  const text = await generateJson(buildSelectionPrompt(prefs, corpus), {
    schema: SELECTION_SCHEMA,
    temperature: 0,
    timeoutMs: SELECTION_TIMEOUT_MS,
    label: "selection",
  });
  const parsed = JSON.parse(text) as {
    sections?: Array<{ id?: unknown; picks?: unknown }>;
    atAGlance?: unknown;
    rivals?: unknown;
  };
  if (!Array.isArray(parsed?.sections)) throw new Error("selection missing sections");
  const sections: Record<string, RawPick[]> = {};
  for (const entry of parsed.sections) {
    if (typeof entry?.id === "string" && Array.isArray(entry.picks)) {
      sections[entry.id] = entry.picks as RawPick[];
    }
  }
  return {
    sections,
    atAGlance: Array.isArray(parsed.atAGlance) ? parsed.atAGlance : [],
    rivals: Array.isArray(parsed.rivals) ? (parsed.rivals as Selection["rivals"]) : [],
  };
}

// Schadenfreude rides through the writing pass as a section of its own,
// so its stories get the same summaries (and cache) as everything else.
const RIVALS_SECTION: DigestSection = {
  id: "__rivals",
  type: "topic",
  label: "Schadenfreude",
  order: 999,
  articleCount: 3,
  prompt: "The reader follows this rival and enjoys their bad day: lead with what went wrong for them, plainly.",
};

/** One real, on-topic story per named rival. */
function rehydrateRivals(
  raw: Selection["rivals"],
  corpus: CorpusArticle[],
  rivals: string[],
): DigestArticle[] {
  const out: DigestArticle[] = [];
  const done = new Set<string>();
  for (const entry of raw) {
    const article = corpus[toIndex(entry.i)];
    const rival = rivals.find((r) => typeof entry.rival === "string" && r.toLowerCase() === entry.rival.toLowerCase());
    if (!article || !rival || done.has(rival)) continue;
    // The rival has to be in the story, not just in the model's reply.
    const hay = `${article.title} ${article.text}`.toLowerCase();
    const last = rival.toLowerCase().split(/\s+/).pop() ?? "";
    if (!hay.includes(rival.toLowerCase()) && !(last.length > 3 && hay.includes(last))) continue;
    done.add(rival);
    out.push({
      title: article.title,
      summary: "",
      source: article.source,
      url: article.url,
      publishedAt: article.postedAgo,
      ...(article.postedAt ? { postedAt: article.postedAt } : {}),
      priority: out.length + 1,
      group: rival,
    });
  }
  return out;
}

interface ArticlePage {
  text?: string;
  description?: string;
}

/**
 * Fetch each shortlisted page. Its text is kept only when the page is this
 * headline's; its description is kept either way, and checked where it's used.
 * Google News links are fetched at their decoded publisher URL; one that
 * didn't decode is skipped (its page is Google's, not the story).
 */
async function fullTextFor(articles: CorpusArticle[], links: Map<string, string>): Promise<Map<number, ArticlePage>> {
  const pages = await mapWithConcurrency(articles, 8, (a): Promise<FetchedArticle | null> => {
    const url = links.get(a.url) ?? a.url;
    return isGoogleNewsUrl(url) ? Promise.resolve(null) : fetchArticle(url, { maxChars: WRITING_TEXT_CHARS * 2, title: a.title });
  });
  const out = new Map<number, ArticlePage>();
  let fetched = 0;
  articles.forEach((a, n) => {
    const page = pages[n];
    if (!page) return;
    const text = page.text && page.matches ? page.text : undefined;
    if (text) fetched++;
    out.set(a.i, { ...(text ? { text } : {}), ...(page.description ? { description: page.description } : {}) });
  });
  recordExtra({ fullText: { attempted: articles.length, fetched } });
  return out;
}

/** Swap every printed Google News link for its publisher URL, where known. */
function applyLinks(lists: Array<Array<{ url: string }>>, links: Map<string, string>): void {
  if (links.size === 0) return;
  for (const list of lists) for (const a of list) a.url = links.get(a.url) ?? a.url;
}

/**
 * An article's code in the writing prompt. Not a number, so a slip in the
 * model's reply lands on nothing rather than on the next story along.
 */
function storyRef(url: string, taken: Set<string>): string {
  const hex = createHash("sha256").update(url).digest("hex");
  for (let n = 5; ; n++) {
    const ref = `s${hex.slice(0, n)}`;
    if (!taken.has(ref)) {
      taken.add(ref);
      return ref;
    }
  }
}

/**
 * Split articles into calls of about `size`, dealing each section's stories
 * out across them: two stories on one subject rarely share a call, which is
 * where the model could confuse them.
 */
function dealBatches(items: WritingItem[], size: number): WritingItem[][] {
  const count = Math.ceil(items.length / size);
  const bySection = [...items].sort((x, y) => (x.section?.id ?? "").localeCompare(y.section?.id ?? ""));
  const batches: WritingItem[][] = Array.from({ length: count }, () => []);
  bySection.forEach((item, n) => batches[n % count].push(item));
  return batches;
}

interface WriteLog {
  out: Map<number, Written>;
  /** Why a story has no summary yet, as a clause the page can print. */
  problems: Map<number, string>;
  /** Told to the model when it tries this story again. */
  notes: Map<number, string>;
  /** Articles whose call failed outright, so everything they need is asked again. */
  failed: Set<number>;
  calls: number;
  failedCalls: number;
  lastError?: string;
  crossed: number;
  rejected: number;
}

const emptyLog = (): WriteLog => ({ out: new Map(), problems: new Map(), notes: new Map(), failed: new Set(), calls: 0, failedCalls: 0, crossed: 0, rejected: 0 });

/** Several calls have failed and none has come back: Gemini is down for now. */
const geminiLooksDown = (log: WriteLog) => log.failedCalls >= 2 && log.failedCalls === log.calls;

/** What's wrong with this paragraph under this headline, or null when it stands. */
function summaryProblem(
  item: WritingItem,
  summary: string,
  headlines: string[],
  lastChance: boolean,
): { reason: string; note: string } | null {
  const title = item.article.title;
  if (summary.length < 40) return { reason: "what it wrote was too short", note: "It was too short." };
  // A crossed paragraph comes from another article's text. One drawn from this
  // article's own stands, even if a vaguer headline shares fewer of its words.
  const ownWords = item.text.length >= 300 && groundedIn(item.text, summary) >= 0.6;
  const other = ownWords ? null : fitsAnotherBetter(title, summary, headlines);
  if (other) {
    return { reason: "what it wrote fitted a different headline", note: `It read like a different story ("${other}"). Write only about this article.` };
  }
  if (looksOnTopic(title, summary)) return null;
  // A teaser or quote headline can share few words with a true summary. On the
  // second try, one shared word will do if the paragraph clearly comes from
  // this article's own text, and that text is itself about this headline.
  if (lastChance && headlineFit(title, summary) > 0 && fetchedTextMatches(title, item.text) && groundedIn(item.text, summary) >= 0.5) return null;
  return { reason: "what it wrote didn't match the headline", note: "It didn't name what the headline is about. Name the headline's main subject." };
}

/** One call to the writer. Records what it got; never throws. */
async function writeBatch(
  prefs: DigestPreferences,
  batch: WritingItem[],
  headlines: string[],
  lastChance: boolean,
  log: WriteLog,
): Promise<void> {
  // Don't queue the rest of the paper behind an outage.
  if (geminiLooksDown(log)) {
    for (const item of batch) {
      log.failed.add(item.article.i);
      if (item.needsSummary) log.problems.set(item.article.i, log.lastError ?? "the call to it failed");
    }
    return;
  }
  log.calls++;
  let entries: Array<{ ref?: unknown; about?: unknown; summary?: unknown; why?: unknown; gist?: unknown; headline?: unknown }>;
  try {
    const text = await generateJson(buildWritingPrompt(prefs, batch), {
      schema: WRITING_SCHEMA,
      temperature: 0.3,
      timeoutMs: WRITING_CALL_TIMEOUT_MS,
      label: "writing",
    });
    entries = (JSON.parse(text) as { items?: typeof entries }).items ?? [];
  } catch (err) {
    log.failedCalls++;
    log.lastError = geminiFailure(err);
    console.warn(`[digest] writing call failed (${batch.length} articles):`, err instanceof Error ? err.message.slice(0, 160) : err);
    for (const item of batch) {
      log.failed.add(item.article.i);
      if (item.needsSummary) log.problems.set(item.article.i, log.lastError);
    }
    return;
  }

  const byRef = new Map(batch.map((it) => [it.ref, it]));
  const answered = new Set<number>();
  for (const entry of entries) {
    const item = byRef.get(String(entry?.ref));
    if (!item) {
      log.crossed++;
      continue;
    }
    const i = item.article.i;
    answered.add(i);
    log.failed.delete(i);
    // The code and the headline it repeated must name the same story.
    if (!aboutMatches(item.article.title, entry.about)) {
      log.crossed++;
      console.warn("[digest] reply claimed another story:", item.article.title, "<-", entry.about);
      if (item.needsSummary) log.problems.set(i, "its answer pointed at a different story");
      continue;
    }
    const written: Written = { ...log.out.get(i) };
    if (item.needsSummary && typeof entry.summary === "string") {
      const summary = humanise(entry.summary);
      const problem = summaryProblem(item, summary, headlines, lastChance);
      if (problem) {
        log.rejected++;
        log.problems.set(i, problem.reason);
        log.notes.set(i, problem.note);
        console.warn(`[digest] summary rejected (${problem.reason}):`, item.article.title);
      } else {
        written.summary = summary;
        log.problems.delete(i);
        // "Why it matters" only rides along with a summary we kept.
        const why = typeof entry.why === "string" ? humanise(entry.why) : "";
        if (why.length >= 12 && why.length <= 220) written.why = why;
      }
    } else if (item.needsSummary) {
      log.problems.set(i, "it left the story out of its reply");
    }
    if (item.needsGist && typeof entry.gist === "string") {
      const gist = entry.gist.trim();
      if (gist.length >= 4 && gist.length <= 140 && !echoes(item.article.title, gist)) written.gist = gist;
    }
    if ((item.needsGist || item.needsHeadline) && typeof entry.headline === "string") {
      const headline = humanise(entry.headline).replace(/\.$/, "");
      if (headline.length >= 12 && headline.length <= 160 && looksOnTopic(item.article.title, headline)) written.headline = headline;
    }
    log.out.set(i, written);
  }
  for (const item of batch) {
    if (item.needsSummary && !answered.has(item.article.i)) log.problems.set(item.article.i, "it left the story out of its reply");
  }
}

/**
 * Write every item: all of them in small calls, then once more, in smaller
 * ones and with what went wrong spelled out, for whatever is still missing.
 */
async function writeAll(prefs: DigestPreferences, items: WritingItem[], headlines: string[]): Promise<WriteLog> {
  const log = emptyLog();
  const startedAt = Date.now();
  await mapWithConcurrency(dealBatches(items, WRITING_BATCH), WRITING_CONCURRENCY, (batch) =>
    writeBatch(prefs, batch, headlines, false, log),
  );

  const again = items.flatMap((item): WritingItem[] => {
    const i = item.article.i;
    const done = log.out.get(i);
    const noSummary = item.needsSummary && !done?.summary;
    if (!noSummary && !log.failed.has(i)) return [];
    const note = log.notes.get(i);
    return [{
      ...item,
      needsSummary: noSummary,
      needsGist: item.needsGist && !done?.gist,
      needsHeadline: item.needsHeadline && !done?.headline,
      ...(note ? { retryNote: note } : {}),
    }];
  });
  if (again.length > 0 && !geminiLooksDown(log) && Date.now() - startedAt < WRITING_BUDGET_MS) {
    await mapWithConcurrency(dealBatches(again, WRITING_RETRY_BATCH), WRITING_CONCURRENCY, (batch) =>
      writeBatch(prefs, batch, headlines, true, log),
    );
  }
  await repairCopy(log.out, items);
  return log;
}

const COPY_FIELDS = ["summary", "why", "gist"] as const;

const REPAIR_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          ref: { type: Type.STRING },
          summary: { type: Type.STRING, nullable: true },
          why: { type: Type.STRING, nullable: true },
          gist: { type: Type.STRING, nullable: true },
        },
        required: ["ref"],
      },
    },
  },
  required: ["items"],
};

/**
 * Copy that still carries an AI tell (copy-check.ts) goes back to the model
 * once, with the problems named; a rewrite is kept only when it has fewer
 * tells and stays on the story. Whatever is left gets the mechanical fixes.
 * The repair never blocks the edition: on any failure the copy stands.
 */
async function repairCopy(out: Map<number, Written>, items: WritingItem[]): Promise<void> {
  const byIndex = new Map(items.map((it) => [it.article.i, it]));
  const byRef = new Map(items.map((it) => [it.ref, it]));
  const flagged = [...out].flatMap(([i, w]) => {
    const problems = COPY_FIELDS.flatMap((f) => copyIssues(w[f]).map((p) => `${f}: ${p}`));
    return problems.length > 0 ? [{ i, w, problems }] : [];
  });
  const before = flagged.reduce((n, f) => n + f.problems.length, 0);
  let repaired = 0;

  if (flagged.length > 0) {
    const blocks = flagged
      .map(({ i, w, problems }) => {
        const fields = COPY_FIELDS.filter((f) => w[f]).map((f) => `<${f}>${escapeXmlText(w[f]!)}</${f}>`).join("\n");
        return `<item ref="${byIndex.get(i)?.ref ?? ""}">
<headline>${escapeXmlText(byIndex.get(i)?.article.title ?? "")}</headline>
${fields}
<problems>${problems.join("; ")}</problems>
</item>`;
      })
      .join("\n");
    try {
      const text = await generateJson(
        `These news items were written for a newspaper, but some sentences read as machine-written. Rewrite only the fields named in <problems>, fixing exactly those problems: no em dashes (use a comma, colon or full stop), none of the listed words (pick a plain, specific alternative), no ", highlighting..." style tails, no "not just X, but Y", no "experts say". Keep every fact, figure and name exactly as written, keep the length about the same, add nothing new. Return JSON "items" with "ref" and only the rewritten fields.

${blocks}`,
        { schema: REPAIR_SCHEMA, temperature: 0.2, timeoutMs: 30_000, label: "copy repair" },
      );
      const parsed = JSON.parse(text) as { items?: Array<Record<string, unknown>> };
      for (const entry of parsed.items ?? []) {
        const item = byRef.get(String(entry.ref));
        const w = item ? out.get(item.article.i) : undefined;
        if (!w || !item) continue;
        for (const f of COPY_FIELDS) {
          const next = typeof entry[f] === "string" ? humanise(entry[f] as string) : "";
          if (!next || !w[f]) continue;
          const fewer = copyIssues(next).length < copyIssues(w[f]).length;
          const onTopic = f !== "summary" || looksOnTopic(item.article.title, next);
          if (fewer && onTopic && next.length >= w[f]!.length * 0.6) {
            repaired += copyIssues(w[f]).length - copyIssues(next).length;
            w[f] = next;
          }
        }
      }
    } catch (err) {
      console.warn("[digest] copy repair skipped:", err);
    }
  }

  let fixed = 0;
  for (const w of out.values()) {
    for (const f of COPY_FIELDS) {
      const v = w[f];
      if (!v) continue;
      const clean = fixCopy(v);
      if (clean !== v) {
        fixed += Math.max(0, copyIssues(v).length - copyIssues(clean).length);
        w[f] = clean;
      }
    }
  }
  recordExtra({ copy: { issues: before, repaired, fixed } });
}

function escapeXmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Remembers what the writing pass already wrote, so rebuilding an edition
 * (Refresh edition, the morning cron, a stale rebuild) only writes articles
 * that are new — an unchanged story keeps the exact summary the reader saw.
 * Supplied by the caller (lib/server/editions.ts); absent means no reuse.
 */
interface Written {
  summary?: string;
  why?: string;
  gist?: string;
  /** A whole headline, when the feed's was cut off. */
  headline?: string;
}

export interface WritingCache {
  getMany(keys: string[]): Promise<Map<string, string>>;
  setMany(entries: Map<string, string>): Promise<void>;
}

// A summary is reusable only when everything that shaped it is the same:
// the article, the length, the voice, and the section's own guidance.
function summaryKey(prefs: DigestPreferences, article: CorpusArticle, section?: DigestSection): string {
  const guidance = section ? `${section.prompt ?? ""}|${section.type === "custom" ? section.instruction : ""}` : "";
  return (
    "sum:" +
    createHash("sha256")
      // "v2": summaries written together with the "why it matters" line.
      .update(["v2", article.url, prefs.global.summaryLengthWords, prefs.global.tone, guidance].join("|"))
      .digest("hex")
      .slice(0, 24)
  );
}

/** The "why it matters" line is written with its summary and keyed with it. */
function whyKey(prefs: DigestPreferences, article: CorpusArticle, section?: DigestSection): string {
  return "why:" + summaryKey(prefs, article, section).slice(4);
}

function gistKey(prefs: DigestPreferences, article: CorpusArticle): string {
  return (
    "gist:" +
    // "v2": gists that must add to the headline, written from the article.
    createHash("sha256").update(["v2", article.url, prefs.global.tone].join("|")).digest("hex").slice(0, 24)
  );
}

type WrittenPaper = Pick<DigestResult, "sections" | "atAGlance" | "rivals" | "briefs"> & { writing: WritingStatus };

async function aiDigest(
  prefs: DigestPreferences,
  corpus: CorpusArticle[],
  cache?: WritingCache,
): Promise<WrittenPaper> {
  const selection = await timed("selection", () => runSelection(prefs, corpus));

  const usedUrls = new Set<string>();
  const sections: Record<string, DigestArticle[]> = {};
  const sectionByUrl = new Map<string, DigestSection>();
  for (const section of prefs.sections) {
    sections[section.id] = rehydrateSection(
      section,
      selection.sections[section.id],
      corpus,
      usedUrls,
      prefs.global.watchTopics,
    );
    sections[section.id].forEach((a) => sectionByUrl.set(a.url, section));
  }
  // The model sometimes stops short. Top up plain topic sections from
  // their own wires so a section never prints thin when real stories exist.
  for (const section of prefs.sections) {
    if (section.type === "custom") continue;
    const list = sections[section.id];
    const target = sectionTarget(section);
    // Ask for extra candidates: a grouped section skips any it can't file.
    for (const a of backfillFor(section, corpus, usedUrls, prefs, (target - list.length) * 4)) {
      if (list.length >= target) break;
      // A grouped section files the story under the place it names.
      const group = section.type === "grouped" && isCitySection(section)
        ? section.groups.find((g) => g.toLowerCase() === a.pool.toLowerCase())
        : section.type === "grouped"
          ? (countryIn(a) ?? (list.length === target - 1 ? "World" : undefined))
          : isSportsSection(section)
            ? a.pool.toLowerCase()
            : undefined;
      if (section.type === "grouped") {
        if (!group) continue;
        // Spread the extra places around rather than piling onto one country.
        const already = list.filter((x) => x.group?.toLowerCase() === group.toLowerCase()).length;
        if (already >= section.articleCountPerGroup) continue;
      }
      usedUrls.add(a.url);
      list.push({
        title: a.title,
        summary: "",
        source: a.source,
        url: a.url,
        publishedAt: a.postedAgo,
        ...(a.postedAt ? { postedAt: a.postedAt } : {}),
        priority: list.length + 1,
        ...(group ? { group } : {}),
      });
      sectionByUrl.set(a.url, section);
    }
  }
  const atAGlance = rehydrateAtAGlance(selection.atAGlance, corpus);
  const rivals = rehydrateRivals(selection.rivals, corpus, prefs.global.rivals);
  if (rivals.length > 0) {
    sections[RIVALS_SECTION.id] = rivals;
    for (const a of rivals) if (!sectionByUrl.has(a.url)) sectionByUrl.set(a.url, RIVALS_SECTION);
  }
  return writePaper(prefs, corpus, sections, atAGlance, sectionByUrl, cache);
}

/**
 * Print the stories already chosen (by the editor, or by keyword rules when
 * the editor failed): reuse what's written, write the rest, mark the rest.
 */
async function writePaper(
  prefs: DigestPreferences,
  corpus: CorpusArticle[],
  sections: Record<string, DigestArticle[]>,
  atAGlance: AtAGlanceItem[],
  sectionByUrl: Map<string, DigestSection>,
  cache?: WritingCache,
): Promise<WrittenPaper> {
  // Everything that needs writing, once each: section articles need a
  // summary, glance picks a gist, and an article can need both.
  const indexByUrl = new Map(corpus.map((a) => [a.url, a.i]));
  const glanceUrls = new Set(atAGlance.map((g) => g.url));
  // In Brief: the leading stories nothing printed; each prints as a headline
  // alone, so it needs one that stands on its own.
  const missed = missedLeads(prefs, corpus, [...sectionByUrl.keys(), ...glanceUrls]);
  const briefUrls = new Set([...missed.values()].flat().map((a) => a.url));
  const gistUrls = glanceUrls;
  const shortlist = [...new Set([...sectionByUrl.keys(), ...gistUrls, ...briefUrls])]
    .map((url) => corpus[indexByUrl.get(url) ?? -1])
    .filter((a): a is CorpusArticle => Boolean(a));

  // Reuse anything already written for these exact articles and settings.
  const keysFor = (article: CorpusArticle) => ({
    summary: summaryKey(prefs, article, sectionByUrl.get(article.url)),
    why: whyKey(prefs, article, sectionByUrl.get(article.url)),
    gist: gistKey(prefs, article),
    headline: "head:" + gistKey(prefs, article).slice(5),
  });
  const wanted = shortlist.flatMap((a) => {
    const k = keysFor(a);
    return [
      ...(sectionByUrl.has(a.url) ? [k.summary, k.why] : []),
      ...(gistUrls.has(a.url) ? [k.gist] : []),
      ...(gistUrls.has(a.url) || briefUrls.has(a.url) ? [k.headline] : []),
    ];
  });
  const cached = cache ? await cache.getMany(wanted).catch(() => new Map<string, string>()) : new Map<string, string>();

  const written = new Map<number, Written>();
  for (const a of shortlist) {
    const k = keysFor(a);
    const summary = cached.get(k.summary);
    const why = cached.get(k.why);
    const gist = cached.get(k.gist);
    const headline = cached.get(k.headline);
    if (summary || gist || headline) written.set(a.i, { summary, why, gist, headline });
  }

  // Only what is still missing goes to the model — and only those pages
  // are fetched for full text.
  const pending = shortlist.filter(
    (a) =>
      (sectionByUrl.has(a.url) && !written.get(a.i)?.summary) ||
      (gistUrls.has(a.url) && !written.get(a.i)?.gist) ||
      (briefUrls.has(a.url) && !written.get(a.i)?.headline),
  );
  // Printed Google News links are decoded now: the publisher URL is both
  // what the reader should get and what full text needs.
  const links = await timed("links", () =>
    resolveGoogleLinks(shortlist.map((a) => a.url).filter(isGoogleNewsUrl)),
  );
  // Every line is written from the article: a feed's snippet is often just
  // the headline again, and a gist from it can only repeat it.
  const fullText = await timed("fullText", () => fullTextFor(pending, links));
  // An advert the snippet didn't give away shows itself in the article (or
  // in a summary already written from it): it comes off every list.
  const paid = new Set(
    shortlist
      .filter((a) => isSponsored("", `${fullText.get(a.i)?.text ?? ""} ${written.get(a.i)?.summary ?? ""}`, links.get(a.url) ?? ""))
      .map((a) => a.url),
  );
  if (paid.size > 0) {
    for (const key of Object.keys(sections)) sections[key] = sections[key].filter((a) => !paid.has(a.url));
    atAGlance.splice(0, atAGlance.length, ...atAGlance.filter((g) => !paid.has(g.url)));
    for (const [slot, list] of missed) missed.set(slot, list.filter((a) => !paid.has(a.url)));
  }
  const refs = new Set<string>();
  const items: WritingItem[] = pending.map((article) => ({
    ref: storyRef(article.url, refs),
    article,
    text: fullText.get(article.i)?.text ?? article.text,
    section: sectionByUrl.get(article.url),
    needsSummary: sectionByUrl.has(article.url) && !written.get(article.i)?.summary,
    needsGist: gistUrls.has(article.url) && !written.get(article.i)?.gist,
    needsHeadline: briefUrls.has(article.url) && !written.get(article.i)?.headline,
  }));

  const cachedSummaries = new Set([...written].filter(([, w]) => w.summary).map(([i]) => i));
  const log = items.length > 0
    ? await timed("writing", () => writeAll(prefs, items, shortlist.map((a) => a.title)))
    : emptyLog();
  const toStore = new Map<string, string>();
  for (const [i, out] of log.out) {
    const article = corpus[i];
    written.set(i, { ...written.get(i), ...out });
    if (out.summary) toStore.set(keysFor(article).summary, out.summary);
    if (out.why) toStore.set(keysFor(article).why, out.why);
    if (out.gist) toStore.set(keysFor(article).gist, out.gist);
    if (out.headline) toStore.set(keysFor(article).headline, out.headline);
    // A brief whose headline already stood on its own keeps it: stored as
    // it is, so the next rebuild doesn't ask again.
    else if (briefUrls.has(article.url)) toStore.set(keysFor(article).headline, article.title);
  }
  if (cache && toStore.size > 0) await cache.setMany(toStore).catch(() => {});

  const words = prefs.global.summaryLengthWords;
  for (const list of Object.values(sections)) {
    for (const a of list) {
      const idx = indexByUrl.get(a.url);
      if (idx === undefined) continue;
      const done = written.get(idx);
      a.written = Boolean(done?.summary);
      a.summary = done?.summary ?? fallbackText(corpus[idx], fullText.get(idx), words);
      if (done?.why) a.why = done.why;
    }
  }
  for (const g of atAGlance) {
    const idx = indexByUrl.get(g.url);
    const gist = idx === undefined ? undefined : written.get(idx)?.gist;
    if (gist) g.summary = gist;
  }
  const briefs = toBriefs(missed, (a) => written.get(a.i)?.headline);
  applyLinks([...Object.values(sections), atAGlance, ...Object.values(briefs ?? {})], links);

  // What the page and the build report say about how that went. (Links were
  // just swapped, so stories are matched back through the links map.)
  const originalUrl = new Map([...links].map(([from, to]) => [to, from]));
  const indexOf = (a: DigestArticle) => indexByUrl.get(a.url) ?? indexByUrl.get(originalUrl.get(a.url) ?? "") ?? -1;
  const stories = Object.values(sections).flat();
  const missing = stories.filter((a) => a.written === false);
  const reasonFor = (a: DigestArticle) => log.problems.get(indexOf(a)) ?? "it left the story out of its reply";
  const writing: WritingStatus = {
    stories: stories.length,
    unwritten: missing.length,
    ...(missing.length > 0 ? { reason: reasonFor(missing[0]) } : {}),
    attempts: 0,
    triedAt: new Date().toISOString(),
  };
  if (missing.length > 0) console.warn(`[digest] ${missing.length} of ${stories.length} stories unwritten: ${writing.reason}`);
  recordExtra({
    writing: writingReport(log, {
      stories: stories.length,
      cached: stories.filter((a) => cachedSummaries.has(indexOf(a))).length,
      unwritten: missing.map((a) => ({ title: a.title, reason: reasonFor(a) })),
    }),
  });

  const { [RIVALS_SECTION.id]: rivalStories = [], ...paperSections } = sections;
  return { sections: paperSections, atAGlance, rivals: rivalStories, briefs, writing };
}

function writingReport(log: WriteLog, counts: Pick<WritingReport, "stories" | "cached" | "unwritten">): WritingReport {
  return {
    ...counts,
    written: counts.stories - counts.cached - counts.unwritten.length,
    calls: log.calls,
    failedCalls: log.failedCalls,
    ...(log.lastError ? { lastError: log.lastError } : {}),
    crossed: log.crossed,
    rejected: log.rejected,
  };
}

/**
 * What prints under a headline Gemini didn't write: the publisher's own
 * description, else its feed snippet, and only when it plainly belongs to this
 * headline. Otherwise nothing, and the headline stands alone: a page's raw text
 * can be its navigation or a neighbouring story, and is never printed.
 */
function fallbackText(article: CorpusArticle, page: ArticlePage | undefined, words: number): string {
  const description = page?.description;
  if (description && description.length >= 60 && looksOnTopic(article.title, description)) return description;
  if (article.text && looksOnTopic(article.title, article.text)) return heuristicSummary(article, words);
  return "";
}

/**
 * Ask Gemini again for the stories a stored edition still has no paragraph
 * for, and patch them in. Nothing else about the paper changes, so a repair
 * can land while it's being read. Returns a new digest; a failed call just
 * leaves the stories unwritten.
 */
export async function writeMissing(
  prefs: DigestPreferences,
  digest: DigestResult,
  cache?: WritingCache,
): Promise<{ digest: DigestResult; report: WritingReport }> {
  const sections = Object.fromEntries(Object.entries(digest.sections).map(([id, list]) => [id, list.map((a) => ({ ...a }))]));
  const rivals = (digest.rivals ?? []).map((a) => ({ ...a }));
  const sectionOf = new Map<DigestArticle, DigestSection | undefined>();
  for (const [id, list] of Object.entries(sections)) {
    const section = prefs.sections.find((sec) => sec.id === id);
    for (const a of list) sectionOf.set(a, section);
  }
  for (const a of rivals) sectionOf.set(a, RIVALS_SECTION);
  const stories = [...sectionOf.keys()];
  const open = stories.filter((a) => a.written === false);

  // The corpus is gone by now; each story stands in as a corpus article, with
  // the text it prints today as its snippet.
  const corpus = open.map((a, i): CorpusArticle => ({
    i,
    title: a.title,
    text: a.summary,
    url: a.url,
    source: a.source,
    pool: "",
    postedAgo: a.publishedAt,
    ageHours: null,
  }));
  const keyOf = (c: CorpusArticle) => summaryKey(prefs, c, sectionOf.get(open[c.i]));
  const place = (a: DigestArticle, summary: string, why?: string) => {
    a.summary = summary;
    a.written = true;
    if (why) a.why = why;
  };
  // A rebuild, or another edition with the same settings, may have written it.
  const cached = cache
    ? await cache.getMany(corpus.map(keyOf)).catch(() => new Map<string, string>())
    : new Map<string, string>();
  const pending = corpus.filter((c) => {
    const found = cached.get(keyOf(c));
    if (found) place(open[c.i], found);
    return !found;
  });

  const pages = await fullTextFor(pending, new Map());
  const refs = new Set<string>();
  const items: WritingItem[] = pending.map((article) => ({
    ref: storyRef(article.url, refs),
    article,
    text: pages.get(article.i)?.text ?? article.text,
    section: sectionOf.get(open[article.i]),
    needsSummary: true,
    needsGist: false,
  }));
  const log = items.length > 0 ? await writeAll(prefs, items, stories.map((a) => a.title)) : emptyLog();
  const toStore = new Map<string, string>();
  for (const [i, out] of log.out) {
    if (!out.summary) continue;
    place(open[i], out.summary, out.why);
    const key = keyOf(corpus[i]);
    toStore.set(key, out.summary);
    if (out.why) toStore.set(`why:${key.slice(4)}`, out.why);
  }
  if (cache && toStore.size > 0) await cache.setMany(toStore).catch(() => {});

  const missing = open.filter((a) => a.written === false);
  const reasonFor = (a: DigestArticle) => log.problems.get(open.indexOf(a)) ?? log.lastError ?? "it left the story out of its reply";
  const status: WritingStatus = { ...(digest.writing ?? { attempts: 0, triedAt: "", stories: stories.length, unwritten: 0 }) };
  delete status.reason;
  return {
    digest: {
      ...digest,
      sections,
      rivals,
      writing: { ...status, unwritten: missing.length, ...(missing.length > 0 ? { reason: reasonFor(missing[0]) } : {}) },
    },
    report: writingReport(log, {
      stories: stories.length,
      cached: stories.length - pending.length,
      unwritten: missing.map((a) => ({ title: a.title, reason: reasonFor(a) })),
    }),
  };
}

// Places a World story can be filed under when it's added without the
// editor. Checked against the headline, first match wins.
const COUNTRIES = [
  "United States", "China", "India", "United Kingdom", "Japan", "Russia", "Ukraine", "Israel", "Iran",
  "Pakistan", "Bangladesh", "Sri Lanka", "Nepal", "Afghanistan", "Saudi Arabia", "Qatar", "Turkey",
  "Syria", "Iraq", "Lebanon", "Egypt", "South Africa", "Nigeria", "Kenya", "Ethiopia", "Congo",
  "France", "Germany", "Italy", "Spain", "Poland", "Netherlands", "Ireland", "Iceland", "Greece",
  "Canada", "Mexico", "Brazil", "Argentina", "Chile", "Venezuela", "Australia", "New Zealand",
  "Indonesia", "Malaysia", "Singapore", "Thailand", "Vietnam", "Philippines", "South Korea",
  "North Korea", "Taiwan", "Myanmar",
];

function countryIn(article: CorpusArticle): string | undefined {
  const hay = article.title.toLowerCase();
  return COUNTRIES.find((c) => {
    const aliases = GROUP_ALIASES[c.toLowerCase()] ?? [];
    return [c.toLowerCase(), ...aliases].some((t) => hasTerm(hay, t));
  });
}

// Headlines that are formats, not news — never used to top up a section.
const NOT_NEWS = /\b(quiz|live|as it happened|how to watch|where to watch|best .* (deals?|to buy)|deals?|odds|predictions?|betting|gallery|in pictures|podcast|newsletter)\b/i;

/** Fresh, unused articles from the section's own wires, best first. */
function backfillFor(
  section: DigestSection,
  corpus: CorpusArticle[],
  used: Set<string>,
  prefs: DigestPreferences,
  wanted: number,
): CorpusArticle[] {
  if (wanted <= 0) return [];
  // Sports sections only top up an F1 desk from the F1 wire; mixed sports
  // desks are left to the editor.
  const pools = section.type === "grouped" && isCitySection(section)
    ? section.groups
    : isSportsSection(section)
    ? /f1|formula/i.test(`${section.id} ${section.label}`)
      ? ["F1"]
      : []
    : (POOL_HINTS[section.id.toLowerCase()]?.slice(0, 1) ?? []);
  if (pools.length === 0) return [];
  const exclude = [...prefs.global.excludeKeywords, ...(section.excludeKeywords ?? [])].map((k) => k.toLowerCase());
  return corpus
    .filter((a) => pools.includes(a.pool) && !used.has(a.url) && !NOT_NEWS.test(a.title))
    .filter((a) => !exclude.some((k) => `${a.title} ${a.text}`.toLowerCase().includes(k)))
    .sort((x, y) => (x.ageHours ?? 99) - (y.ageHours ?? 99))
    .slice(0, wanted);
}

// ---- heuristic fallback (no AI configured) -----------------------------------

const POOL_HINTS: Record<string, string[]> = {
  f1: ["F1"],
  sports: ["F1", "Football", "Tennis"],
  markets: ["Markets", "Money", "World"],
  world: ["World", "Markets"],
  india: ["India"],
  tech: ["Tech"],
};

const SPORT_POOLS = new Set(["F1", "Football", "Tennis"]);

function keywordScore(article: CorpusArticle, keywords: string[]): number {
  const title = article.title.toLowerCase();
  const text = article.text.toLowerCase();
  let score = 0;
  for (const k of keywords) {
    const term = k.toLowerCase().trim();
    if (!term) continue;
    if (title.includes(term)) score += 12;
    else if (text.includes(term)) score += 6;
  }
  return score;
}

function heuristicSummary(article: CorpusArticle, words: number): string {
  const text = (article.text || article.title).replace(/\s+/g, " ").trim();
  const parts = text.split(/\.\s+/);
  let out = "";
  for (const p of parts) {
    if (out && (out.match(/\s/g)?.length ?? 0) > words) break;
    out += (out ? ". " : "") + p.replace(/\.$/, "");
  }
  const finalWords = out.split(/\s+/);
  return finalWords.length > words + 8
    ? finalWords.slice(0, words + 8).join(" ") + "…"
    : out || article.title;
}

function heuristicDigest(
  prefs: DigestPreferences,
  corpus: CorpusArticle[],
): Record<string, DigestArticle[]> {
  const used = new Set<string>();
  const result: Record<string, DigestArticle[]> = {};
  // collectCorpus() already applied the age window.
  const fresh = corpus;

  for (const section of [...prefs.sections].sort((a, b) => a.order - b.order)) {
    const exclude = [
      ...prefs.global.excludeKeywords,
      ...(section.excludeKeywords ?? []),
    ];
    const pools = POOL_HINTS[section.id.toLowerCase()] ?? [];
    const candidates = fresh.filter((a) => {
      if (used.has(a.url)) return false;
      if (exclude.some((k) => `${a.title} ${a.text}`.toLowerCase().includes(k.toLowerCase())))
        return false;
      if (section.slot === "paddock-notes" && !SPORT_POOLS.has(a.pool)) return false;
      return true;
    });

    const score = (a: CorpusArticle): number => {
      let s = 0;
      if (pools.length > 0) s += pools.includes(a.pool) ? 18 : -40;
      s += keywordScore(a, prefs.global.watchTopics) * 3;
      s += keywordScore(a, section.watchEntities ?? []) * 3;
      s += keywordScore(a, [section.label]);
      if ((section.preferredSources ?? []).some((d) => a.source.includes(d))) s += 8;
      if (a.ageHours !== null) s += Math.max(0, 5 - a.ageHours / 8);
      return s;
    };

    const ranked = candidates
      .map((a) => ({ a, s: score(a) }))
      .filter((x) => x.s > 0 || pools.length === 0)
      .sort((x, y) => y.s - x.s)
      .map((x) => x.a);

    const push = (a: CorpusArticle, priority: number, group?: string) => {
      used.add(a.url);
      const haystack = `${a.title} ${a.text}`.toLowerCase();
      const matchedEntity = section.watchEntities?.find((e) =>
        haystack.includes(e.toLowerCase()),
      );
      result[section.id].push({
        title: a.title,
        summary: heuristicSummary(a, prefs.global.summaryLengthWords),
        source: a.source,
        url: a.url,
        publishedAt: a.postedAgo,
        ...(a.postedAt ? { postedAt: a.postedAt } : {}),
        priority,
        ...(group ? { group } : {}),
        ...(matchedEntity ? { matchedEntity } : {}),
      });
    };

    result[section.id] = [];

    if (section.type === "grouped") {
      for (const group of section.groups) {
        let count = 0;
        for (const a of ranked) {
          if (count >= section.articleCountPerGroup) break;
          if (used.has(a.url)) continue;
          if (mentionsGroup(a, group)) {
            push(a, count + 1, group);
            count++;
          }
        }
      }
      result[section.id].sort((a, b) =>
        (section.groups.indexOf(a.group ?? "") - section.groups.indexOf(b.group ?? "")) ||
        a.priority - b.priority,
      );
    } else {
      const cap = section.type === "custom" ? section.articleCount : section.articleCount;
      ranked.slice(0, cap).forEach((a, i) => {
        let group: string | undefined;
        if (section.slot === "paddock-notes") {
          group = a.pool === "Football" ? "football" : a.pool === "Tennis" ? "tennis" : "f1";
        }
        push(a, i + 1, group);
      });
    }
  }

  return result;
}

/**
 * "At a Glance" for the no-AI path: the sections were already ranked by the
 * reader's preferences, so round-robin their top stories (best of each
 * section in order, then runner-ups) until 6 picks — mirroring the AI
 * overlay without a second opinion source.
 */
function heuristicAtAGlance(
  prefs: DigestPreferences,
  sections: Record<string, DigestArticle[]>,
  corpus: CorpusArticle[],
): AtAGlanceItem[] {
  const MAX_PICKS = 6;
  const poolByUrl = new Map(corpus.map((a) => [a.url, a.pool]));
  const ordered = [...prefs.sections].sort((a, b) => a.order - b.order);
  const out: AtAGlanceItem[] = [];
  const seen = new Set<string>();

  for (let rank = 0; out.length < MAX_PICKS; rank++) {
    let tookAny = false;
    for (const section of ordered) {
      const article = (sections[section.id] ?? [])[rank];
      if (!article || seen.has(article.url)) continue;
      seen.add(article.url);
      tookAny = true;
      out.push({
        title: article.title,
        summary: article.title,
        source: article.source,
        url: article.url,
        publishedAt: article.publishedAt,
        ...(article.postedAt ? { postedAt: article.postedAt } : {}),
        pool: poolByUrl.get(article.url) ?? "World",
      });
      if (out.length >= MAX_PICKS) break;
    }
    if (!tookAny) break;
  }

  return out;
}

// ---- public entry point --------------------------------------------------------

/** What a printed paper is made of: stories, publishers, Google wrappers left. */
function printedStats(result: Pick<DigestResult, "sections" | "atAGlance" | "rivals">): NonNullable<BuildReport["printed"]> {
  const all = [...Object.values(result.sections).flat(), ...(result.rivals ?? []), ...(result.atAGlance ?? [])];
  const unique = new Map(all.map((a) => [a.url, a]));
  const domains = new Set([...unique.values()].map((a) => a.source));
  const viaGoogle = [...unique.keys()].filter(isGoogleNewsUrl).length;
  return { stories: unique.size, domains: domains.size, viaGoogle };
}

export async function generateDigest(
  prefs: DigestPreferences,
  opts: { writingCache?: WritingCache } = {},
): Promise<DigestResult & { report: BuildReport }> {
  const collector = startCollector();
  const startedAt = Date.now();
  return runWithCollector(collector, async () => {
    const corpus = await timed("collect", () => collectCorpus(prefs));
    const generatedAt = new Date().toISOString();
    const pools: Record<string, number> = {};
    for (const a of corpus) pools[a.pool] = (pools[a.pool] ?? 0) + 1;

    const finish = (result: DigestResult): DigestResult & { report: BuildReport } => {
      recordExtra({ printed: printedStats(result), ...(result.engine === "ai" ? { model: summaryModels()[0] } : {}) });
      return { ...result, report: finishReport(collector, { startedAt, engine: result.engine, pools, corpus: corpus.length }) };
    };

    const heuristic = async (): Promise<DigestResult> => {
      const sections = heuristicDigest(prefs, corpus);
      const atAGlance = heuristicAtAGlance(prefs, sections, corpus);
      const missed = missedLeads(prefs, corpus, [...Object.values(sections).flat(), ...atAGlance].map((a) => a.url));
      const briefs = toBriefs(missed);
      const links = await resolveGoogleLinks(
        [...Object.values(sections).flat(), ...atAGlance, ...Object.values(briefs ?? {}).flat()].map((a) => a.url).filter(isGoogleNewsUrl),
      );
      applyLinks([...Object.values(sections), atAGlance, ...Object.values(briefs ?? {})], links);
      return { sections, atAGlance, briefs, generatedAt, engine: "heuristic", corpusSize: corpus.length };
    };

    if (!aiEnabled() || corpus.length === 0) {
      recordExtra({ fallback: corpus.length === 0 ? "empty corpus" : "AI not configured" });
      const paper = await heuristic();
      const count = Object.values(paper.sections).flat().length;
      return finish(aiEnabled() ? paper : { ...paper, writing: { stories: count, unwritten: 0, disabled: true, attempts: 0, triedAt: generatedAt } });
    }

    try {
      const paper = await aiDigest(prefs, corpus, opts.writingCache);
      return finish({ ...paper, generatedAt, engine: "ai", corpusSize: corpus.length });
    } catch (err) {
      // The editor failed, not necessarily the writer: keyword rules choose
      // the stories and Gemini still gets to write them.
      console.error("[digest] AI selection failed, keyword rules pick instead:", err);
      recordExtra({ fallback: err instanceof Error ? err.message.slice(0, 160) : "AI selection failed" });
      const selectionFailed = geminiFailure(err);
      const sections = heuristicDigest(prefs, corpus);
      const atAGlance = heuristicAtAGlance(prefs, sections, corpus);
      const sectionByUrl = new Map<string, DigestSection>();
      for (const section of prefs.sections) for (const a of sections[section.id] ?? []) sectionByUrl.set(a.url, section);
      const paper = await writePaper(prefs, corpus, sections, atAGlance, sectionByUrl, opts.writingCache);
      return finish({ ...paper, writing: { ...paper.writing, selectionFailed }, generatedAt, engine: "heuristic", corpusSize: corpus.length });
    }
  });
}
