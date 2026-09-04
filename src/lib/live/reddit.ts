import type { TrendingTopic } from "@/lib/types";
import { isPolitical } from "./politics-filter";

// ---------------------------------------------------------------------------
// Reddit via the official OAuth API (free "script" app: client id + secret,
// application-only token). The public *.json endpoints are aggressively
// rate-limited by IP on shared hosts like Vercel, which is why the old
// scraper silently returned nothing in production.
//
// Env:  REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, optional REDDIT_USER_AGENT
//
// Behaviour:
//   1. If credentials exist → app-only token, oauth.reddit.com, cached 5 min.
//   2. If they don't        → public JSON with a compliant User-Agent (best
//                             effort; works locally, flaky on cloud IPs).
//   3. If everything fails  → an explicit status so the UI can say so honestly.
// ---------------------------------------------------------------------------

const GLOBAL_FALLBACK_SUBREDDIT = "popular";
const RESULT_TTL_MS = 5 * 60 * 1000;
const USER_AGENT =
  process.env.REDDIT_USER_AGENT ??
  "web:the-daily-index:v1.1 (personal newspaper; by /u/the_daily_index)";

export type RedditStatus = "live" | "public" | "unavailable" | "unconfigured";

export interface RedditResult {
  topics: TrendingTopic[];
  status: RedditStatus;
  /** Human-readable explanation, printed in the paper when status !== live. */
  note: string | null;
  fetchedAt: string;
}

interface RedditPost {
  id: string;
  title: string;
  ups: number;
  num_comments: number;
  permalink: string;
  selftext?: string;
  is_self: boolean;
  created_utc: number;
  subreddit: string;
  over_18?: boolean;
  stickied?: boolean;
  url?: string;
  domain?: string;
}

// ---- module-level caches (persist for the life of a warm server instance) --

const g = globalThis as typeof globalThis & {
  __tdiRedditToken?: { token: string; expiresAt: number };
  __tdiRedditCache?: Map<string, { at: number; posts: RedditPost[] }>;
};
const cache = (g.__tdiRedditCache ??= new Map());

/** Clears the in-memory subreddit cache (and any cached OAuth token) so a
 *  manual "Refresh edition" pulls truly fresh posts. Called by /api/refresh. */
export function clearRedditCache() {
  cache.clear();
  delete g.__tdiRedditToken;
}

function hasCredentials(): boolean {
  return Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET);
}

async function getAppToken(): Promise<string | null> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;

  const cached = g.__tdiRedditToken;
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  try {
    const basic = Buffer.from(`${id}:${secret}`).toString("base64");
    const res = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
      },
      body: "grant_type=client_credentials",
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      console.error("[reddit] token request failed:", res.status, await res.text().catch(() => ""));
      return null;
    }
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) return null;
    g.__tdiRedditToken = {
      token: json.access_token,
      expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    };
    return json.access_token;
  } catch (err) {
    console.error("[reddit] token error:", err);
    return null;
  }
}

function parseListing(json: unknown): RedditPost[] {
  const data = (json as { data?: { children?: Array<{ data: RedditPost }> } })?.data;
  if (!data?.children) return [];
  return data.children.map((c) => c.data).filter(Boolean);
}

async function fetchSubredditPosts(
  subreddit: string,
  token: string | null,
): Promise<{ posts: RedditPost[]; via: "live" | "public" } | null> {
  const key = subreddit.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < RESULT_TTL_MS) {
    return { posts: hit.posts, via: token ? "live" : "public" };
  }

  const url = token
    ? `https://oauth.reddit.com/r/${encodeURIComponent(subreddit)}/top?limit=10&t=day&raw_json=1`
    : `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/top.json?limit=10&t=day&raw_json=1`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) {
      console.error(`[reddit] r/${subreddit} → HTTP ${res.status}`);
      return null;
    }
    const posts = parseListing(await res.json());
    cache.set(key, { at: Date.now(), posts });
    return { posts, via: token ? "live" : "public" };
  } catch (err) {
    console.error(`[reddit] r/${subreddit} fetch error:`, err);
    return null;
  }
}

function toTopic(p: RedditPost): TrendingTopic {
  const excerpt = (p.selftext ?? "")
    .replace(/\s+/g, " ")
    .replace(/https?:\/\/\S+/g, "")
    .trim();
  const external =
    !p.is_self && p.domain && !p.domain.startsWith("self.") && !p.domain.includes("redd.it")
      ? p.domain.replace(/^www\./, "")
      : null;
  return {
    id: `reddit-${p.id}`,
    label: p.title,
    platform: "reddit",
    detail: `r/${p.subreddit} · ${p.ups.toLocaleString()} upvotes · ${p.num_comments.toLocaleString()} comments`,
    url: `https://www.reddit.com${p.permalink}`,
    summary: excerpt
      ? excerpt.length > 220
        ? `${excerpt.slice(0, 217).trimEnd()}…`
        : excerpt
      : external
        ? `Link post via ${external}.`
        : undefined,
    subreddit: p.subreddit,
    score: p.ups,
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

export async function getRedditTrending(
  limit = 5,
  subreddits?: string[],
): Promise<RedditResult> {
  const toFetch =
    subreddits && subreddits.length > 0 ? subreddits : [GLOBAL_FALLBACK_SUBREDDIT];
  const fetchedAt = new Date().toISOString();

  const token = await getAppToken();
  const configured = hasCredentials();

  const results = await Promise.all(toFetch.map((s) => fetchSubredditPosts(s, token)));

  const perSub = results.map((r) =>
    (r?.posts ?? [])
      .filter((p) => !p.over_18 && !p.stickied && !isPolitical(p.title))
      .map(toTopic),
  );
  const topics = interleave(perSub).slice(0, limit);
  const anyOk = results.some((r) => r !== null);
  const failedSubs = toFetch.filter((_, i) => results[i] === null);

  if (topics.length > 0) {
    const via = token ? "live" : "public";
    const note =
      failedSubs.length > 0
        ? `Couldn't reach r/${failedSubs.join(", r/")} this time.`
        : !configured
          ? "Fetched without API credentials — set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET for a reliable feed."
          : null;
    return { topics, status: via, note, fetchedAt };
  }

  if (!configured && !anyOk) {
    return {
      topics: [],
      status: "unconfigured",
      note:
        "Reddit's public endpoints turned us away and no API credentials are configured. Add REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET (free script app) to restore this column.",
      fetchedAt,
    };
  }

  return {
    topics: [],
    status: "unavailable",
    note: anyOk
      ? `r/${toFetch.join(", r/")} had nothing non-political worth printing in the last 24 hours.`
      : "Reddit didn't answer in time. The column will return on the next refresh.",
    fetchedAt,
  };
}
