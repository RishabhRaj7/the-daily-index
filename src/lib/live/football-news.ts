import type { WireBrief } from "@/lib/types";
import { fetchRssFeed, interleaveWires, dedupeWires } from "./rss";
import { FOOTBALL_FEEDS } from "./feeds";

export async function getFootballNews(limit = 8): Promise<WireBrief[]> {
  const results = await Promise.all(FOOTBALL_FEEDS.map((f) => fetchRssFeed(f, 1800)));
  return dedupeWires(interleaveWires(results)).slice(0, limit);
}
