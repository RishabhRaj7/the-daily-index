import type { WireBrief } from "@/lib/types";
import { MAX_AGE_HOURS } from "./rss";

interface HNItem {
  id: number;
  title?: string;
  url?: string;
  score?: number;
  descendants?: number;
  time: number;
}

function timeAgo(unixSeconds: number): string {
  const diffMs = Date.now() - unixSeconds * 1000;
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function domainFrom(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "news.ycombinator.com";
  }
}

export async function getTechWire(limit = 8): Promise<WireBrief[]> {
  try {
    const idsRes = await fetch(
      "https://hacker-news.firebaseio.com/v0/topstories.json",
      { next: { revalidate: 1800 } },
    );
    if (!idsRes.ok) return [];
    const allIds: number[] = await idsRes.json();
    // HN's front page mixes chronological order with score-driven ranking, so
    // a story can sit near the top for days — scan a wider pool than we need
    // since the freshness filter below will drop most of the older ones.
    const ids = allIds.slice(0, 60);

    const items = await Promise.all(
      ids.map((id) =>
        fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
          next: { revalidate: 1800 },
        })
          .then((r) => (r.ok ? (r.json() as Promise<HNItem>) : null))
          .catch(() => null),
      ),
    );

    const maxAgeMs = MAX_AGE_HOURS * 3_600_000;
    return items
      .filter((item): item is HNItem => Boolean(item?.url && item?.title))
      .filter((item) => Date.now() - item.time * 1000 <= maxAgeMs)
      .slice(0, limit)
      .map((item) => ({
        id: String(item.id),
        title: item.title as string,
        url: item.url as string,
        domain: domainFrom(item.url as string),
        points: item.score ?? 0,
        comments: item.descendants ?? 0,
        postedAgo: timeAgo(item.time),
      }));
  } catch {
    return [];
  }
}
