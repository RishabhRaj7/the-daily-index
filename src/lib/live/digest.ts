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

import { GoogleGenerativeAI, SchemaType, type ResponseSchema } from "@google/generative-ai";
import { dedupeWires } from "./rss";
import { getWorldIndiaWire, getMarketsWire } from "./news";
import { getF1News } from "./f1-news";
import { getFootballNews } from "./football-news";
import { getTennisNews } from "./tennis-news";
import { getTechNews } from "./tech-news";
import { fetchArticleText, fetchedTextMatches, humanise, looksOnTopic } from "./summarize";
import {
  buildSelectionPrompt,
  buildWritingPrompt,
  isSportsSection,
  WRITING_TEXT_CHARS,
  type WritingItem,
} from "@/lib/preferences/prompt";
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

function aiEnabled(): boolean {
  return process.env.AI_SUMMARIZE !== "false" && Boolean(process.env.GEMINI_API_KEY);
}

// Structured output: the model must answer in exactly this shape, so there
// are no markdown fences or stray prose to strip before parsing.
function getModel(schema: ResponseSchema, temperature: number) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  return new GoogleGenerativeAI(key).getGenerativeModel({
    model: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature,
    },
  });
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

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

/**
 * Collate every news wire into one deduplicated corpus of RSS excerpts, then
 * drop what the reader's preferences rule out deterministically: articles
 * past the age window and literal global exclude keywords. The model never has to spend attention on either.
 *
 * `i` always equals the article's position in the returned array.
 */
export async function collectCorpus(prefs: DigestPreferences): Promise<CorpusArticle[]> {
  const [world, markets, f1, football, tennis, tech] = await Promise.all([
    getWorldIndiaWire(24),
    getMarketsWire(20),
    getF1News(20),
    getFootballNews(20),
    getTennisNews(20),
    getTechNews(20),
  ]);

  const pooled = [
    ...tagPool(world, "World"),
    ...tagPool(markets, "Markets"),
    ...tagPool(f1, "F1"),
    ...tagPool(football, "Football"),
    ...tagPool(tennis, "Tennis"),
    ...tagPool(tech, "Tech"),
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

  return dedupeWires(unique)
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
      const hay = `${a.title} ${a.text}`.toLowerCase();
      return !excluded.some((k) => hay.includes(k));
    })
    .map((a, i) => ({ ...a, i }));
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
      group = section.groups.find((x) => x.toLowerCase() === g.toLowerCase());
      if (group && !mentionsGroup(article, group)) group = undefined;
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
      if (count >= section.articleCountPerGroup) return;
      perGroup.set(key, count + 1);
    } else if (out.length >= section.articleCount) {
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

const SELECTION_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    sections: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          id: { type: SchemaType.STRING },
          picks: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                i: { type: SchemaType.INTEGER },
                priority: { type: SchemaType.INTEGER },
                group: { type: SchemaType.STRING, nullable: true },
              },
              required: ["i", "priority"],
            },
          },
        },
        required: ["id", "picks"],
      },
    },
    atAGlance: { type: SchemaType.ARRAY, items: { type: SchemaType.INTEGER } },
  },
  required: ["sections", "atAGlance"],
};

const WRITING_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    items: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          i: { type: SchemaType.INTEGER },
          summary: { type: SchemaType.STRING, nullable: true },
          gist: { type: SchemaType.STRING, nullable: true },
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
}

async function runSelection(prefs: DigestPreferences, corpus: CorpusArticle[]): Promise<Selection> {
  const model = getModel(SELECTION_SCHEMA, 0.2);
  if (!model) throw new Error("model unavailable");
  const response = await withTimeout(
    model.generateContent(buildSelectionPrompt(prefs, corpus)),
    SELECTION_TIMEOUT_MS,
    "selection",
  );
  const parsed = JSON.parse(response.response.text()) as {
    sections?: Array<{ id?: unknown; picks?: unknown }>;
    atAGlance?: unknown;
  };
  if (!Array.isArray(parsed?.sections)) throw new Error("selection missing sections");
  const sections: Record<string, RawPick[]> = {};
  for (const entry of parsed.sections) {
    if (typeof entry?.id === "string" && Array.isArray(entry.picks)) {
      sections[entry.id] = entry.picks as RawPick[];
    }
  }
  return { sections, atAGlance: Array.isArray(parsed.atAGlance) ? parsed.atAGlance : [] };
}

/** Fetch each shortlisted page; keep it only when it matches its headline. */
async function fullTextFor(articles: CorpusArticle[]): Promise<Map<number, string>> {
  const texts = await mapWithConcurrency(articles, 8, (a) =>
    fetchArticleText(a.url, WRITING_TEXT_CHARS * 2),
  );
  const out = new Map<number, string>();
  articles.forEach((a, n) => {
    const fetched = texts[n];
    if (fetched && fetchedTextMatches(a.title, fetched)) out.set(a.i, fetched);
  });
  return out;
}

async function runWriting(
  prefs: DigestPreferences,
  items: WritingItem[],
): Promise<Map<number, { summary?: string; gist?: string }>> {
  const model = getModel(WRITING_SCHEMA, 0.5);
  if (!model) throw new Error("model unavailable");
  const response = await withTimeout(
    model.generateContent(buildWritingPrompt(prefs, items)),
    WRITING_TIMEOUT_MS,
    "writing",
  );
  const parsed = JSON.parse(response.response.text()) as {
    items?: Array<{ i?: unknown; summary?: unknown; gist?: unknown }>;
  };
  const byIndex = new Map(items.map((it) => [it.article.i, it]));
  const out = new Map<number, { summary?: string; gist?: string }>();

  for (const entry of parsed?.items ?? []) {
    const item = byIndex.get(toIndex(entry?.i));
    if (!item) continue;
    const written: { summary?: string; gist?: string } = {};
    if (item.needsSummary && typeof entry.summary === "string") {
      const summary = humanise(entry.summary);
      // Reject thin or drifted paragraphs — the fallback below is better
      // than a summary of the wrong story under this headline.
      if (summary.length >= 40 && looksOnTopic(item.article.title, summary)) {
        written.summary = summary;
      }
    }
    if (item.needsGist && typeof entry.gist === "string") {
      const gist = entry.gist.trim();
      if (gist.length >= 4 && gist.length <= 140) written.gist = gist;
    }
    out.set(item.article.i, written);
  }
  return out;
}

async function aiDigest(
  prefs: DigestPreferences,
  corpus: CorpusArticle[],
): Promise<Pick<DigestResult, "sections" | "atAGlance">> {
  const selection = await runSelection(prefs, corpus);

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
  const atAGlance = rehydrateAtAGlance(selection.atAGlance, corpus);

  // Everything that needs writing, once each: section articles need a
  // summary, glance picks a gist, and an article can need both.
  const indexByUrl = new Map(corpus.map((a) => [a.url, a.i]));
  const glanceUrls = new Set(atAGlance.map((g) => g.url));
  const shortlist = [...new Set([...sectionByUrl.keys(), ...glanceUrls])]
    .map((url) => corpus[indexByUrl.get(url) ?? -1])
    .filter((a): a is CorpusArticle => Boolean(a));

  const fullText = await fullTextFor(shortlist);
  const items: WritingItem[] = shortlist.map((article) => ({
    article,
    text: fullText.get(article.i) ?? article.text,
    section: sectionByUrl.get(article.url),
    needsSummary: sectionByUrl.has(article.url),
    needsGist: glanceUrls.has(article.url),
  }));

  let written = new Map<number, { summary?: string; gist?: string }>();
  try {
    if (items.length > 0) written = await runWriting(prefs, items);
  } catch (err) {
    // The selection is still the reader's edition — print it with summaries
    // condensed from the article text rather than throwing it away.
    console.error("[digest] writing pass failed, keeping selection:", err);
  }

  const itemByUrl = new Map(items.map((it) => [it.article.url, it]));
  const words = prefs.global.summaryLengthWords;
  for (const list of Object.values(sections)) {
    for (const a of list) {
      const item = itemByUrl.get(a.url);
      if (!item) continue;
      a.summary =
        written.get(item.article.i)?.summary ??
        heuristicSummary({ ...item.article, text: item.text }, words);
    }
  }
  for (const g of atAGlance) {
    const idx = indexByUrl.get(g.url);
    const gist = idx === undefined ? undefined : written.get(idx)?.gist;
    if (gist) g.summary = gist;
  }

  return { sections, atAGlance };
}

// ---- heuristic fallback (no AI configured) -----------------------------------

const POOL_HINTS: Record<string, string[]> = {
  f1: ["F1"],
  sports: ["F1", "Football", "Tennis"],
  markets: ["Markets", "World"],
  world: ["World", "Markets"],
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
          const hay = `${a.title} ${a.text}`.toLowerCase();
          const shortName = group.split(/\s+/).pop()?.toLowerCase() ?? "";
          if (hay.includes(group.toLowerCase()) || (shortName.length > 2 && hay.includes(shortName))) {
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

export async function generateDigest(prefs: DigestPreferences): Promise<DigestResult> {
  const corpus = await collectCorpus(prefs);
  const generatedAt = new Date().toISOString();

  const heuristic = (): DigestResult => {
    const sections = heuristicDigest(prefs, corpus);
    return {
      sections,
      atAGlance: heuristicAtAGlance(prefs, sections, corpus),
      generatedAt,
      engine: "heuristic",
      corpusSize: corpus.length,
    };
  };

  if (!aiEnabled() || corpus.length === 0) return heuristic();

  try {
    const { sections, atAGlance } = await aiDigest(prefs, corpus);
    return { sections, atAGlance, generatedAt, engine: "ai", corpusSize: corpus.length };
  } catch (err) {
    console.error("[digest] AI selection failed, falling back to heuristic:", err);
    return heuristic();
  }
}
