import type { TrendingTopic } from "@/lib/types";
import { isPolitical } from "./politics-filter";
import { summarizeTrend } from "./summarize";

// Fallback when the user hasn't configured subreddits — fetch the globally
// popular feed so there's always something live rather than a hardcoded list.
const GLOBAL_FALLBACK_SUBREDDIT = "popular";

interface RedditPost {
  id: string;
  title: string;
  ups: number;
  num_comments: number;
  permalink: string;
  selftext?: string;
  is_self: boolean;
  created_utc: number;
}

async function fetchSubredditTop(subreddit: string): Promise<TrendingTopic[]> {
  try {
    const res = await fetch(
      `https://www.reddit.com/r/${subreddit}/top.json?limit=6&t=day`,
      {
        headers: { "User-Agent": "TheDailyIndexPersonalProject/1.0" },
        next: { revalidate: 1800 },
      },
    );
    if (!res.ok) return [];
    const json = await res.json();
    const posts: RedditPost[] = json.data.children.map((c: { data: RedditPost }) => c.data);

    // Reddit's t=day already scopes recency — no extra age filter needed.
    const filtered = posts.filter((p) => !isPolitical(p.title));

    return Promise.all(
      filtered.map(async (p) => {
        const aiSummary = await summarizeTrend(p.title, subreddit, p.ups, p.num_comments);
        return {
          id: p.id,
          label: p.title,
          platform: "reddit" as const,
          detail: `r/${subreddit} · ${p.ups.toLocaleString()} upvotes · ${p.num_comments.toLocaleString()} comments`,
          url: `https://www.reddit.com${p.permalink}`,
          summary: aiSummary ?? undefined,
        };
      }),
    );
  } catch {
    return [];
  }
}

function interleave(lists: TrendingTopic[][]): TrendingTopic[] {
  const out: TrendingTopic[] = [];
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max; i++) {
    for (const list of lists) {
      if (list[i]) out.push(list[i]);
    }
  }
  return out;
}

export async function getRedditTrending(
  limit = 5,
  subreddits?: string[],
): Promise<TrendingTopic[]> {
  const toFetch =
    subreddits && subreddits.length > 0 ? subreddits : [GLOBAL_FALLBACK_SUBREDDIT];
  const results = await Promise.all(toFetch.map(fetchSubredditTop));
  return interleave(results).slice(0, limit);
}
