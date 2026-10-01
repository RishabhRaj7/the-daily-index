import type { WireBrief } from "@/lib/types";
import { fetchRssFeed, interleaveWires, dedupeWires } from "./rss";
import { TENNIS_FEEDS } from "./feeds";
import { womensSportTest } from "./womens-sport";

export async function getTennisNews(limit = 8): Promise<WireBrief[]> {
  // Men's game only: the reader doesn't follow women's sport.
  const [results, womens] = await Promise.all([Promise.all(TENNIS_FEEDS.map((f) => fetchRssFeed(f, 1800))), womensSportTest()]);
  return dedupeWires(interleaveWires(results))
    .filter((b) => !womens(`${b.title} ${b.summary ?? ""}`))
    .slice(0, limit);
}
