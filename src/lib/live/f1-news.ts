import type { WireBrief } from "@/lib/types";
import { fetchRssFeed, interleaveWires, dedupeWires } from "./rss";
import { F1_FEEDS } from "./feeds";

export async function getF1News(limit = 8): Promise<WireBrief[]> {
  const results = await Promise.all(F1_FEEDS.map((f) => fetchRssFeed(f, 1800)));
  return dedupeWires(interleaveWires(results)).slice(0, limit);
}
