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
//   4. Writing pass — the model writes each summary / gist from that text.
//
// Both passes answer with corpus indices; we rehydrate real article
// metadata, so no link can be invented. Every step degrades on its own:
// no model → deterministic heuristic; selection fails → heuristic; writing
// fails → the selection stands with summaries condensed from the article.

import { createHash } from "node:crypto";
import { aiEnabled, generateJson, Type, type Schema } from "@/lib/server/gemini";
import { dedupeWires } from "./rss";
import { getWorldIndiaWire, getIndiaWire, getMarketsWire, getMoneyWire } from "./news";
import { getSignalStories, matchSignal, missingLeads, signalIndex } from "./signals";
import { isGoogleNewsUrl, resolveGoogleLinks } from "./google-links";
import { finishReport, recordExtra, runWithCollector, startCollector, timed, type BuildReport } from "./build-report";
import { copyIssues, fixCopy } from "./copy-check";
import { getF1News } from "./f1-news";
import { getFootballNews } from "./football-news";
import { getTennisNews } from "./tennis-news";
import { getTechNews } from "./tech-news";
import { cityAliases, getCityWire } from "./cities";
import { fetchArticleText, fetchedTextMatches, humanise, looksOnTopic } from "./summarize";
import { buildSelectionPrompt, buildWritingPrompt, isCitySection, isSportsSection, WRITING_TEXT_CHARS, type WritingItem, sectionTarget } from "@/lib/preferences/prompt";
import type {
  AtAGlanceItem,
  CorpusArticle,
  DigestArticle,
  DigestPreferences,
  DigestResult,
  DigestSection,
} from "@/lib/preferences/types";
import type { WireBrief } from "@/lib/types";

const SELECTION_TIMEOUT_MS = 45_000;
const WRITING_TIMEOUT_MS = 70_000;
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
        ageHours: parseAgeHours(b.postedAgo),
      };
    })
    .filter((a) => {
      if (a.ageHours !== null && a.ageHours > maxAge) return false;
      if (isLiveBlog(a.title, a.url)) return false;
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
          i: { type: Type.INTEGER },
          summary: { type: Type.STRING, nullable: true },
          why: { type: Type.STRING, nullable: true },
          gist: { type: Type.STRING, nullable: true },
        },
        required: ["i"],
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
      priority: out.length + 1,
      group: rival,
    });
  }
  return out;
}

/**
 * Fetch each shortlisted page; keep it only when it matches its headline.
 * Google News links are fetched at their decoded publisher URL; one that
 * didn't decode is skipped (its page is Google's, not the story).
 */
async function fullTextFor(articles: CorpusArticle[], links: Map<string, string>): Promise<Map<number, string>> {
  const texts = await mapWithConcurrency(articles, 8, (a) => {
    const url = links.get(a.url) ?? a.url;
    return isGoogleNewsUrl(url) ? Promise.resolve(null) : fetchArticleText(url, WRITING_TEXT_CHARS * 2);
  });
  const out = new Map<number, string>();
  articles.forEach((a, n) => {
    const fetched = texts[n];
    if (fetched && fetchedTextMatches(a.title, fetched)) out.set(a.i, fetched);
  });
  recordExtra({ fullText: { attempted: articles.length, fetched: out.size } });
  return out;
}

/** Swap every printed Google News link for its publisher URL, where known. */
function applyLinks(lists: Array<Array<{ url: string }>>, links: Map<string, string>): void {
  if (links.size === 0) return;
  for (const list of lists) for (const a of list) a.url = links.get(a.url) ?? a.url;
}

async function runWriting(
  prefs: DigestPreferences,
  items: WritingItem[],
): Promise<Map<number, Written>> {
  const text = await generateJson(buildWritingPrompt(prefs, items), {
    schema: WRITING_SCHEMA,
    temperature: 0.3,
    timeoutMs: WRITING_TIMEOUT_MS,
    label: "writing",
  });
  const parsed = JSON.parse(text) as {
    items?: Array<{ i?: unknown; summary?: unknown; why?: unknown; gist?: unknown }>;
  };
  const byIndex = new Map(items.map((it) => [it.article.i, it]));
  const out = new Map<number, Written>();

  for (const entry of parsed?.items ?? []) {
    const item = byIndex.get(toIndex(entry?.i));
    if (!item) continue;
    const written: Written = {};
    if (item.needsSummary && typeof entry.summary === "string") {
      const summary = humanise(entry.summary);
      // Reject thin or drifted paragraphs — the fallback below is better
      // than a summary of the wrong story under this headline.
      if (summary.length >= 40 && looksOnTopic(item.article.title, summary)) {
        written.summary = summary;
        // "Why it matters" only rides along with a summary we kept.
        const why = typeof entry.why === "string" ? humanise(entry.why) : "";
        if (why.length >= 12 && why.length <= 220) written.why = why;
      }
    }
    if (item.needsGist && typeof entry.gist === "string") {
      const gist = entry.gist.trim();
      if (gist.length >= 4 && gist.length <= 140) written.gist = gist;
    }
    out.set(item.article.i, written);
  }
  return repairCopy(out, byIndex);
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
          i: { type: Type.INTEGER },
          summary: { type: Type.STRING, nullable: true },
          why: { type: Type.STRING, nullable: true },
          gist: { type: Type.STRING, nullable: true },
        },
        required: ["i"],
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
async function repairCopy(out: Map<number, Written>, byIndex: Map<number, WritingItem>): Promise<Map<number, Written>> {
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
        return `<item i="${i}">
<headline>${escapeXmlText(byIndex.get(i)?.article.title ?? "")}</headline>
${fields}
<problems>${problems.join("; ")}</problems>
</item>`;
      })
      .join("\n");
    try {
      const text = await generateJson(
        `These news items were written for a newspaper, but some sentences read as machine-written. Rewrite only the fields named in <problems>, fixing exactly those problems: no em dashes (use a comma, colon or full stop), none of the listed words (pick a plain, specific alternative), no ", highlighting..." style tails, no "not just X, but Y", no "experts say". Keep every fact, figure and name exactly as written, keep the length about the same, add nothing new. Return JSON "items" with "i" and only the rewritten fields.

${blocks}`,
        { schema: REPAIR_SCHEMA, temperature: 0.2, timeoutMs: 30_000, label: "copy repair" },
      );
      const parsed = JSON.parse(text) as { items?: Array<Record<string, unknown>> };
      for (const entry of parsed.items ?? []) {
        const i = toIndex(entry.i);
        const w = out.get(i);
        const item = byIndex.get(i);
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
  return out;
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
    createHash("sha256").update([article.url, prefs.global.tone].join("|")).digest("hex").slice(0, 24)
  );
}

async function aiDigest(
  prefs: DigestPreferences,
  corpus: CorpusArticle[],
  cache?: WritingCache,
): Promise<Pick<DigestResult, "sections" | "atAGlance" | "rivals">> {
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

  // Everything that needs writing, once each: section articles need a
  // summary, glance picks a gist, and an article can need both.
  const indexByUrl = new Map(corpus.map((a) => [a.url, a.i]));
  const glanceUrls = new Set(atAGlance.map((g) => g.url));
  const shortlist = [...new Set([...sectionByUrl.keys(), ...glanceUrls])]
    .map((url) => corpus[indexByUrl.get(url) ?? -1])
    .filter((a): a is CorpusArticle => Boolean(a));

  // Reuse anything already written for these exact articles and settings.
  const keysFor = (article: CorpusArticle) => ({
    summary: summaryKey(prefs, article, sectionByUrl.get(article.url)),
    why: whyKey(prefs, article, sectionByUrl.get(article.url)),
    gist: gistKey(prefs, article),
  });
  const wanted = shortlist.flatMap((a) => {
    const k = keysFor(a);
    return [
      ...(sectionByUrl.has(a.url) ? [k.summary, k.why] : []),
      ...(glanceUrls.has(a.url) ? [k.gist] : []),
    ];
  });
  const cached = cache ? await cache.getMany(wanted).catch(() => new Map<string, string>()) : new Map<string, string>();

  const written = new Map<number, Written>();
  for (const a of shortlist) {
    const k = keysFor(a);
    const summary = cached.get(k.summary);
    const why = cached.get(k.why);
    const gist = cached.get(k.gist);
    if (summary || gist) written.set(a.i, { summary, why, gist });
  }

  // Only what is still missing goes to the model — and only those pages
  // are fetched for full text.
  const pending = shortlist.filter(
    (a) =>
      (sectionByUrl.has(a.url) && !written.get(a.i)?.summary) ||
      (glanceUrls.has(a.url) && !written.get(a.i)?.gist),
  );
  // Printed Google News links are decoded now: the publisher URL is both
  // what the reader should get and what full text needs.
  const links = await timed("links", () =>
    resolveGoogleLinks(shortlist.map((a) => a.url).filter(isGoogleNewsUrl)),
  );
  const fullText = await timed("fullText", () => fullTextFor(pending, links));
  const items: WritingItem[] = pending.map((article) => ({
    article,
    text: fullText.get(article.i) ?? article.text,
    section: sectionByUrl.get(article.url),
    needsSummary: sectionByUrl.has(article.url) && !written.get(article.i)?.summary,
    needsGist: glanceUrls.has(article.url) && !written.get(article.i)?.gist,
  }));

  try {
    if (items.length > 0) {
      const fresh = await timed("writing", () => runWriting(prefs, items));
      const toStore = new Map<string, string>();
      for (const [i, out] of fresh) {
        const article = corpus[i];
        const merged = { ...written.get(i), ...out };
        written.set(i, merged);
        if (out.summary) toStore.set(keysFor(article).summary, out.summary);
        if (out.why) toStore.set(keysFor(article).why, out.why);
        if (out.gist) toStore.set(keysFor(article).gist, out.gist);
      }
      if (cache && toStore.size > 0) await cache.setMany(toStore).catch(() => {});
    }
  } catch (err) {
    // The selection is still the reader's edition — print it with summaries
    // condensed from the article text rather than throwing it away.
    console.error("[digest] writing pass failed, keeping selection:", err);
  }

  const itemByUrl = new Map(items.map((it) => [it.article.url, it]));
  const words = prefs.global.summaryLengthWords;
  for (const list of Object.values(sections)) {
    for (const a of list) {
      const idx = indexByUrl.get(a.url);
      if (idx === undefined) continue;
      const item = itemByUrl.get(a.url);
      a.summary =
        written.get(idx)?.summary ??
        heuristicSummary({ ...corpus[idx], text: item?.text ?? corpus[idx].text }, words);
      const why = written.get(idx)?.why;
      if (why) a.why = why;
    }
  }
  for (const g of atAGlance) {
    const idx = indexByUrl.get(g.url);
    const gist = idx === undefined ? undefined : written.get(idx)?.gist;
    if (gist) g.summary = gist;
  }
  applyLinks([...Object.values(sections), atAGlance], links);

  const { [RIVALS_SECTION.id]: rivalStories = [], ...paperSections } = sections;
  return { sections: paperSections, atAGlance, rivals: rivalStories };
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
      recordExtra({ printed: printedStats(result), ...(result.engine === "ai" ? { model: process.env.GEMINI_MODEL || "default" } : {}) });
      return { ...result, report: finishReport(collector, { startedAt, engine: result.engine, pools, corpus: corpus.length }) };
    };

    const heuristic = async (): Promise<DigestResult> => {
      const sections = heuristicDigest(prefs, corpus);
      const atAGlance = heuristicAtAGlance(prefs, sections, corpus);
      const links = await resolveGoogleLinks(
        [...Object.values(sections).flat(), ...atAGlance].map((a) => a.url).filter(isGoogleNewsUrl),
      );
      applyLinks([...Object.values(sections), atAGlance], links);
      return { sections, atAGlance, generatedAt, engine: "heuristic", corpusSize: corpus.length };
    };

    if (!aiEnabled() || corpus.length === 0) {
      recordExtra({ fallback: corpus.length === 0 ? "empty corpus" : "AI not configured" });
      return finish(await heuristic());
    }

    try {
      const { sections, atAGlance, rivals } = await aiDigest(prefs, corpus, opts.writingCache);
      return finish({ sections, atAGlance, rivals, generatedAt, engine: "ai", corpusSize: corpus.length });
    } catch (err) {
      console.error("[digest] AI selection failed, falling back to heuristic:", err);
      recordExtra({ fallback: err instanceof Error ? err.message.slice(0, 160) : "AI selection failed" });
      return finish(await heuristic());
    }
  });
}
