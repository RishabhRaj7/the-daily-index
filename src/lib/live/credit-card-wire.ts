import type { WireBrief } from "@/lib/types";
import { fetchRssFeed, interleaveWires } from "./rss";

// There's no dedicated free/legal Indian credit-card-news RSS feed, so this
// filters broader personal-finance feeds down to card-related items instead.
// On a given day that may mean zero matches — callers should treat an empty
// result as "hide the panel," not an error.
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

const FEEDS = [
  "https://economictimes.indiatimes.com/wealth/rssfeeds/837555174.cms",
  "https://economictimes.indiatimes.com/rssfeedsdefault.cms",
  "https://www.livemint.com/rss/money",
];

function isCardRelated(title: string, description: string): boolean {
  const haystack = `${title} ${description}`.toLowerCase();
  return CARD_KEYWORDS.some((k) => haystack.includes(k));
}

export async function getCreditCardWire(limit = 6): Promise<WireBrief[]> {
  const results = await Promise.all(
    FEEDS.map((f) => fetchRssFeed(f, 1800, isCardRelated)),
  );
  return interleaveWires(results).slice(0, limit);
}
