import type { TrendingTopic } from "@/lib/types";
import { getStore } from "@/lib/server/store";
import { isPolitical } from "./politics-filter";
import { decodeEntities } from "./rss";

// ---------------------------------------------------------------------------
// Reddit through its public RSS feeds (Atom): /r/<a+b+c>/<sort>/.rss. The API
// is closed to new apps, and its search (search.rss too) is rate-limited
// within a couple of reads, so nothing here searches: each group of
// subreddits is one feed of up to 100 posts, filtered on our side.
//
// Every feed is kept in the store for 10 minutes and shared by every reader
// (and by the Grapevine, IPO chatter and Clutch's transfer window), so Reddit
// sees a handful of reads an hour however many people load the paper. A feed
// that fails keeps its last good copy for a day.
//
// The feeds carry no upvote or comment counts: a post's place in a "top" or
// "hot" feed stands in for them.
//
// Env: REDDIT_RSS=false switches Reddit off; optional REDDIT_USER_AGENT.
// ---------------------------------------------------------------------------

const GLOBAL_FALLBACK_SUBREDDIT = "popular";
const FRESH_MS = 10 * 60_000;
const KEEP_S = 86_400;
const USER_AGENT =
  process.env.REDDIT_USER_AGENT ??
  "web:the-daily-index:v1.2 (personal newspaper; by /u/the_daily_index)";

export type RedditStatus = "live" | "public" | "unavailable" | "unconfigured";

export interface RedditResult {
  topics: TrendingTopic[];
  status: RedditStatus;
  /** Human-readable explanation, printed in the paper when status !== live. */
  note: string | null;
  fetchedAt: string;
}

export interface RedditHit {
  id: string;
  title: string;
  text: string;
  subreddit: string;
  author: string | null;
  url: string;
  /** External link the post points at, when it isn't a text post. */
  link: string | null;
  createdAt: string;
  /** Place in the feed (0 = first): Reddit's own ranking for top/hot. */
  rank: number;
}

// Its own switch: REDDIT_ENABLED belonged to the closed API and may still be "false" in an environment.
const enabled = () => process.env.REDDIT_RSS !== "false";

const g = globalThis as typeof globalThis & { __tdiRedditFeeds?: Map<string, { at: number; hits: RedditHit[] }> };
const memory = (g.__tdiRedditFeeds ??= new Map());

/** Clears the in-memory feed cache so a manual "Refresh edition" reads Reddit again. Called by /api/refresh. */
export function clearRedditCache() {
  memory.clear();
}

const stripHtml = (html: string) =>
  decodeEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/submitted by\s+\/u\/\S+.*$/i, "")
    .replace(/\[link\]|\[comments\]/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();

function parseAtom(xml: string): RedditHit[] {
  const out: RedditHit[] = [];
  for (const [i, m] of [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].entries()) {
    const e = m[1];
    const tag = (t: string) => e.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1] ?? null;
    const title = decodeEntities(tag("title") ?? "").trim();
    const url = e.match(/<link href="([^"]+)"/)?.[1] ?? "";
    const id = (tag("id") ?? url).replace(/^t3_/, "");
    if (!title || !url) continue;
    const content = decodeEntities(tag("content") ?? "");
    // A link post's "[link]" points away from Reddit.
    const link = content.match(/<a href="([^"]+)">\[link\]<\/a>/)?.[1] ?? null;
    out.push({
      id,
      title,
      text: stripHtml(content).slice(0, 400),
      subreddit: e.match(/<category[^>]*term="([^"]+)"/)?.[1] ?? "",
      author: tag("name")?.replace(/^\/u\//, "") ?? null,
      url,
      link: link && !/reddit\.com|redd\.it/.test(link) ? decodeEntities(link) : null,
      createdAt: tag("published") ?? tag("updated") ?? new Date().toISOString(),
      rank: i,
    });
  }
  return out;
}

/**
 * One feed of posts from the given subreddits together: "new" (newest first),
 * "hot", or "top" of the day. Kept 10 minutes for everyone; null only when
 * Reddit has never answered for it.
 */
export function redditFeed(subreddits: string[], sort: "new" | "hot" | "top" = "new"): Promise<RedditHit[] | null> {
  if (!enabled() || subreddits.length === 0) return Promise.resolve(null);
  const subs = [...new Set(subreddits.map((s) => s.toLowerCase()))].sort();
  const key = `reddit:rss:v1:${sort}:${subs.join("+")}`;
  // Two asks at once (the page and the browser, say) share one read: Reddit's
  // RSS turns a burst away.
  const going = inflight.get(key);
  if (going) return going;
  const p = readFeed(key, subs, sort).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

const inflight = new Map<string, Promise<RedditHit[] | null>>();

async function readFeed(key: string, subs: string[], sort: "new" | "hot" | "top"): Promise<RedditHit[] | null> {
  const now = Date.now();
  const mem = memory.get(key);
  if (mem && now - mem.at < FRESH_MS) return mem.hits;
  const store = getStore();
  const kept = await store.get<{ at: number; hits: RedditHit[] }>(key).catch(() => null);
  if (kept && now - kept.at < FRESH_MS) {
    memory.set(key, kept);
    return kept.hits;
  }

  const qs = sort === "top" ? "?t=day&limit=100" : "?limit=100";
  try {
    const res = await fetch(`https://www.reddit.com/r/${subs.map(encodeURIComponent).join("+")}/${sort}/.rss${qs}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/atom+xml,application/xml" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const hits = parseAtom(await res.text()).filter((h) => !isPolitical(h.title));
    const fresh = { at: now, hits };
    memory.set(key, fresh);
    await store.set(key, fresh, { ttlSeconds: KEEP_S }).catch(() => {});
    return hits;
  } catch (err) {
    console.error(`[reddit] r/${subs.join("+")} (${sort}) failed:`, err);
    // Ask again in a minute, not on every read.
    if (kept) memory.set(key, { at: now - FRESH_MS + 60_000, hits: kept.hits });
    return kept?.hits ?? null;
  }
}

function toTopic(h: RedditHit): TrendingTopic {
  const external = h.link ? h.link.replace(/^https?:\/\/(www\.)?/, "").split("/")[0] : null;
  return {
    id: `reddit-${h.id}`,
    label: h.title,
    platform: "reddit",
    detail: `r/${h.subreddit}${h.author ? ` · u/${h.author}` : ""}`,
    url: h.url,
    summary: h.text ? (h.text.length > 220 ? `${h.text.slice(0, 217).trimEnd()}…` : h.text) : external ? `Link post via ${external}.` : undefined,
    subreddit: h.subreddit,
    // The feed's own order, highest first.
    score: 100 - h.rank,
  };
}

function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max; i++) {
    for (const list of lists) if (list[i]) out.push(list[i]);
  }
  return out;
}

/** The Grapevine's Reddit column: the day's top posts across the reader's subreddits, a fair share each. */
export async function getRedditTrending(limit = 5, subreddits?: string[]): Promise<RedditResult> {
  const fetchedAt = new Date().toISOString();
  if (!enabled()) {
    return { topics: [], status: "unconfigured", note: "Reddit is switched off (REDDIT_RSS=false).", fetchedAt };
  }
  const toFetch = subreddits && subreddits.length > 0 ? subreddits : [GLOBAL_FALLBACK_SUBREDDIT];
  const hits = await redditFeed(toFetch, "top");
  if (!hits) {
    return { topics: [], status: "unavailable", note: "Reddit didn't answer this time. The column will return on the next refresh.", fetchedAt };
  }
  // One feed for all of them: split it back by subreddit so each gets a turn.
  const by = new Map<string, RedditHit[]>();
  for (const h of hits) by.set(h.subreddit.toLowerCase(), [...(by.get(h.subreddit.toLowerCase()) ?? []), h]);
  const topics = interleave([...by.values()]).slice(0, limit).map(toTopic);
  if (topics.length === 0) {
    return { topics: [], status: "unavailable", note: `r/${toFetch.join(", r/")} had nothing non-political worth printing today.`, fetchedAt };
  }
  return { topics, status: "live", note: null, fetchedAt };
}
