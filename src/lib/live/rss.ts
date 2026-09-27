import type { WireBrief } from "@/lib/types";
import type { FeedSource } from "./feeds";
import { isPolitical } from "./politics-filter";

export function decodeEntities(input: string): string {
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

// RFC 822 dates only carry numeric offsets or US/UT zone names as far as
// `Date` is concerned — "Sat, 26 Sep 2026 23:15:00 BST" (Sky Sports) parses
// to Invalid Date, which silently dropped every Sky item all summer. Swap
// the abbreviations our feeds actually use for their offsets first.
const ZONE_OFFSETS: Record<string, string> = {
  BST: "+0100",
  IST: "+0530", // India — the only IST among our sources
  CET: "+0100",
  CEST: "+0200",
  JST: "+0900",
  HKT: "+0800",
  SGT: "+0800",
  AEST: "+1000",
  AEDT: "+1100",
};

export function parseFeedDate(raw: string | null): Date | null {
  if (!raw) return null;
  const normalized = raw
    .trim()
    .replace(/\b(BST|IST|CET|CEST|JST|HKT|SGT|AEST|AEDT)\s*$/, (zone) => ZONE_OFFSETS[zone]);
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

// RSS items are <item>…</item>; Atom entries are <entry>…</entry>. Either may
// carry attributes (RDF feeds write <item rdf:about="…">), which the old
// bare `<item>` pattern missed.
function splitEntries(xml: string): { entries: string[]; atom: boolean } {
  const items = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  if (items.length > 0) return { entries: items, atom: false };
  const entries = [...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
  return { entries, atom: true };
}

// Atom links are attributes: <link rel="alternate" href="…"/>. Prefer the
// alternate (the article page) over self/edit/enclosure links.
function extractAtomLink(entryXml: string): string | null {
  const links = [...entryXml.matchAll(/<link\b([^>]*)\/?>/gi)].map((m) => m[1]);
  const href = (attrs: string) => attrs.match(/\bhref="([^"]+)"/i)?.[1] ?? null;
  const alternate = links.find((attrs) => {
    const rel = attrs.match(/\brel="([^"]+)"/i)?.[1];
    return !rel || rel === "alternate";
  });
  const chosen = alternate ?? links[0];
  return chosen ? decodeEntities(href(chosen) ?? "") || null : null;
}

// Some CDNs refuse Node's default fetch UA outright; identify ourselves.
const FEED_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; TheDailyIndex/1.0; personal RSS reader)",
  Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8",
};

export async function fetchRssFeed(
  source: FeedSource | string,
  revalidate: number,
  titleFilter?: (title: string, description: string) => boolean,
): Promise<WireBrief[]> {
  const feed: FeedSource = typeof source === "string" ? { url: source } : source;
  const maxAge = feed.maxAgeHours ?? MAX_AGE_HOURS;
  try {
    const res = await fetch(feed.url, {
      headers: FEED_HEADERS,
      next: { revalidate },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const { entries, atom } = splitEntries(xml);

    return entries
      .map((item): WireBrief | null => {
        const title = extractTag(item, "title");
        const link = atom ? extractAtomLink(item) : extractTag(item, "link");
        const description = atom
          ? (extractTag(item, "summary") ?? extractTag(item, "content") ?? "")
          : (extractTag(item, "description") ?? "");
        const dateRaw = atom
          ? (extractTag(item, "published") ?? extractTag(item, "updated"))
          : (extractTag(item, "pubDate") ?? extractTag(item, "dc:date"));
        if (!title || !link) return null;
        // Headline only: a geopolitics story whose snippet mentions an
        // upcoming election is still geopolitics.
        if (feed.politicsFilter && isPolitical(title)) return null;
        if (titleFilter && !titleFilter(title, description)) return null;

        const date = parseFeedDate(dateRaw);
        // Undated items are only trusted from feeds known to be a rolling
        // newest-first window; anywhere else we can't verify freshness.
        if (!date && !feed.undated) return null;
        if (date && ageInHours(date) > maxAge) return null;

        return {
          id: link,
          title,
          url: link,
          domain: domainFrom(link),
          image: extractImage(item),
          summary: description ? summarize(description) : undefined,
          // Empty for undated items: downstream prints "recently" and the
          // digest treats the age as unknown rather than inventing one.
          postedAgo: date ? timeAgo(date) : "",
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
