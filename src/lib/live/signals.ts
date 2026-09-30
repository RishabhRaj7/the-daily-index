import { SIGNAL_FEEDS, feedName } from "./feeds";
import { ageInHours, decodeEntities, parseFeedDate } from "./rss";
import { recordFeed } from "./build-report";
import { isPolitical } from "./politics-filter";

// Google News as a signal, not a source.
//
// Its edition page (India top) and topic pages (nation, world, business,
// tech, sports) are ranked by Google: an item's position says what leads the
// day, and its description lists up to five other outlets running the same
// story. Grouping by those lists is how both friends' papers measured the
// biggest jump in story recall (kylo-news: 31% → 75%); headline-word overlap
// alone either splits one story into many or merges different ones.
//
// The digest uses this three ways: every corpus article that matches a story
// here is tagged with how many outlets carry it and where it leads; articles
// that match the same story share an event id, so the editor sees them as
// one event; and a leading story no feed of ours carried is added to the
// corpus, so the paper can't miss what the whole country is reading.

const UA = "Mozilla/5.0 (compatible; TheDailyIndex/1.0; personal RSS reader)";
const MAX_AGE_HOURS = 30;

export interface SignalStory {
  id: string;
  title: string;
  /** Outlet names carrying it (the item's own plus its coverage list). */
  outlets: string[];
  /** 1-based position on the India top-stories page, when it's there. */
  lead?: number;
  /** Best 1-based position on any topic page. */
  topicRank?: number;
  /** The pool a story found only here would join. */
  pool: string;
  /** Google News link and the lead outlet (name and domain). */
  url: string;
  outlet: string;
  domain: string;
  ageHours: number | null;
  /** Normalised headlines of every version, for matching. */
  titles: string[];
}

const STOP = new Set(
  "a an the of in on at to for and or but with from by as is are was were be after before over under into than this that his her their its it he she they we you i will has have had not no new says said amid vs v how why what who".split(" "),
);

export function titleTokens(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

const norm = (s: string) => titleTokens(s).join(" ");

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  let shared = 0;
  for (const x of A) if (B.has(x)) shared++;
  return shared / (A.size + B.size - shared || 1);
}

interface SignalItem {
  title: string;
  url: string;
  outlet: string;
  domain: string;
  date: Date | null;
  position: number;
  related: Array<{ title: string; outlet: string }>;
}

function strip(s: string): string {
  return decodeEntities(s.replace(/<!\[CDATA\[|\]\]>/g, "")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseSignalFeed(xml: string): SignalItem[] {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  return items.flatMap((item, position) => {
    const source = item.match(/<source[^>]*\burl="([^"]+)"[^>]*>([\s\S]*?)<\/source>/i);
    const outlet = source ? strip(source[2]) : "";
    let title = strip(item.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
    if (outlet && title.endsWith(` - ${outlet}`)) title = title.slice(0, -(outlet.length + 3)).trim();
    const url = strip(item.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "");
    if (!title || !url) return [];
    let domain = "";
    try {
      domain = source ? new URL(decodeEntities(source[1])).hostname.replace(/^www\./, "") : "";
    } catch {}
    // The description is HTML (escaped): a list of <a>headline</a> <font>outlet</font>.
    const description = decodeEntities(item.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? "");
    const related = [...description.matchAll(/<a [^>]*>([\s\S]*?)<\/a>(?:\s|&nbsp;| )*<font[^>]*>([\s\S]*?)<\/font>/g)].map((m) => ({
      title: strip(m[1]),
      outlet: strip(m[2]),
    }));
    return [{ title, url, outlet, domain, date: parseFeedDate(item.match(/<pubDate>([^<]+)<\/pubDate>/)?.[1] ?? null), position, related }];
  });
}

async function readSignalFeed(url: string): Promise<SignalItem[]> {
  const t0 = Date.now();
  const name = feedName(url);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, next: { revalidate: 1800 }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      recordFeed({ url, name, ok: false, status: res.status, items: 0, kept: 0, ms: Date.now() - t0, error: `HTTP ${res.status}` });
      return [];
    }
    const items = parseSignalFeed(await res.text());
    const fresh = items.filter((i) => !i.date || ageInHours(i.date) <= MAX_AGE_HOURS);
    recordFeed({ url, name, ok: items.length > 0, status: res.status, items: items.length, kept: fresh.length, ms: Date.now() - t0 });
    return fresh;
  } catch (err) {
    recordFeed({ url, name, ok: false, items: 0, kept: 0, ms: Date.now() - t0, error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

/** Every signal page, grouped into stories by Google's own coverage lists. */
export async function getSignalStories(): Promise<SignalStory[]> {
  const pages = await Promise.all(SIGNAL_FEEDS.map((f) => readSignalFeed(f.url)));
  const stories: SignalStory[] = [];
  const byTitle = new Map<string, SignalStory>();

  SIGNAL_FEEDS.forEach((feed, n) => {
    for (const item of pages[n]) {
      const keys = [item.title, ...item.related.map((r) => r.title)].map(norm).filter(Boolean);
      const outlets = [item.outlet, ...item.related.map((r) => r.outlet)].filter(Boolean);
      const rank = item.position + 1;
      const hit = keys.map((k) => byTitle.get(k)).find(Boolean);
      if (hit) {
        hit.outlets = [...new Set([...hit.outlets, ...outlets])];
        if (feed.top) hit.lead = Math.min(hit.lead ?? rank, rank);
        else hit.topicRank = Math.min(hit.topicRank ?? rank, rank);
        for (const k of keys) if (!byTitle.has(k)) {
          byTitle.set(k, hit);
          hit.titles.push(k);
        }
        continue;
      }
      const story: SignalStory = {
        id: `e${stories.length + 1}`,
        title: item.title,
        outlets: [...new Set(outlets)],
        ...(feed.top ? { lead: rank } : { topicRank: rank }),
        pool: feed.pool,
        url: item.url,
        outlet: item.outlet,
        domain: item.domain,
        ageHours: item.date ? Math.round(ageInHours(item.date)) : null,
        titles: [...new Set(keys)],
      };
      stories.push(story);
      for (const k of keys) byTitle.set(k, story);
    }
  });
  return stories;
}

/**
 * The signal story an article is a version of: the same headline as any
 * version Google lists, or (rarely) a near-identical one. Anything looser
 * wrongly merges different stories, so it isn't used.
 */
export function matchSignal(title: string, stories: SignalStory[], index?: Map<string, SignalStory>): SignalStory | undefined {
  const key = norm(title);
  if (!key) return undefined;
  const exact = index?.get(key) ?? stories.find((s) => s.titles.includes(key));
  if (exact) return exact;
  const toks = key.split(" ");
  if (toks.length < 5) return undefined;
  let best: { s: SignalStory; score: number } | undefined;
  for (const s of stories) {
    for (const t of s.titles) {
      const score = jaccard(toks, t.split(" "));
      if (score >= 0.6 && (!best || score > best.score)) best = { s, score };
    }
  }
  return best?.s;
}

export function signalIndex(stories: SignalStory[]): Map<string, SignalStory> {
  const index = new Map<string, SignalStory>();
  for (const s of stories) for (const t of s.titles) if (!index.has(t)) index.set(t, s);
  return index;
}

/**
 * Leading stories none of our feeds carried: on India's top page or high on
 * a topic page with several outlets behind them. Sports pages are left out
 * (the reader picks their sports), and party politics is dropped as for
 * every other political feed.
 */
export function missingLeads(stories: SignalStory[], matched: Set<string>, limit: number): SignalStory[] {
  return stories
    .filter((s) => !matched.has(s.id) && s.pool !== "Sports")
    .filter((s) => (s.lead !== undefined && s.lead <= 12) || ((s.topicRank ?? 99) <= 8 && s.outlets.length >= 3))
    .filter((s) => !isPolitical(s.title))
    .sort((a, b) => (a.lead ?? 50 + (a.topicRank ?? 50)) - (b.lead ?? 50 + (b.topicRank ?? 50)) || b.outlets.length - a.outlets.length)
    .slice(0, limit);
}
