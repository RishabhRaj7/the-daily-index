import { searchNews as news, type WhyItem } from "@/lib/live/news-search";
import { resolveGoogleLinks } from "@/lib/live/google-links";
import { aiEnabled, generateJson, Type } from "@/lib/server/gemini";
import { getStore } from "@/lib/server/store";

// GET /api/odds/why?id=pm:…&q=<question>&lead=<favourite>&move=-9&days=7
// Why a market moved: the week's news on its question (Google News,
// searched with the question's own words), dated, so the chart can pin a
// headline to the jump it lines up with. With a big enough move and AI
// configured, one sentence on which of those stories most likely moved
// it, grounded only in the headlines given, on the light models; it is kept for the day.
// Polymarket and Kalshi show news beside their charts; their APIs don't
// say why, so the paper reads the news itself.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** "Will the U.S. invade Iran before 2027?" → "US invade Iran". */
function searchFor(question: string): string {
  return question
    .replace(/\(.*?\)/g, " ")
    .replace(/[?…]|\.\.\.|_+/g, " ")
    .replace(/\b(will|the|a|an|by|before|after|in|on|of|end|which|what|who|when|be|is|are|next|released|announces?|winner|price|hit|reach)\b/gi, " ")
    .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b\.?\s*\d{0,2},?/gi, " ")
    .replace(/\b20\d\d\b/g, " ")
    .replace(/U\.S\./g, "US")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 6)
    .join(" ");
}

async function explain(question: string, move: number, days: number, items: WhyItem[]): Promise<string | null> {
  if (!aiEnabled() || items.length === 0) return null;
  const prompt = `A prediction market asks: "${question}". Over the past ${days === 1 ? "day" : `${days} days`} the favourite's chance moved ${move > 0 ? "up" : "down"} ${Math.abs(Math.round(move))} points.
Here are the week's headlines on it, newest first:
${items.map((n, i) => `[${i}] ${n.at.slice(0, 16).replace("T", " ")} UTC · ${n.source}: ${n.title}`).join("\n")}

In ONE plain sentence (at most 26 words), say which of these stories most likely moved the price, and how. Use only what the headlines say; no speculation beyond them, no advice. If none of them plausibly explains it, answer with an empty string.
Return JSON: {"why": string, "item": number (index of the story, or -1)}`;
  try {
    const text = await generateJson(prompt, {
      schema: { type: Type.OBJECT, properties: { why: { type: Type.STRING }, item: { type: Type.INTEGER } }, required: ["why", "item"] },
      temperature: 0.2,
      timeoutMs: 12_000,
      label: "odds-why",
      light: true,
    });
    const out = JSON.parse(text) as { why?: string; item?: number };
    const why = (out.why ?? "").trim();
    return why.length >= 12 && why.length <= 240 ? why : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const id = params.get("id") ?? "";
  const question = (params.get("q") ?? "").slice(0, 160);
  const move = Number(params.get("move") ?? 0) || 0;
  const days = Math.min(30, Math.max(1, Number(params.get("days") ?? 7) || 7));
  if (!/^(pm|ks):[\w.-]+$/i.test(id) || question.length < 4) return Response.json({ items: [], why: null }, { status: 400 });

  // The favourite's name sharpens a broad question ("Presidential Election" + "JD Vance").
  const lead = (params.get("lead") ?? "").replace(/^(yes|no)$/i, "").replace(/^by .*/i, "").slice(0, 40);
  const q = `${searchFor(question)} ${lead}`.trim();
  const raw = q.length >= 3 ? await news(q, days) : [];
  // Publisher links in place of Google's redirects, where they resolve.
  const resolved = await resolveGoogleLinks(raw.map((n) => n.url)).catch(() => new Map<string, string>());
  const items = raw.map((n) => ({ ...n, url: resolved.get(n.url) ?? n.url }));

  // The sentence is kept for the day, per market and direction.
  let why: string | null = null;
  if (Math.abs(move) >= 5) {
    const key = `odds:why:v1:${id}:${new Date().toISOString().slice(0, 10)}:${move > 0 ? "up" : "down"}`;
    const store = getStore();
    const kept = await store.get<{ why: string | null }>(key).catch(() => null);
    if (kept) why = kept.why;
    else {
      why = await explain(question, move, days, items);
      await store.set(key, { why }, { ttlSeconds: 86_400 }).catch(() => {});
    }
  }
  return Response.json({ query: q, items, why }, { headers: { "Cache-Control": "public, max-age=600, s-maxage=1800" } });
}
