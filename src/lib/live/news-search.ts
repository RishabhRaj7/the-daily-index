import { decodeEntities } from "@/lib/live/rss";

// Recent headlines on a subject, from Google News's search feed, newest first.
// Used to explain moves: a prediction market's (/api/odds/why) and a region's
// stock market (lib/live/market-why.ts).

export interface WhyItem {
  title: string;
  source: string;
  url: string;
  at: string;
}

export async function searchNews(q: string, days: number, country: "US" | "IN" = "US"): Promise<WhyItem[]> {
  try {
    const place = country === "IN" ? "hl=en-IN&gl=IN&ceid=IN:en" : "hl=en-US&gl=US&ceid=US:en";
    const res = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:${days}d`)}&${place}`, {
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const tag = (item: string, t: string) => decodeEntities(item.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "") ?? "").trim();
    return xml
      .split("<item>")
      .slice(1)
      .map((item) => {
        const source = tag(item, "source");
        const title = tag(item, "title").replace(new RegExp(`\\s+-\\s+${source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), "");
        const at = Date.parse(tag(item, "pubDate"));
        return { title, source, url: tag(item, "link"), at: Number.isNaN(at) ? "" : new Date(at).toISOString() };
      })
      .filter((n) => n.title && n.url && n.at)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 8);
  } catch {
    return [];
  }
}
