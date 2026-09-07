import type { WireBrief } from "@/lib/types";
import { fetchRssFeed, interleaveWires, dedupeWires } from "./rss";

const FEEDS = [
  "https://techcrunch.com/feed/",
  "https://feeds.arstechnica.com/arstechnica/index",
  "https://gizmodo.com/rss",
  "https://theverge.com/rss/index.xml"
];

export async function getTechNews(limit = 8): Promise<WireBrief[]> {
  const results = await Promise.all(FEEDS.map((f) => fetchRssFeed(f, 1800)));
  return dedupeWires(interleaveWires(results)).slice(0, limit);
}