import type { WireBrief } from "@/lib/types";
import { fetchRssFeed, interleaveWires, dedupeWires } from "./rss";
import { MARKETS_FEEDS, WORLD_FEEDS } from "./feeds";

// Feed lists live in ./feeds.ts. Both pools draw from several outlets that
// cover the same events (BBC / Guardian / Al Jazeera on one summit), so they
// get the same near-duplicate filter the sports pools already use.

export async function getWorldIndiaWire(limit = 8): Promise<WireBrief[]> {
  const results = await Promise.all(WORLD_FEEDS.map((f) => fetchRssFeed(f, 1800)));
  return dedupeWires(interleaveWires(results)).slice(0, limit);
}

export async function getMarketsWire(limit = 8): Promise<WireBrief[]> {
  const results = await Promise.all(MARKETS_FEEDS.map((f) => fetchRssFeed(f, 1800)));
  return dedupeWires(interleaveWires(results)).slice(0, limit);
}
