import { GoogleGenerativeAI } from "@google/generative-ai";

function aiEnabled(): boolean {
  return process.env.AI_SUMMARIZE !== "false";
}

function getModel() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  return new GoogleGenerativeAI(key).getGenerativeModel({
    model: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
    generationConfig: { responseMimeType: "application/json" },
  });
}

function extractText(html: string): string {
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

async function fetchArticleText(url: string): Promise<string | null> {
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
    const text = extractText(await res.text()).slice(0, 3000);
    return text.length >= 300 ? text : null;
  } catch {
    return null;
  }
}

// Summarises all articles in a single Gemini call.
// Input: array of { id, url, snippet } — id is used to key the output map.
// Output: Map<id, summary> — falls back to the raw snippet for any article
// that couldn't be summarised (parse failure, API error, etc.).
export interface SummarizeInput {
  id: string;
  url: string;
  snippet: string;
  /** The headline as printed. Anchors the model to the right story and lets
   *  us reject summaries that drifted onto a different article. */
  title?: string;
}

// Phrases that make a summary read like a template rather than a paragraph a
// person wrote. If the model slips one in we strip the sentence.
const ROBOTIC_OPENERS =
  /(^|\.\s+)(it|this|that)\s+(matters|is (significant|important|notable))\s+because[^.]*\.\s*/gi;

function humanise(text: string): string {
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

function looksOnTopic(title: string | undefined, summary: string): boolean {
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
function fetchedTextMatches(title: string | undefined, text: string): boolean {
  if (!title) return true;
  const toks = keyTokens(title);
  if (toks.length === 0) return true;
  const hay = text.slice(0, 2000).toLowerCase();
  const hits = toks.filter((t) => hay.includes(t.slice(0, Math.min(t.length, 6)))).length;
  return hits >= Math.max(1, Math.ceil(toks.length * 0.3));
}

// Summarises all articles in a single Gemini call.
// Output: Map<id, summary> — falls back to the raw snippet for any article
// that couldn't be summarised (parse failure, off-topic result, API error).
export async function batchSummarize(
  articles: SummarizeInput[],
): Promise<Map<string, string>> {
  const fallback = new Map(articles.map((a) => [a.id, a.snippet]));
  if (!aiEnabled() || articles.length === 0) return fallback;

  const model = getModel();
  if (!model) return fallback;

  // Fetch full article text in parallel — plain HTTP, no AI quota used here.
  const texts = await Promise.all(articles.map((a) => fetchArticleText(a.url)));

  const articleBlocks = articles
    .map((a, i) => {
      const fetched = texts[i];
      const content =
        fetched && fetchedTextMatches(a.title, fetched) ? fetched : a.snippet || "(no body available)";
      const source = a.url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
      return `<article index="${i}" source="${source}">
HEADLINE: ${a.title ?? "(untitled)"}
TEXT: ${content}
</article>`;
    })
    .join("\n\n");

  const prompt = `You write the short news items for "The Daily Index", a one-reader morning paper. Your reader is a smart adult who wants to know what happened, quickly, in the voice of a good newspaper — not a press release and not an AI.

For each <article> below, write ONE paragraph of three to five sentences that stands in for the story. Each summary will be printed directly beneath its HEADLINE, so it must be about that headline's story and nothing else.

How to write it:
- Lead with the news itself: what actually happened, who did it, and the concrete detail (numbers, names, places, dates) that makes it real.
- Then give the context a reader needs — what led here, what's at stake, what happens next — folded naturally into the prose. Vary how you do this from item to item.
- Sound like a person. Use plain, specific verbs. Sentences can vary in length. Contractions are fine.
- Stay strictly within the facts in TEXT (or the HEADLINE if TEXT is thin). Never invent quotes, figures or outcomes. If the text is only a headline, write one or two honest sentences rather than padding.
- If TEXT clearly describes a different story than the HEADLINE (wrong page, homepage, paywall), write from the HEADLINE alone.

Never do these:
- Do not use the phrases "It matters because", "This matters because", "This is significant", "In summary", "Overall", "In conclusion", "The article", "The piece", "The author", "This development", "underscores", "highlights", "showcases", "delve", "landscape", "pivotal", "crucial", "game-changer", "testament".
- Do not begin every paragraph the same way. Do not end every paragraph with a why-it-matters sentence.
- No bullet points, markdown, headers, hashtags or emoji. No first person.

Return ONLY a JSON array with exactly one object per article, in the same order, using this schema:
[{"i": 0, "summary": "..."}, {"i": 1, "summary": "..."}]

${articleBlocks}`;

  try {
    const result = await model.generateContent(prompt);
    const parsed: Array<{ i: number; summary: string }> = JSON.parse(
      result.response.text(),
    );

    const out = new Map(articles.map((a) => [a.id, a.snippet]));
    for (const item of parsed) {
      const article = articles[item.i];
      if (!article || typeof item.summary !== "string") continue;
      const summary = humanise(item.summary);
      if (summary.length < 40) continue;
      if (!looksOnTopic(article.title, summary)) {
        console.warn("[batchSummarize] off-topic summary rejected for:", article.title);
        continue;
      }
      out.set(article.id, summary);
    }
    return out;
  } catch (err) {
    console.error("[batchSummarize] Gemini error:", err);
    return fallback;
  }
}

// Maps a story ID (e.g. "wire-dateline-0") to a human section label.
function inferSection(storyId: string): string {
  if (storyId.includes("dateline")) return "World";
  if (storyId.includes("ledger")) return "Markets";
  if (storyId.includes("paddock")) return "Sports";
  if (storyId.includes("circuit")) return "Tech";
  if (storyId.includes("plastic")) return "Cards";
  return "";
}

// Generates a bullet-point "at a glance" brief from the batch summaries.
// One bullet per section, written for fast scanning.
export async function generateEditionBrief(
  articles: Array<{ id: string; snippet: string }>,
  summaries: Map<string, string>,
): Promise<import("@/lib/types").EditionBrief | null> {
  if (!aiEnabled()) return null;
  const model = getModel();
  if (!model) return null;

  // One entry per section — take the first article that maps to each section.
  const seen = new Set<string>();
  const items: Array<{ section: string; text: string }> = [];
  for (const article of articles) {
    const section = inferSection(article.id);
    if (!section || seen.has(section)) continue;
    seen.add(section);
    items.push({ section, text: (summaries.get(article.id) ?? article.snippet).slice(0, 500) });
  }
  if (items.length === 0) return null;

  const content = items.map((s) => `${s.section}: ${s.text}`).join("\n\n");

  const prompt = `You edit "The Daily Index", a one-reader morning paper. Write the "at a glance" strip: one line per section, at most 18 words, in the clipped voice of a front-page index — the fact first, no throat-clearing, no "matters because", no adjectives doing the work of facts.

${content}

Return JSON: {"bullets": [{"section": "World", "text": "..."}, ...]}
Include only sections with content. Sections: World, Markets, Sports, Tech, Cards.`;

  try {
    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text()) as import("@/lib/types").EditionBrief;
  } catch {
    return null;
  }
}

// Explains in 2 sentences why a Reddit post is trending.
// Kept as a separate call — different prompt, small volume (≤5 posts/page).
export async function summarizeTrend(
  title: string,
  subreddit: string,
  upvotes: number,
  comments: number,
): Promise<string | null> {
  if (!aiEnabled()) return null;
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const model = new GoogleGenerativeAI(key).getGenerativeModel({
    model: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
  });

  const prompt = `A post on r/${subreddit} titled "${title}" has ${upvotes.toLocaleString()} upvotes and ${comments.toLocaleString()} comments. In two plain sentences, as a well-read friend would put it, say what the post is about and what people are likely arguing over. Use only what the title tells you — don't invent details. No "it matters because", no hype words, no emoji.`;

  try {
    const result = await model.generateContent(prompt);
    return result.response.text().trim() || null;
  } catch (err) {
    console.error("[summarizeTrend] Gemini error:", err);
    return null;
  }
}
