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
  // A city without its own desk: its news, and a civic search (the
  // municipality, metro, water, power and traffic).
  const feeds = known?.feeds ?? [
    { ...googleNewsFeed(city), politicsFilter: true },
    { ...googleNewsFeed(`"${city}" (municipal OR metro OR "water supply" OR "power cut" OR traffic OR civic) when:2d`), maxAgeHours: 48 },
  ];
  const results = await Promise.all(feeds.map((f) => fetchRssFeed(f, 1800)));
  return dedupeWires(interleaveWires(results)).slice(0, limit);
}
