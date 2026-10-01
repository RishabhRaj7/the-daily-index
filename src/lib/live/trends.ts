import { decodeEntities } from "./rss";

// What people are searching for, country by country: Google Trends'
// "trending now" feed (public RSS, no key), refreshed by Google every few
// minutes. Each search comes with roughly how many searched and the news
// stories Google ties to it, so the paper can say why it's trending.

export interface TrendItem {
  term: string;
  /** Google's rough count, "50K+". */
  traffic: string;
  /** The same as a number, for sorting and bars. */
  volume: number;
  started: string | null;
  picture: string | null;
  news: Array<{ title: string; url: string; source: string }>;
}

export interface TrendCountry {
  geo: string;
  name: string;
  items: TrendItem[];
}

export const TREND_COUNTRIES: Array<[string, string]> = [
  ["IN", "India"],
  ["US", "United States"],
  ["GB", "United Kingdom"],
  ["JP", "Japan"],
  ["BR", "Brazil"],
  ["DE", "Germany"],
];

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const tag = (xml: string, t: string) =>
  decodeEntities(
    xml
      .match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`))?.[1]
      ?.replace(/<!\[CDATA\[|\]\]>/g, "")
      .trim() ?? "",
  );

function volumeOf(traffic: string): number {
  const m = traffic.replace(/,/g, "").match(/([\d.]+)\s*([KMB])?/i);
  if (!m) return 0;
  return Number(m[1]) * ({ K: 1e3, M: 1e6, B: 1e9 }[(m[2] ?? "").toUpperCase()] ?? 1);
}

export async function getTrends(geo: string): Promise<TrendItem[]> {
  try {
    const res = await fetch(`https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`, {
      headers: { "User-Agent": UA, Accept: "application/rss+xml" },
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return xml
      .split("<item>")
      .slice(1)
      .map((item) => {
        const traffic = tag(item, "ht:approx_traffic");
        const at = Date.parse(tag(item, "pubDate"));
        const news = item
          .split("<ht:news_item>")
          .slice(1)
          .map((n) => ({ title: tag(n, "ht:news_item_title"), url: tag(n, "ht:news_item_url"), source: tag(n, "ht:news_item_source") }))
          .filter((n) => n.title && /^https?:\/\//.test(n.url))
          .slice(0, 3);
        return {
          term: tag(item, "title"),
          traffic,
          volume: volumeOf(traffic),
          started: Number.isNaN(at) ? null : new Date(at).toISOString(),
          picture: tag(item, "ht:picture") || null,
          news,
        };
      })
      .filter((t) => t.term)
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 20);
  } catch {
    return [];
  }
}

export async function getWorldTrends(geos: string[]): Promise<TrendCountry[]> {
  const wanted = TREND_COUNTRIES.filter(([g]) => geos.includes(g));
  const lists = await Promise.all(wanted.map(([g]) => getTrends(g)));
  return wanted.map(([geo, name], i) => ({ geo, name, items: lists[i] })).filter((c) => c.items.length > 0);
}
