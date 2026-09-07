import type { WireBrief } from "@/lib/types";
import { fetchRssFeed, interleaveWires, dedupeWires } from "./rss";

const FEEDS = [
  "https://www.autosport.com/rss/f1/news/",
  "https://www.motorsport.com/rss/f1/news/",
  "https://feeds.bbci.co.uk/sport/formula1/rss.xml",
  "https://www.fia.com/rss/press-release"
];

export async function getF1News(limit = 8): Promise<WireBrief[]> {
  const results = await Promise.all(FEEDS.map((f) => fetchRssFeed(f, 1800)));
  return dedupeWires(interleaveWires(results)).slice(0, limit);
}
