import type { WireBrief } from "@/lib/types";
import { fetchRssFeed, interleaveWires, dedupeWires } from "./rss";
import { FOOTBALL_FEEDS } from "./feeds";
import { womensSportTest } from "./womens-sport";

export async function getFootballNews(limit = 8): Promise<WireBrief[]> {
  // Men's game only: the reader doesn't follow women's sport.
  const [results, womens] = await Promise.all([Promise.all(FOOTBALL_FEEDS.map((f) => fetchRssFeed(f, 1800))), womensSportTest()]);
  return dedupeWires(interleaveWires(results))
    .filter((b) => !womens(`${b.title} ${b.summary ?? ""}`))
    .slice(0, limit);
}
