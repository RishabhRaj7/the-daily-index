import type { WireBrief } from "@/lib/types";
import { fetchRssFeed, interleaveWires, dedupeWires } from "./rss";
import { INDIA_FEEDS, MARKETS_FEEDS, MONEY_FEEDS, WORLD_FEEDS, type FeedSource } from "./feeds";

// Feed lists live in ./feeds.ts. Each pool draws from several outlets that
// cover the same events (BBC / Guardian / Al Jazeera on one summit), so they
// get the same near-duplicate filter the sports pools already use.

async function wire(feeds: FeedSource[], limit: number): Promise<WireBrief[]> {
  const results = await Promise.all(feeds.map((f) => fetchRssFeed(f, 1800)));
  return dedupeWires(interleaveWires(results)).slice(0, limit);
}

export const getWorldIndiaWire = (limit = 8) => wire(WORLD_FEEDS, limit);
export const getIndiaWire = (limit = 8) => wire(INDIA_FEEDS, limit);
export const getMarketsWire = (limit = 8) => wire(MARKETS_FEEDS, limit);
export const getMoneyWire = (limit = 8) => wire(MONEY_FEEDS, limit);
