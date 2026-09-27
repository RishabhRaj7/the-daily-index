import type { WireBrief } from "@/lib/types";
import { fetchRssFeed, interleaveWires, dedupeWires } from "./rss";
import { TECH_FEEDS } from "./feeds";

export async function getTechNews(limit = 8): Promise<WireBrief[]> {
  const results = await Promise.all(TECH_FEEDS.map((f) => fetchRssFeed(f, 1800)));
  return dedupeWires(interleaveWires(results)).slice(0, limit);
}
