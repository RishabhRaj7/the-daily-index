import { getStore } from "@/lib/server/store";
import { recordExtra } from "./build-report";

// Google News links → the publisher's own URL.
//
// Google News items link to news.google.com/rss/articles/<id>, not the
// article. Printing that is a Google wrapper, and fetching it for full text
// returns Google's page, not the story, so the writer only ever saw a
// headline. The id no longer carries the URL in plain base64 (Google moved
// to opaque ids in 2024): the article page holds a signature and timestamp,
// and Google's own batchexecute call trades them for the URL. Tested Sept 30
// 2026: ~0.45s per link, and Google answers 429 after about ten quick
// requests on one path.
//
// So decoding is careful: only the stories the paper prints are decoded,
// each result is cached for a month (a story's URL never changes), a few run
// at a time, and the first 429 stops the rest of this build — those keep the
// Google link, which still opens the story.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const CACHE_TTL = 30 * 86_400;
const CONCURRENCY = 3;
/** At most this many decoded per build; the rest keep their Google link. */
const MAX_PER_RUN = 30;

export function isGoogleNewsUrl(url: string): boolean {
  return /^https:\/\/news\.google\.com\/(rss\/)?articles\//.test(url);
}

function articleId(url: string): string | null {
  try {
    return new URL(url).pathname.split("/").pop() || null;
  } catch {
    return null;
  }
}

class RateLimited extends Error {}

async function signature(id: string): Promise<{ sg: string; ts: string } | null> {
  // Two paths serve the same page and are limited separately.
  for (const path of ["articles", "rss/articles"]) {
    const res = await fetch(`https://news.google.com/${path}/${id}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 429) continue;
    if (!res.ok) return null;
    const html = await res.text();
    const sg = html.match(/data-n-a-sg="([^"]+)"/)?.[1];
    const ts = html.match(/data-n-a-ts="([^"]+)"/)?.[1];
    return sg && ts ? { sg, ts } : null;
  }
  throw new RateLimited();
}

async function decodeOne(id: string): Promise<string | null> {
  const sig = await signature(id);
  if (!sig) return null;
  const inner = `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${id}",${sig.ts},"${sig.sg}"]`;
  const res = await fetch("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "User-Agent": UA },
    body: "f.req=" + encodeURIComponent(JSON.stringify([[["Fbv4je", inner, null, "generic"]]])),
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 429) throw new RateLimited();
  if (!res.ok) return null;
  // `)]}'` then a JSON array whose "wrb.fr" row holds a JSON string:
  // ["garturlres","<url>",1].
  const body = (await res.text()).replace(/^\)\]\}'\s*/, "");
  try {
    const rows = JSON.parse(body.slice(0, body.lastIndexOf("]") + 1)) as unknown[][];
    const row = rows.find((r) => r[0] === "wrb.fr" && r[1] === "Fbv4je");
    const inner = typeof row?.[2] === "string" ? (JSON.parse(row[2]) as unknown[]) : null;
    const url = inner?.[0] === "garturlres" && typeof inner[1] === "string" ? inner[1] : null;
    return url && /^https?:\/\//.test(url) && !isGoogleNewsUrl(url) ? url : null;
  } catch {
    return null;
  }
}

/**
 * Resolve Google News links to publisher URLs. Returns only the ones that
 * resolved; anything missing from the map keeps its Google link.
 */
export async function resolveGoogleLinks(urls: string[]): Promise<Map<string, string>> {
  const wanted = [...new Set(urls.filter(isGoogleNewsUrl))];
  const out = new Map<string, string>();
  if (wanted.length === 0) return out;

  const ids = new Map(wanted.map((u) => [u, articleId(u)]));
  const store = getStore();
  const cached = await store
    .getMany<string>([...ids.values()].filter((id): id is string => Boolean(id)).map((id) => `gn:${id}`))
    .catch(() => new Map<string, string>());
  for (const [url, id] of ids) {
    const hit = id ? cached.get(`gn:${id}`) : undefined;
    if (hit) out.set(url, hit);
  }

  const todo = wanted.filter((u) => !out.has(u) && ids.get(u)).slice(0, MAX_PER_RUN);
  let limited = false;
  const fresh = new Map<string, string>();
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, todo.length) }, async () => {
      while (cursor < todo.length && !limited) {
        const url = todo[cursor++];
        const id = ids.get(url)!;
        try {
          const resolved = await decodeOne(id);
          if (resolved) {
            out.set(url, resolved);
            fresh.set(`gn:${id}`, resolved);
          }
        } catch (err) {
          if (err instanceof RateLimited) limited = true;
        }
      }
    }),
  );
  if (fresh.size > 0) await store.setMany(fresh, CACHE_TTL).catch(() => {});

  recordExtra({
    googleLinks: {
      attempted: wanted.length,
      resolved: out.size,
      cached: out.size - fresh.size,
      // Includes links skipped once Google rate-limited us.
      failed: wanted.length - out.size,
      limited,
    },
  });
  return out;
}
