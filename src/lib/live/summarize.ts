import { aiEnabled, generateJson } from "@/lib/server/gemini";
import { decodeEntities } from "./rss";

// Reading an article's page, and the checks that keep a paragraph under the
// headline it was written for:
//
//   fetchArticle    the article's own text: the page's structured articleBody,
//                   else its <article> element, else the whole page. Never the
//                   rest of the page when a tighter source exists, so a
//                   neighbouring story's blurb can't reach the writer.
//   looksOnTopic    does this text share the headline's words?
//   aboutMatches    did the model echo the headline of the story it claims?
//   fitsAnotherBetter  does this paragraph fit a different headline clearly
//                   better than its own (a crossed reply)?
//   groundedIn      are this paragraph's words drawn from this source text?

function extractText(html: string): string {
  return decodeEntities(stripTags(html));
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "")
    .replace(/<figure[\s\S]*?<\/figure>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const MIN_ARTICLE_CHARS = 300;

/** Every articleBody in the page's structured data, with its own headline. */
function structuredBodies(html: string): Array<{ headline: string; body: string }> {
  const out: Array<{ headline: string; body: string }> = [];
  const walk = (node: unknown, depth: number) => {
    if (depth > 6 || !node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach((n) => walk(n, depth + 1));
    const obj = node as Record<string, unknown>;
    if (typeof obj.articleBody === "string") {
      out.push({ headline: typeof obj.headline === "string" ? obj.headline : "", body: extractText(obj.articleBody) });
    }
    Object.values(obj).forEach((v) => walk(v, depth + 1));
  };
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walk(JSON.parse(m[1].trim()), 0);
    } catch {
      // Publishers often ship broken JSON-LD; the next source takes over.
    }
  }
  return out;
}

/** This article's text, from the tightest source the page offers. */
function articleBodyOf(html: string, title: string | undefined): string {
  const longest = (list: string[]) => list.reduce((a, b) => (b.length > a.length ? b : a), "");
  const structured = structuredBodies(html).filter((b) => b.body.length >= MIN_ARTICLE_CHARS);
  // A page can describe several articles: its own is the one with this headline.
  const own = structured.filter((b) => fetchedTextMatches(title, b.headline));
  if (own.length > 0) return longest(own.map((b) => b.body));

  const elements = [...html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)]
    .map((m) => extractText(m[1]))
    .filter((t) => t.length >= MIN_ARTICLE_CHARS);
  const ownElements = elements.filter((t) => fetchedTextMatches(title, t));
  if (ownElements.length > 0) return longest(ownElements);

  return extractText(html);
}

/** The publisher's one-line description: <meta> in either attribute order. */
function metaContent(html: string, names: string[]): string | null {
  for (const name of names) {
    // The closing quote must match the opening one, so "It's" keeps its
    // apostrophe, and a match can't run on into the next tag.
    const content = `\\bcontent=(?:"([^"]*)"|'([^']*)')`;
    const m =
      html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*${content}`, "i")) ??
      html.match(new RegExp(`<meta[^>]*${content}[^>]*(?:property|name)=["']${name}["']`, "i"));
    const value = m?.[1] ?? m?.[2];
    if (value) return stripTags(decodeEntities(value));
  }
  return null;
}

export interface FetchedArticle {
  /** The article's text (null when the page held too little to use). */
  text: string | null;
  /** The publisher's own short description, for when nothing gets written. */
  description: string | null;
  /** The text is about this headline. Guards against a paywall, consent page
   *  or homepage served in the article's place, and against a publisher whose
   *  page carries another story's body under this title (Economic Times did). */
  matches: boolean;
}

export async function fetchArticle(
  url: string,
  opts: { maxChars?: number; title?: string } = {},
): Promise<FetchedArticle | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const body = articleBodyOf(html, opts.title);
    const text = opts.maxChars ? body.slice(0, opts.maxChars) : body;
    return {
      text: text.length >= MIN_ARTICLE_CHARS ? text : null,
      description: metaContent(html, ["og:description", "description", "twitter:description"]),
      matches: fetchedTextMatches(opts.title, text),
    };
  } catch {
    return null;
  }
}

export async function fetchArticleText(url: string, maxChars?: number): Promise<string | null> {
  return (await fetchArticle(url, { maxChars }))?.text ?? null;
}

// Phrases that make a summary read like a template rather than a paragraph a
// person wrote. If the model slips one in we strip the sentence.
const ROBOTIC_OPENERS =
  /(^|\.\s+)(it|this|that)\s+(matters|is (significant|important|notable))\s+because[^.]*\.\s*/gi;

export function humanise(text: string): string {
  return text
    .replace(ROBOTIC_OPENERS, (m, lead: string) => (lead === "" ? "" : lead))
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Words in a headline that carry meaning — used to check the summary is
// about the same story as the headline it will sit under.
function keyTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(
      (t) =>
        t.length >= 4 &&
        !["with", "from", "that", "this", "after", "over", "into", "amid", "says", "said", "will", "have", "been", "were", "what", "when", "your", "their", "about", "more", "than", "just", "here", "live", "news", "report", "update"].includes(t),
    );
}

export function looksOnTopic(title: string | undefined, summary: string): boolean {
  if (!title) return true;
  const toks = keyTokens(title);
  if (toks.length === 0) return true;
  const hay = summary.toLowerCase();
  const hits = toks.filter((t) => hay.includes(t.slice(0, Math.min(t.length, 6)))).length;
  // Short headlines: any one hit; longer ones: at least a quarter.
  return hits >= Math.max(1, Math.ceil(toks.length * 0.25));
}

// Some publishers serve a paywall, consent page or their homepage instead of
// the article. Only trust fetched text when it plainly matches the headline.
export function fetchedTextMatches(title: string | undefined, text: string): boolean {
  if (!title) return true;
  const toks = keyTokens(title);
  if (toks.length === 0) return true;
  const hay = text.slice(0, 2000).toLowerCase();
  const hits = toks.filter((t) => hay.includes(t.slice(0, Math.min(t.length, 6)))).length;
  return hits >= Math.max(1, Math.ceil(toks.length * 0.3));
}

/** The share of a headline's meaningful words that this text uses. */
export function headlineFit(title: string, text: string): number {
  const toks = [...new Set(keyTokens(title))];
  if (toks.length === 0) return 0;
  const hay = text.toLowerCase();
  return toks.filter((t) => hay.includes(t.slice(0, Math.min(t.length, 6)))).length / toks.length;
}

/**
 * The writer repeats the first words of the headline it is answering. They
 * must be this headline's: three of the five (fewer when the headline is
 * shorter), found near its start, so a changed quote mark doesn't fail it.
 */
export function aboutMatches(title: string, about: unknown): boolean {
  if (typeof about !== "string") return false;
  const wordsOf = (s: string) =>
    decodeEntities(s)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(Boolean);
  const said = wordsOf(about).slice(0, 5);
  const start = wordsOf(title).slice(0, 8);
  if (said.length === 0 || start.length === 0) return false;
  return said.filter((w) => start.includes(w)).length >= Math.min(3, said.length, start.length);
}

/**
 * The headline this paragraph fits clearly better than its own, if any: half
 * of that headline's words at least, and a quarter more of them than its own.
 * That margin leaves room for two stories on one subject, which share words.
 */
export function fitsAnotherBetter(title: string, summary: string, others: string[]): string | null {
  const own = headlineFit(title, summary);
  for (const other of others) {
    if (other === title) continue;
    const fit = headlineFit(other, summary);
    if (fit >= 0.5 && fit >= own + 0.25) return other;
  }
  return null;
}

/** The share of this paragraph's meaningful words found in its source text. */
export function groundedIn(source: string, summary: string): number {
  const toks = [...new Set(keyTokens(summary))];
  if (toks.length === 0) return 0;
  const hay = source.toLowerCase();
  return toks.filter((t) => hay.includes(t.slice(0, Math.min(t.length, 6)))).length / toks.length;
}

// Summarises all articles in a single Gemini call.
// Output: Map<id, summary> — falls back to the raw snippet for any article
// that couldn't be summarised (parse failure, off-topic result, API error).
