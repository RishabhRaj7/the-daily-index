import type { WireBrief } from "@/lib/types";
import { fetchRssFeed, interleaveWires, dedupeWires } from "./rss";
import { CITY_FEEDS, googleNewsFeed } from "./feeds";

// One wire per city the reader follows. Known cities have curated feeds
// (./feeds.ts); any other city falls back to a Google News search, so a
// reader can swap in their own city without a code change.

export function cityAliases(city: string): string[] {
  return CITY_FEEDS[city.trim().toLowerCase()]?.aliases ?? [];
}

export async function getCityWire(city: string, limit = 16): Promise<WireBrief[]> {
  const known = CITY_FEEDS[city.trim().toLowerCase()];
  const feeds = known?.feeds ?? [{ ...googleNewsFeed(city), politicsFilter: true }];
  const results = await Promise.all(feeds.map((f) => fetchRssFeed(f, 1800)));
  return dedupeWires(interleaveWires(results)).slice(0, limit);
}
