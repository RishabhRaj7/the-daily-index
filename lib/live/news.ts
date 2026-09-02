import type { WireBrief } from "@/lib/types";
import { fetchRssFeed, interleaveWires } from "./rss";

// The Hindu's National feed skews heavily toward state/party politics, which
// conflicts with the "no politics" rule far more often than it's worth
// filtering post-hoc — Business + Sci-Tech cover India while staying close
// to Dateline's actual remit (business, science, culture).
const WORLD_INDIA_FEEDS = [
  "http://feeds.bbci.co.uk/news/world/rss.xml",
  "https://www.thehindu.com/business/feeder/default.rss",
  "https://www.thehindu.com/sci-tech/feeder/default.rss",
];

const MARKETS_FEEDS = [
  "https://economictimes.indiatimes.com/rssfeedsdefault.cms",
  "https://www.livemint.com/rss/markets",
];

export async function getWorldIndiaWire(limit = 8): Promise<WireBrief[]> {
  const results = await Promise.all(
    WORLD_INDIA_FEEDS.map((f) => fetchRssFeed(f, 1800)),
  );
  return interleaveWires(results).slice(0, limit);
}

export async function getMarketsWire(limit = 8): Promise<WireBrief[]> {
  const results = await Promise.all(
    MARKETS_FEEDS.map((f) => fetchRssFeed(f, 1800)),
  );
  return interleaveWires(results).slice(0, limit);
}
