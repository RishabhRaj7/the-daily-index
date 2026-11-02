import type { TrendingTopic } from "@/lib/types";
import { getStore } from "@/lib/server/store";
import { decodeEntities } from "./rss";
import { noteCopy, noteSource, skipped, socialCtx } from "./social-context";

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
const FRESH_MS = 5 * 60_000;
/** A copy is served while a new one waits its turn, for up to three days. */
const KEEP_S = 3 * 86_400;
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

// Threads that are about the subreddit rather than the news (daily and weekly
// threads, megathreads, mod posts), and titles too short to say anything.
const HOUSEKEEPING =
  /\b(daily|weekly|monthly|weekend)\s+(discussion|thread|general|questions?|chat|megathread)\b|\bmega ?thread\b|\bdiscussion thread\b|\bfree ?talk\b|\bsimple questions\b|\bask anything\b|^\s*\[?meta\]?\s|\bmod(erator)? (post|announcement)\b|\b(pre|post)-?(race|qualifying|quali|sprint|session|match) (discussion|thread)\b|\b(race|qualifying|sprint|match|game) thread\b/i;

/** Worth a reader's time: says something on its own and isn't the subreddit's own housekeeping. */
export function worthReading(title: string): boolean {
  const t = title.replace(/\s+/g, " ").trim();
  return t.replace(/[^\p{L}\p{N}]/gu, "").length >= 10 && !HOUSEKEEPING.test(t);
}

export function parseAtom(xml: string): RedditHit[] {
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
 * "hot", or "top" of the day. Null only when Reddit has never answered for it.
 * `force` (a reader's refresh button) asks for a new read of a copy older
 * than a minute; it still waits its turn (readGated).
 */
export function redditFeed(subreddits: string[], sort: "new" | "hot" | "top" = "new", opts: { force?: boolean } = {}): Promise<RedditHit[] | null> {
  if (!enabled() || subreddits.length === 0 || skipped("reddit")) return Promise.resolve(null);
  const subs = [...new Set(subreddits.map((s) => s.toLowerCase()))].sort();
  const qs = sort === "top" ? "?t=day&limit=100" : "?limit=100";
  return readGated(`reddit:rss:v1:${sort}:${subs.join("+")}`, `https://www.reddit.com/r/${subs.map(encodeURIComponent).join("+")}/${sort}/.rss${qs}`, opts.force);
}

// ---- one read a minute ------------------------------------------------------------
//
// Reddit's public RSS allows one read per minute per address: its answers say
// so (x-ratelimit-remaining 0 after the first, x-ratelimit-reset counting down
// to the next minute) and every other read in that minute gets 429. Measured
// 1 Nov 2026. So every Reddit read here takes the one slot first, shared by
// every server through the store; Reddit's own headers then say when the next
// may go (sooner, if it ever allows more). A feed that can't have the slot
// serves its last copy at once (kept three days), so a page never waits on
// Reddit; a feed with no copy yet says it is waiting and the page asks again
// shortly. Copies count as fresh for five minutes.

const SLOT = "reddit:slot:v1";
const inflight = new Map<string, Promise<RedditHit[] | null>>();
/** Feeds still waiting for their first read (the page asks again soon). */
const waitingFirst = new Set<string>();
/** Feeds whose last read failed with no copy to fall back on (the page counts these as Reddit failing). */
const failedFirst = new Set<string>();

/** When each feed's copy was read (ms), for "updated 3m ago". */
export function redditCopyAt(key: string): number | null {
  return memory.get(key)?.at ?? null;
}
export const redditKey = (subreddits: string[], sort: "new" | "hot" | "top") =>
  `reddit:rss:v1:${sort}:${[...new Set(subreddits.map((s) => s.toLowerCase()))].sort().join("+")}`;
export const popularKey = (geo: "IN" | "GLOBAL") => `reddit:rss:v1:popular:${geo}`;
/** True when any of these feeds has nothing yet and is waiting for its turn. */
export const redditWaiting = (keys: string[]) => keys.some((k) => waitingFirst.has(k));

/** Feeds with nothing to show yet, shared by every server: they get the next slot before a feed that has a copy. */
const FIRST = "reddit:first:v1";

async function takeSlot(key: string, hasCopy: boolean): Promise<boolean> {
  const store = getStore();
  const first = (await store.get<string[]>(FIRST).catch(() => null)) ?? [];
  if (!hasCopy && !first.includes(key)) await store.set(FIRST, [...first, key].slice(-20), { ttlSeconds: 600 }).catch(() => {});
  // A feed with a copy steps aside while one with none is waiting.
  if (hasCopy && first.some((k) => k !== key)) return false;
  return store.setIfAbsent(SLOT, 1, 61).catch(() => true);
}

async function doneFirst(key: string): Promise<void> {
  const store = getStore();
  const first = (await store.get<string[]>(FIRST).catch(() => null)) ?? [];
  if (first.includes(key)) await store.set(FIRST, first.filter((k) => k !== key), { ttlSeconds: 600 }).catch(() => {});
}

/** After a read: hold the slot until Reddit says the next may go, or free it when Reddit allows more. */
async function settleSlot(res: Response | null): Promise<void> {
  const store = getStore();
  if (!res) return void (await store.set(SLOT, 1, { ttlSeconds: 30 }).catch(() => {}));
  const remaining = Number(res.headers.get("x-ratelimit-remaining"));
  const reset = Number(res.headers.get("x-ratelimit-reset"));
  const retry = Number(res.headers.get("retry-after"));
  if (res.status !== 429 && Number.isFinite(remaining) && remaining >= 1) return void (await store.del(SLOT).catch(() => {}));
  const wait = res.status === 429 && retry > 0 ? retry : reset > 0 ? reset : 60;
  await store.set(SLOT, 1, { ttlSeconds: Math.min(300, Math.ceil(wait) + 1) }).catch(() => {});
}

function readGated(key: string, url: string, force = false): Promise<RedditHit[] | null> {
  const asked = force || !!socialCtx()?.force;
  // Two asks at once (the page and the browser, say) share one read.
  let p = inflight.get(key);
  if (!p) {
    p = readFeed(key, url, asked).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  // Each asker learns how old the copy it got is, or that there's none yet.
  return p.then((hits) => {
    const copy = memory.get(key);
    const failed = !copy && hits === null && failedFirst.has(key);
    noteCopy(copy?.at ?? null, !copy && hits === null && !failed);
    noteSource("reddit", copy || hits !== null ? "ok" : failed ? "failed" : "waiting");
    return hits;
  });
}

async function readFeed(key: string, url: string, force: boolean): Promise<RedditHit[] | null> {
  const now = Date.now();
  const fresh = (at: number) => (force ? now - at < 60_000 : now - at < FRESH_MS);
  const mem = memory.get(key);
  if (mem && fresh(mem.at)) return mem.hits;
  const store = getStore();
  const kept = await store.get<{ at: number; hits: RedditHit[] }>(key).catch(() => null);
  if (kept) memory.set(key, kept);
  if (kept && fresh(kept.at)) return kept.hits;
  // Not our turn: the last copy now, a new one when the slot comes round.
  if (!(await takeSlot(key, !!kept))) {
    if (!kept) waitingFirst.add(key);
    return kept?.hits ?? null;
  }
  let res: Response | null = null;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/atom+xml,application/xml" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const hits = parseAtom(await res.text()).filter((h) => worthReading(h.title));
    const copy = { at: now, hits };
    memory.set(key, copy);
    waitingFirst.delete(key);
    failedFirst.delete(key);
    await Promise.all([store.set(key, copy, { ttlSeconds: KEEP_S }).catch(() => {}), doneFirst(key)]);
    return hits;
  } catch (err) {
    console.error(`[reddit] ${url.replace("https://www.reddit.com", "")} failed:`, err instanceof Error ? err.message : err);
    // A subreddit that doesn't exist (or is private or banned) won't answer next time either: kept as empty, out of the queue.
    if (res && [403, 404, 451].includes(res.status)) {
      const copy = { at: now, hits: [] as RedditHit[] };
      memory.set(key, copy);
      waitingFirst.delete(key);
      await Promise.all([store.set(key, copy, { ttlSeconds: KEEP_S }).catch(() => {}), doneFirst(key)]);
      return [];
    }
    if (!kept) {
      waitingFirst.add(key);
      failedFirst.add(key);
    }
    return kept?.hits ?? null;
  } finally {
    await settleSlot(res);
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

/**
 * What Reddit's front page is reading: r/popular's hot list, for India
 * (Reddit's own geo filter) or everywhere. Read through the same one-a-minute
 * slot as the subreddit feeds.
 */
export function popularFeed(geo: "IN" | "GLOBAL", opts: { force?: boolean } = {}): Promise<RedditHit[] | null> {
  if (!enabled() || skipped("reddit")) return Promise.resolve(null);
  return readGated(popularKey(geo), `https://www.reddit.com/r/popular/hot/.rss?geo_filter=${geo}&limit=50`, opts.force);
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
    return { topics: [], status: "unavailable", note: `r/${toFetch.join(", r/")} had nothing worth printing today.`, fetchedAt };
  }
  return { topics, status: "live", note: null, fetchedAt };
}
