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
export async function batchSummarize(
  articles: Array<{ id: string; url: string; snippet: string }>,
): Promise<Map<string, string>> {
  const fallback = new Map(articles.map((a) => [a.id, a.snippet]));
  if (!aiEnabled() || articles.length === 0) return fallback;

  const model = getModel();
  if (!model) return fallback;

  // Fetch full article text in parallel — plain HTTP, no AI quota used here.
  const texts = await Promise.all(articles.map((a) => fetchArticleText(a.url)));

  // Build the unified prompt.
  const articleBlocks = articles
    .map((a, i) => {
      const content = texts[i] ?? a.snippet;
      const source = a.url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
      return `[${i}] ${source}\n${content}`;
    })
    .join("\n\n---\n\n");

  const prompt = `You are writing article summaries for "The Daily Index", a personal daily news digest app.

For each article below, write a 3–5 sentence summary. Cover who, what, where, when, and why it matters. Write in plain prose — no bullet points, no markdown, no headers.

Return a JSON array with exactly one object per article, in the SAME ORDER as the input. Use this exact schema:
[{"i": 0, "summary": "..."}, {"i": 1, "summary": "..."}, ...]

Do not include any text outside the JSON array.

--- ARTICLES ---

${articleBlocks}`;

  try {
    const result = await model.generateContent(prompt);
    const parsed: Array<{ i: number; summary: string }> = JSON.parse(
      result.response.text(),
    );

    const out = new Map(articles.map((a) => [a.id, a.snippet]));
    for (const item of parsed) {
      const article = articles[item.i];
      if (article && typeof item.summary === "string" && item.summary.trim()) {
        out.set(article.id, item.summary.trim());
      }
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

  const prompt = `You are the editor of "The Daily Index", a personal news digest. Write a scannable "at a glance" brief — one bullet per section, max 20 words each.

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

  const prompt = `This Reddit post on r/${subreddit} has ${upvotes.toLocaleString()} upvotes and ${comments.toLocaleString()} comments: "${title}". In 2 concise sentences, explain what this story is about and why it's generating so much discussion. Be specific and informative.`;

  try {
    const result = await model.generateContent(prompt);
    return result.response.text().trim() || null;
  } catch (err) {
    console.error("[summarizeTrend] Gemini error:", err);
    return null;
  }
}
