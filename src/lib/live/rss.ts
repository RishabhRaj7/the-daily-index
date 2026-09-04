import type { WireBrief } from "@/lib/types";
import { isPolitical } from "./politics-filter";

function decodeEntities(input: string): string {
  return input
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    // numeric entities (&#8217; etc) and hex (&#x2019;) — covers curly
    // quotes/dashes that named-entity handling above misses
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function stripCdata(raw: string): string {
  return raw
    .replace(/^\s*<!\[CDATA\[/, "")
    .replace(/\]\]>\s*$/, "")
    .trim();
}

function extractTag(itemXml: string, tag: string): string | null {
  const match = itemXml.match(
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"),
  );
  if (!match) return null;
  return decodeEntities(stripCdata(match[1]));
}

// RSS thumbnails are attribute-based self-closing tags (media:content,
// media:thumbnail, enclosure) rather than <tag>content</tag> — these come
// straight from the publisher's own feed, not a third-party image API.
function extractImage(itemXml: string): string | undefined {
  const mediaContent = itemXml.match(
    /<media:content[^>]*\burl="([^"]+)"[^>]*medium="image"/i,
  ) ?? itemXml.match(/<media:content[^>]*medium="image"[^>]*\burl="([^"]+)"/i);
  if (mediaContent) return mediaContent[1];

  const mediaThumb = itemXml.match(/<media:thumbnail[^>]*\burl="([^"]+)"/i);
  if (mediaThumb) return mediaThumb[1];

  const enclosure = itemXml.match(
    /<enclosure[^>]*\burl="([^"]+)"[^>]*type="image[^"]*"/i,
  );
  if (enclosure) return enclosure[1];

  return undefined;
}

function domainFrom(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function timeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// "Within 24 hours, ±6 hours" — everything shown as live news should be
// recent. Items with no parseable pubDate are dropped rather than assumed
// fresh, since we can't otherwise verify the 30h window.
export const MAX_AGE_HOURS = 30;

export function ageInHours(date: Date): number {
  return (Date.now() - date.getTime()) / 3_600_000;
}

// Kept deliberately long — this text feeds the LLM summarizer, so more is
// better. The LLM condenses it; we just don't want it starved of context.
function summarize(description: string, maxLen = 2000): string {
  const clean = description
    // block-level/line-break tags collapse to nothing otherwise, jamming
    // adjacent sentences together ("round.Following...") — turn them into
    // a space first, then strip whatever tags remain.
    .replace(/<\s*(br|\/p|\/div|\/li)\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s*(Keep reading|Continue reading|Read more|\[…])\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen).replace(/\s+\S*$/, "") + "…";
}

export async function fetchRssFeed(
  url: string,
  revalidate: number,
  titleFilter?: (title: string, description: string) => boolean,
): Promise<WireBrief[]> {
  try {
    const res = await fetch(url, { next: { revalidate } });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(
      (m) => m[1],
    );

    return items
      .map((item): WireBrief | null => {
        const title = extractTag(item, "title");
        const link = extractTag(item, "link");
        const description = extractTag(item, "description") ?? "";
        const pubDateRaw = extractTag(item, "pubDate");
        if (!title || !link) return null;
        if (isPolitical(`${title} ${description}`)) return null;
        if (titleFilter && !titleFilter(title, description)) return null;

        const date = pubDateRaw ? new Date(pubDateRaw) : null;
        if (!date || Number.isNaN(date.getTime())) return null;
        if (ageInHours(date) > MAX_AGE_HOURS) return null;

        return {
          id: link,
          title,
          url: link,
          domain: domainFrom(link),
          image: extractImage(item),
          summary: description ? summarize(description) : undefined,
          postedAgo: timeAgo(date),
        };
      })
      .filter((b): b is WireBrief => b !== null);
  } catch {
    return [];
  }
}

export function interleaveWires(lists: WireBrief[][]): WireBrief[] {
  const out: WireBrief[] = [];
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max; i++) {
    for (const list of lists) {
      if (list[i]) out.push(list[i]);
    }
  }
  return out;
}

const STOP_WORDS = new Set([
  "the","a","an","is","at","of","to","for","by","in","as","with","and","or",
  "on","its","it","was","has","have","be","are","were","will","from","that",
  "this","he","she","they","his","her","their","who","which","but","not","s",
]);

function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
  );
}

// Removes near-duplicate articles where ≥60% of the shorter title's
// significant words overlap — catches the same story from two RSS sources.
export function dedupeWires(briefs: WireBrief[]): WireBrief[] {
  const kept: WireBrief[] = [];
  for (const brief of briefs) {
    const tokens = titleTokens(brief.title);
    const isDupe = kept.some((k) => {
      const kTokens = titleTokens(k.title);
      const overlap = [...tokens].filter((t) => kTokens.has(t)).length;
      const minLen = Math.min(tokens.size, kTokens.size);
      return minLen > 0 && overlap / minLen >= 0.6;
    });
    if (!isDupe) kept.push(brief);
  }
  return kept;
}
