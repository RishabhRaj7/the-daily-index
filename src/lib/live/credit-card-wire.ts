import type { WireBrief } from "@/lib/types";
import { fetchRssFeed, interleaveWires, dedupeWires } from "./rss";
import { CARD_FEEDS } from "./feeds";

// There's still no dedicated Indian card-news wire, so the pool mixes two
// card blogs (every post is on-topic; see feeds.ts) with personal-finance
// feeds filtered down to card-related items. On a quiet week that may still
// mean zero matches — callers treat an empty result as "hide the panel".
const CARD_KEYWORDS = [
  "credit card",
  "debit card",
  "reward point",
  "co-brand card",
  "lounge access",
  "cashback card",
  "card annual fee",
  "milestone benefit",
];

function isCardRelated(title: string, description: string): boolean {
  const haystack = `${title} ${description}`.toLowerCase();
  return CARD_KEYWORDS.some((k) => haystack.includes(k));
}

export async function getCreditCardWire(limit = 6): Promise<WireBrief[]> {
  const results = await Promise.all(
    CARD_FEEDS.map((f) => fetchRssFeed(f, 1800, f.cardsOnly ? isCardRelated : undefined)),
  );
  return dedupeWires(interleaveWires(results)).slice(0, limit);
}
