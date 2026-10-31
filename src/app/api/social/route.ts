import { cleanHandle, grapevineFeeds, ipoChatter, validHandle, valorantMoves, warmSocial } from "@/lib/live/social";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET /api/social?kind=grapevine&x=handle,…&q=search|…&r=sub,…   the reader's X and Reddit
// GET /api/social?kind=ipo&name=<company>                          IPO chatter (Reddit + X)
// GET /api/social?kind=val&teams=Paper Rex,…&x=handle,…            Valorant transfer window
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
  const kind = p.get("kind");
  const headers = { "Cache-Control": "no-store" };
  const handles = [...new Set(list(p.get("x"), ",", 12).map(cleanHandle).filter(validHandle))];
  try {
    if (kind === "grapevine") {
      const searches = list(p.get("q"), "|", 4).filter((q) => q.length <= 60);
      const subs = list(p.get("r"), ",", 12).map((r) => r.replace(/^r\//i, "")).filter((r) => /^[A-Za-z0-9_]{2,21}$/.test(r));
      return Response.json(await grapevineFeeds(handles, searches, subs), { headers });
    }
    if (kind === "ipo") {
      const name = (p.get("name") ?? "").trim().slice(0, 80);
      if (!name) return Response.json({ error: "name" }, { status: 400, headers });
      return Response.json(await ipoChatter(name), { headers });
    }
    if (kind === "val") {
      const teams = list(p.get("teams"), ",", 12).filter((t) => t.length <= 40);
      return Response.json(await valorantMoves(teams, handles), { headers });
    }
    if (kind === "warm") return Response.json(await warmSocial(p.get("only") !== "rsshub"), { headers });
    return Response.json({ error: "kind" }, { status: 400, headers });
  } catch (err) {
    console.error("[social] failed:", err);
    return Response.json({ posts: [], status: "unavailable", note: null, at: new Date().toISOString() }, { headers });
  }
}
