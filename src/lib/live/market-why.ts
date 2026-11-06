import { aiEnabled, generateJson, Type } from "@/lib/server/gemini";
import { resolveGoogleLinks } from "@/lib/live/google-links";
import { getStore } from "@/lib/server/store";
import { searchNews } from "@/lib/live/news-search";
import { publisherFor } from "@/lib/publishers";
import type { MarketRegion } from "@/lib/types";

// One sentence on a region's big day in Market Pulse, grounded only in today's
// headlines, with the story it came from. Only for a move of 1% or more, on the
// paper's key and its light models, kept for the day per region and direction. When
// the headlines don't explain the move, nothing shows: nobody can be sure why a
// market moved, so it says what the headlines report and names where.

export const WHY_MIN_MOVE = 1;

const SEARCH: Record<MarketRegion, { q: string; country: "US" | "IN" }> = {
  India: { q: "Sensex Nifty closing stock market", country: "IN" },
  US: { q: "Wall Street stocks close S&P 500 Nasdaq", country: "US" },
  Europe: { q: "European stocks close STOXX 600", country: "US" },
  Asia: { q: "Asian markets close Nikkei Hang Seng", country: "US" },
};

export interface MarketWhy {
  why: string;
  source: string;
  url: string;
}

export async function marketWhy(region: MarketRegion, pct: number): Promise<MarketWhy | null> {
  if (!aiEnabled() || Math.abs(pct) < WHY_MIN_MOVE) return null;
  const store = getStore();
  const day = new Date().toISOString().slice(0, 10);
  const key = `markets:why:v1:${region}:${day}:${pct > 0 ? "up" : "down"}`;
  const kept = await store.get<{ value: MarketWhy | null }>(key).catch(() => null);
  if (kept) return kept.value;

  const { q, country } = SEARCH[region];
  // Publishers the paper knows first, so its source is one the reader recognises.
  const found = await searchNews(q, 1, country);
  const known = found.filter((n) => publisherFor(n.source).slug);
  const items = known.length >= 2 ? known : found;
  if (items.length === 0) return null;
  let value: MarketWhy | null = null;
  try {
    const text = await generateJson(
      `Stock markets in ${region === "US" ? "the US" : region} moved ${pct > 0 ? "up" : "down"} ${Math.abs(pct).toFixed(2)}% today. Today's headlines, newest first:
${items.map((n, i) => `[${i}] ${n.source}: ${n.title}`).join("\n")}

In ONE plain sentence of at most 18 words, say what these headlines credit for the move, worded as what reports say, not as certain: for example "Reports credit foreign fund buying for the rise." Facts from the headlines only: no metaphors, no festive language, no forecast, no percentages not given. If the headlines don't give a reason, return an empty string for why. Return the number of the story you used.`,
      {
        schema: { type: Type.OBJECT, properties: { why: { type: Type.STRING }, item: { type: Type.INTEGER } }, required: ["why", "item"] },
        temperature: 0.2,
        timeoutMs: 15_000,
        label: "market-why",
        light: true,
      },
    );
    const out = JSON.parse(text) as { why?: string; item?: number };
    const why = (out.why ?? "").trim();
    const item = items[out.item ?? -1];
    if (item && why.length >= 12 && why.length <= 170) {
      const url = (await resolveGoogleLinks([item.url]).catch(() => new Map<string, string>())).get(item.url) ?? item.url;
      value = { why, source: publisherFor(item.source).name.replace(/^www\./, ""), url };
    }
  } catch (err) {
    // Tried again on the next look, an hour on at most.
    console.error("[market-why] failed:", err instanceof Error ? err.message.slice(0, 200) : err);
    await store.set(key, { value: null }, { ttlSeconds: 3600 }).catch(() => {});
    return null;
  }
  await store.set(key, { value }, { ttlSeconds: 86_400 }).catch(() => {});
  return value;
}
