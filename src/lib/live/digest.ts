// The preference-driven digest pipeline (server side).
//
//   1. collectCorpus() — fetch every wire the paper already uses, untouched:
//      World/India, Markets, F1, Football, Tennis, Tech, Credit Cards.
//   2. generateDigest() — send the FULL collated corpus plus the reader's
//      preferences JSON to the model in one call. The model filters,
//      prioritises and summarises per section and answers with corpus
//      indices; we rehydrate real article metadata so no link can be
//      invented. The same reply also carries "atAGlance": up to 6 top
//      headlines across the whole corpus for the floating At a Glance
//      panel. When the AI is unavailable a deterministic heuristic keeps
//      the digest working.

import { GoogleGenerativeAI } from "@google/generative-ai";
import { dedupeWires } from "./rss";
import { getWorldIndiaWire, getMarketsWire } from "./news";
import { getF1News } from "./f1-news";
import { getFootballNews } from "./football-news";
import { getTennisNews } from "./tennis-news";
import { getTechNews } from "./tech-news";
import { getCreditCardWire } from "./credit-card-wire";
import { fetchArticleText, fetchedTextMatches } from "./summarize";
import { buildDigestPrompt } from "@/lib/preferences/prompt";
import type {
  AtAGlanceItem,
  CorpusArticle,
  DigestArticle,
  DigestPreferences,
  DigestResult,
  DigestSection,
} from "@/lib/preferences/types";
import type { WireBrief } from "@/lib/types";

const DIGEST_TIMEOUT_MS = 120_000;
const RSS_FALLBACK_CHARS = 2000;

function aiEnabled(): boolean {
  return process.env.AI_SUMMARIZE !== "false" && Boolean(process.env.GEMINI_API_KEY);
}

function getModel() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  return new GoogleGenerativeAI(key).getGenerativeModel({
    model: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
    generationConfig: { responseMimeType: "application/json" },
  });
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

/**
 * Collate every news wire the paper already fetches into one deduplicated
 * corpus. The fetchers themselves are the existing integrations, unchanged.
 */
export async function collectCorpus(): Promise<CorpusArticle[]> {
  const [world, markets, f1, football, tennis, tech, cards] = await Promise.all([
    getWorldIndiaWire(24),
    getMarketsWire(20),
    getF1News(20),
    getFootballNews(20),
    getTennisNews(20),
    getTechNews(20),
    getCreditCardWire(12),
  ]);

  const pooled = [
    ...tagPool(world, "World"),
    ...tagPool(markets, "Markets"),
    ...tagPool(f1, "F1"),
    ...tagPool(football, "Football"),
    ...tagPool(tennis, "Tennis"),
    ...tagPool(tech, "Tech"),
    ...tagPool(cards, "Cards"),
  ];

  // URL-level dedupe first (the same link can appear in two wires), then the
  // existing near-duplicate title filter the sport feeds already rely on.
  const seen = new Set<string>();
  const poolByUrl = new Map<string, string>();
  const unique = pooled.filter((b) => {
    if (seen.has(b.url)) return false;
    seen.add(b.url);
    poolByUrl.set(b.url, b.pool);
    return true;
  });
  const deduped = dedupeWires(unique);

  // RSS descriptions are only excerpts. Fetch each linked article page and
  // use its complete extracted text when the page actually matches the RSS
  // headline; paywalls, blocked pages, and unrelated redirects fall back to
  // the RSS excerpt instead.
  const fullTexts = await Promise.all(
    deduped.map((b) => fetchArticleText(b.url)),
  );

  return deduped.map((b, i) => {
    const fetched = fullTexts[i];
    const text =
      fetched && fetchedTextMatches(b.title, fetched)
        ? fetched
        : (b.summary ?? "").slice(0, RSS_FALLBACK_CHARS);
    return {
      i,
      title: b.title,
      text,
      url: b.url,
      source: b.domain,
      pool: poolByUrl.get(b.url) ?? "World",
      postedAgo: b.postedAgo,
      ageHours: parseAgeHours(b.postedAgo),
    };
  });
}

// ---- validation / rehydration ------------------------------------------------

interface RawSelection {
  i?: unknown;
  summary?: unknown;
  priority?: unknown;
  group?: unknown;
}

function toDigestArticle(
  entry: RawSelection,
  corpus: CorpusArticle[],
  position: number,
  section: DigestSection,
  watchTopics: string[],
): DigestArticle | null {
  const idx = typeof entry.i === "number" ? entry.i : Number(entry.i);
  const article = corpus[idx];
  if (!article) return null; // unknown index → the model pointed at nothing

  let summary = typeof entry.summary === "string" ? entry.summary.trim() : "";
  if (summary.length < 20) {
    // Too thin to print — fall back to the wire's own text.
    summary = article.text || article.title;
  }

  let group: string | undefined;
  if (typeof entry.group === "string" && entry.group.trim()) {
    const g = entry.group.trim();
    if (section.type === "grouped") {
      if (section.groups.some((x) => x.toLowerCase() === g.toLowerCase())) group = g;
    } else if (section.slot === "paddock-notes") {
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
    summary,
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
  const entries = Array.isArray(raw) ? (raw as RawSelection[]) : [];
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
    } else {
      const cap = section.type === "custom" ? section.articleCount : section.articleCount;
      if (out.length >= cap) return;
    }

    usedUrls.add(article.url);
    out.push(article);
  });

  out.sort((a, b) => a.priority - b.priority);
  return out;
}

/**
 * Rehydrate the model's "At a Glance" picks. Same guarantees as the
 * sections: the reply carries corpus indices only, so every URL printed is
 * one we actually fetched. Capped at 6, URL-deduped, and independent of the
 * sections' usedUrls — these picks overlay the digest rather than compete
 * with it for articles.
 */
function rehydrateAtAGlance(raw: unknown, corpus: CorpusArticle[]): AtAGlanceItem[] {
  const MAX_PICKS = 6;
  const entries = Array.isArray(raw) ? (raw as RawSelection[]) : [];
  const out: AtAGlanceItem[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    if (out.length >= MAX_PICKS) break;
    const idx = typeof entry.i === "number" ? entry.i : Number(entry.i);
    const article = corpus[idx];
    if (!article || seen.has(article.url)) continue;
    seen.add(article.url);

    const gist = typeof (entry as { gist?: unknown }).gist === "string"
      ? ((entry as { gist?: unknown }).gist as string).trim()
      : "";

    out.push({
      title: article.title,
      summary: gist.length >= 4 ? gist : article.title,
      source: article.source,
      url: article.url,
      publishedAt: article.postedAgo,
      pool: article.pool,
    });
  }

  return out;
}

// ---- heuristic fallback (no AI configured) -----------------------------------

const POOL_HINTS: Record<string, string[]> = {
  f1: ["F1"],
  sports: ["F1", "Football", "Tennis"],
  markets: ["Markets", "World"],
  world: ["World", "Markets"],
  tech: ["Tech"],
  cards: ["Cards"],
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
  const maxAge = prefs.global.maxAgeHours;
  const fresh = corpus.filter(
    (a) => a.ageHours === null || a.ageHours <= Math.max(maxAge, 30),
  );

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
  const corpus = await collectCorpus();
  const generatedAt = new Date().toISOString();

  if (!aiEnabled() || corpus.length === 0) {
    const sections = heuristicDigest(prefs, corpus);
    return {
      sections,
      atAGlance: heuristicAtAGlance(prefs, sections, corpus),
      generatedAt,
      engine: "heuristic",
      corpusSize: corpus.length,
    };
  }

  try {
    const model = getModel();
    if (!model) throw new Error("model unavailable");

    const prompt = buildDigestPrompt(prefs, corpus);
    const response = await Promise.race([
      model.generateContent(prompt),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("digest timeout")), DIGEST_TIMEOUT_MS),
      ),
    ]);

    const text = response.response.text().replace(/```(?:json)?/g, "").trim();
    const parsed = JSON.parse(text) as {
      sections?: Record<string, unknown>;
      atAGlance?: unknown;
    };
    if (!parsed || typeof parsed.sections !== "object" || parsed.sections === null) {
      throw new Error("response missing sections map");
    }

    const usedUrls = new Set<string>();
    const sections: Record<string, DigestArticle[]> = {};
    for (const section of prefs.sections) {
      sections[section.id] = rehydrateSection(
        section,
        parsed.sections[section.id],
        corpus,
        usedUrls,
        prefs.global.watchTopics,
      );
    }

    const atAGlance = rehydrateAtAGlance(parsed.atAGlance, corpus);

    return { sections, atAGlance, generatedAt, engine: "ai", corpusSize: corpus.length };
  } catch (err) {
    console.error("[digest] AI pass failed, falling back to heuristic:", err);
    const sections = heuristicDigest(prefs, corpus);
    return {
      sections,
      atAGlance: heuristicAtAGlance(prefs, sections, corpus),
      generatedAt,
      engine: "heuristic",
      corpusSize: corpus.length,
    };
  }
}
