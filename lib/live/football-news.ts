import type { WireBrief } from "@/lib/types";
import { fetchRssFeed, interleaveWires, dedupeWires } from "./rss";

const FEEDS = [
  "https://feeds.bbci.co.uk/sport/football/rss.xml",
  "https://www.skysports.com/rss/12040",
];

export async function getFootballNews(limit = 8): Promise<WireBrief[]> {
  const results = await Promise.all(FEEDS.map((f) => fetchRssFeed(f, 1800)));
  return dedupeWires(interleaveWires(results)).slice(0, limit);
}
