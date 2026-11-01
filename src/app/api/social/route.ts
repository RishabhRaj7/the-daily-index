import { withSocial } from "@/lib/live/social-context";
import { cleanHandle, DEFAULT_X_ACCOUNTS, f1Chatter, grapevineFeeds, ipoChatter, socialTrends, validHandle, valorantMoves, warmSocial } from "@/lib/live/social";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Every list reads the section's feeds the reader set (lib/feeds.ts) as
// x=handle,… (X accounts) q=search|… (X searches) r=sub,… (subreddits); a
// parameter left out means the paper's default for that section.
//
// GET /api/social?kind=grapevine&x=…&q=…&r=…                         the Grapevine
// GET /api/social?kind=ipo&name=<company>[&x=…&r=…]                   IPO chatter (Reddit + X)
// GET /api/social?kind=val&teams=Paper Rex,…[&x=…&q=…&r=…]            Valorant transfer window
// GET /api/social?kind=f1&drivers=rus,ver&team=Mercedes[&x=…&q=…&r=…]  the paddock on X and Reddit
// GET /api/social?kind=trends                                       trending on X and Reddit (India and everywhere)
// &fresh=1 (a reader's refresh button): copies older than a minute are read
//   again (Reddit's still in turn: it allows one read a minute)
// GET /api/social?kind=warm[&only=rsshub]                         wakes RSSHub, tops up the Reddit archives
//
// Everything upstream is kept 10 minutes in the store and shared by every
// reader (lib/live/social.ts), so this answers fresh without ever hammering
// X or Reddit; the answer itself is never cached.

const list = (raw: string | null, sep: string | RegExp, max: number) =>
  (raw ?? "")
    .split(sep)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  return withSocial(p.get("fresh") === "1", () => answer(p));
}

async function answer(p: URLSearchParams): Promise<Response> {
  const kind = p.get("kind");
  const headers = { "Cache-Control": "no-store" };
  const handles = [...new Set(list(p.get("x"), ",", 12).map(cleanHandle).filter(validHandle))];
  const searches = list(p.get("q"), "|", 4).filter((q) => q.length <= 60);
  const subs = [...new Set(list(p.get("r"), ",", 12).map((r) => r.replace(/^r\//i, "")).filter((r) => /^[A-Za-z0-9_]{2,21}$/.test(r)))];
  // What the reader set for this list; a parameter not sent keeps the default.
  const feed = {
    ...(p.has("x") ? { x: handles } : {}),
    ...(p.has("q") ? { searches } : {}),
    ...(p.has("r") ? { subs } : {}),
  };
  try {
    if (kind === "grapevine") {
      // A request that names no X accounts gets the paper's own; an empty list the reader chose stays empty.
      const x = p.has("x") ? handles : DEFAULT_X_ACCOUNTS;
      return Response.json(await grapevineFeeds(x, searches, subs), { headers });
    }
    if (kind === "ipo") {
      const name = (p.get("name") ?? "").trim().slice(0, 80);
      if (!name) return Response.json({ error: "name" }, { status: 400, headers });
      return Response.json(await ipoChatter(name, feed), { headers });
    }
    if (kind === "val") {
      const teams = list(p.get("teams"), ",", 12).filter((t) => t.length <= 40);
      return Response.json(await valorantMoves(teams, feed), { headers });
    }
    if (kind === "f1") {
      const drivers = list(p.get("drivers"), ",", 4).filter((d) => /^[a-z]{3}$/i.test(d));
      const team = (p.get("team") ?? "").trim().slice(0, 40);
      return Response.json(await f1Chatter(drivers, team, feed), { headers });
    }
    if (kind === "trends") {
      // The same for every reader: the edge keeps it a couple of minutes (not while a list waits its turn, or on a refresh).
      const trends = await socialTrends();
      const share = !trends.waiting && p.get("fresh") !== "1";
      return Response.json(trends, { headers: share ? { "Cache-Control": "public, max-age=60, s-maxage=120, stale-while-revalidate=600" } : headers });
    }
    if (kind === "warm") return Response.json(await warmSocial(p.get("only") !== "rsshub"), { headers });
    return Response.json({ error: "kind" }, { status: 400, headers });
  } catch (err) {
    console.error("[social] failed:", err);
    return Response.json({ posts: [], status: "unavailable", note: null, at: new Date().toISOString() }, { headers });
  }
}
