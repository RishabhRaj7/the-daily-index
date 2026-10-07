import type { ValMatchStats } from "@/lib/types";
import { getMatchStats } from "@/lib/live/vlr";
import { riot } from "@/lib/live/valorant";
import { getStore } from "@/lib/server/store";

// GET /api/valorant/stats?id=<Riot match id>&a=Paper Rex&b=G2 Esports&t=<start ISO>&live=1
// A match's numbers map by map (VLR.gg, lib/live/vlr.ts) with Riot's VODs.
// A finished match is kept for good; a live one is read at most once a
// minute and the page asks again every minute while it's on.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface Details {
  event?: { match?: { games?: Array<{ number: number; state?: string; vods?: Array<{ parameter: string; locale: string; provider: string }> }> } };
}

async function vods(id: string, live: boolean): Promise<ValMatchStats["vods"]> {
  const d = await riot<Details>(`getEventDetails?id=${encodeURIComponent(id)}`, live ? 120 : 86_400);
  return (d?.event?.match?.games ?? []).flatMap((g) => {
    const v = g.vods?.find((x) => x.provider === "youtube" && x.locale === "en-US") ?? g.vods?.find((x) => x.provider === "youtube");
    return v ? [{ map: g.number, url: `https://www.youtube.com/watch?v=${encodeURIComponent(v.parameter)}` }] : [];
  });
}

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const id = p.get("id") ?? "";
  const a = (p.get("a") ?? "").slice(0, 60);
  const b = (p.get("b") ?? "").slice(0, 60);
  const start = p.get("t") ?? "";
  const live = p.get("live") === "1";
  if (!/^[\w-]{3,40}$/.test(id) || !a || !b || Number.isNaN(Date.parse(start))) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }

  const store = getStore();
  // v2: v1 kept matches read while VLR's round markup went unrecognised
  // (no rounds); those are read again.
  const key = `vlr:stats:v2:${id}`;
  if (!live) {
    const kept = await store.get<ValMatchStats>(key).catch(() => null);
    if (kept) return Response.json(kept, { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } });
  }

  const [stats, v] = await Promise.all([getMatchStats(a, b, start, live).catch(() => null), vods(id, live).catch(() => [])]);
  if (!stats || stats.maps.every((m) => m.teams[0].length === 0)) {
    return Response.json({ error: "no stats yet", url: stats?.url ?? null }, { status: 404, headers: { "Cache-Control": "public, max-age=60, s-maxage=120" } });
  }
  const out: ValMatchStats = { ...stats, vods: v, fetchedAt: new Date().toISOString() };
  // Finished on both sides: keep it for good, but only a complete read (every
  // map with its rounds), so a VLR layout change can't be frozen in.
  const complete = stats.maps.filter((m) => m.id !== "all").every((m) => m.rounds.length > 0);
  if (!live && !stats.live && complete) await store.set(key, out, { ttlSeconds: 365 * 86_400 }).catch(() => {});
  return Response.json(out, {
    headers: { "Cache-Control": live || stats.live ? "public, max-age=30, s-maxage=45" : "public, max-age=3600, s-maxage=86400" },
  });
}
