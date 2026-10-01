import { decodeEntities } from "./rss";

// What people are searching for in India, the US and the UK, from Google
// Trends' "Trending now", in Google's own order:
//
//   the list    the call behind trends.google.com/trending (batchexecute,
//               "i0OFE"): about a hundred searches a country, each with
//               its volume, when it started climbing, how fast, and the
//               searches that go with it. Undocumented, so if it fails the
//               public RSS (ten searches) stands in.
//   the story   the RSS carries Google's own news for its top ten; the rest
//               get the day's top Google News result for the search.
// Twenty a country at most; refreshed every ten minutes.

export interface TrendItem {
  term: string;
  /** Google's rough count, "50K+". */
  traffic: string;
  /** The same as a number, for sorting and bars. */
  volume: number;
  started: string | null;
  /** How much faster than usual, in percent (Google caps it at 1000, so most say that). */
  rise: number | null;
  /** Searches that go with it ("ind vs sl"). */
  related: string[];
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
];

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const MAX = 20;

const tag = (xml: string, t: string) =>
  decodeEntities(
    xml
      .match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`))?.[1]
      ?.replace(/<!\[CDATA\[|\]\]>/g, "")
      .trim() ?? "",
  );
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const traffic = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M+` : n >= 1e3 ? `${Math.round(n / 1e3)}K+` : `${n}+`);

function volumeOf(t: string): number {
  const m = t.replace(/,/g, "").match(/([\d.]+)\s*([KMB])?/i);
  if (!m) return 0;
  return Number(m[1]) * ({ K: 1e3, M: 1e6, B: 1e9 }[(m[2] ?? "").toUpperCase()] ?? 1);
}

/** The public feed: Google's top ten with their news. */
async function rss(geo: string): Promise<TrendItem[]> {
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
        const at = Date.parse(tag(item, "pubDate"));
        const volume = volumeOf(tag(item, "ht:approx_traffic"));
        return {
          term: tag(item, "title"),
          traffic: traffic(volume),
          volume,
          started: Number.isNaN(at) ? null : new Date(at).toISOString(),
          rise: null,
          related: [],
          news: item
            .split("<ht:news_item>")
            .slice(1)
            .map((n) => ({ title: tag(n, "ht:news_item_title"), url: tag(n, "ht:news_item_url"), source: tag(n, "ht:news_item_source") }))
            .filter((n) => n.title && /^https?:\/\//.test(n.url))
            .slice(0, 3),
        };
      })
      .filter((t) => t.term);
  } catch {
    return [];
  }
}

/** The Trending-now page's own list. */
async function trendingNow(geo: string): Promise<TrendItem[]> {
  try {
    const req = JSON.stringify([[["i0OFE", JSON.stringify([null, null, geo, 0, "en-US", 24, 1]), null, "generic"]]]);
    const res = await fetch("https://trends.google.com/_/TrendsUi/data/batchexecute", {
      method: "POST",
      headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: `f.req=${encodeURIComponent(req)}`,
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const line = (await res.text()).split("\n").find((l) => l.includes('"wrb.fr"'));
    if (!line) return [];
    const rows = (JSON.parse(JSON.parse(line)[0][2]) as unknown[])[1] as unknown[][];
    return rows
      .filter((r) => typeof r?.[0] === "string")
      .slice(0, MAX)
      .map((r) => {
        const volume = Number(r[6]) || 0;
        const at = Array.isArray(r[3]) ? Number(r[3][0]) : NaN;
        return {
          term: r[0] as string,
          traffic: traffic(volume),
          volume,
          started: Number.isFinite(at) ? new Date(at * 1000).toISOString() : null,
          rise: Number.isFinite(Number(r[8])) && Number(r[8]) > 0 ? Number(r[8]) : null,
          related: (Array.isArray(r[9]) ? (r[9] as string[]) : []).filter((q) => norm(q) !== norm(r[0] as string)).slice(0, 3),
          news: [],
        };
      });
  } catch {
    return [];
  }
}

/** The day's top Google News story for a search, for those the feed has none for. */
async function story(term: string, geo: string): Promise<TrendItem["news"]> {
  try {
    const res = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(`${term} when:1d`)}&hl=en-${geo}&gl=${geo}&ceid=${geo}:en`, {
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const item = (await res.text()).split("<item>")[1];
    if (!item) return [];
    const source = tag(item, "source");
    const title = tag(item, "title").replace(` - ${source}`, "");
    const url = tag(item, "link");
    return title && url ? [{ title, url, source }] : [];
  } catch {
    return [];
  }
}

export async function getTrends(geo: string): Promise<TrendItem[]> {
  const [list, feed] = await Promise.all([trendingNow(geo), rss(geo)]);
  if (list.length === 0) return feed;
  const fromFeed = new Map(feed.map((t) => [norm(t.term), t.news]));
  return Promise.all(list.map(async (t) => ({ ...t, news: fromFeed.get(norm(t.term)) ?? (await story(t.term, geo)) })));
}

export async function getWorldTrends(geos: string[]): Promise<TrendCountry[]> {
  const wanted = TREND_COUNTRIES.filter(([g]) => geos.includes(g));
  const lists = await Promise.all(wanted.map(([g]) => getTrends(g)));
  return wanted.map(([geo, name], i) => ({ geo, name, items: lists[i] })).filter((c) => c.items.length > 0);
}
