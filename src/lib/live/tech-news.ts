import type { WireBrief } from "@/lib/types";
import { fetchRssFeed } from "./rss";

// TechCrunch is the one general-tech feed we found that ships real
// (non-empty) article descriptions — The Verge uses Atom format (not
// parsed here) and Hacker News' API has no article body at all.
export async function getTechNews(limit = 8): Promise<WireBrief[]> {
  return fetchRssFeed("https://techcrunch.com/feed/", 1800).then((items) =>
    items.slice(0, limit),
  );
}
