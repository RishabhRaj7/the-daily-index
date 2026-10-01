// GET /api/odds/sparks?m=pm:slug~token|ks:EVENT~TICKER~SERIES|…
// A week of each market's favourite, about thirty points apiece, for the
// small lines on Straw Poll's cards. One request for every card on the page;
// each upstream read sits in the data cache for half an hour.
export const dynamic = "force-dynamic";

const POINTS = 30;

async function json<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 1800 }, signal: AbortSignal.timeout(7000) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Every nth point, keeping the last (today's) one. */
function thin(points: number[]): number[] {
  if (points.length <= POINTS) return points;
  const step = points.length / POINTS;
  const out = Array.from({ length: POINTS - 1 }, (_, i) => points[Math.floor(i * step)]);
  return [...out, points[points.length - 1]];
}

async function spark(id: string, ref: string, series?: string): Promise<number[]> {
  if (id.startsWith("pm:") && /^\d{10,90}$/.test(ref)) {
    const body = await json<{ history?: Array<{ p: number }> }>(`https://clob.polymarket.com/prices-history?market=${ref}&interval=1w&fidelity=180`);
    return thin((body?.history ?? []).map((h) => Math.round(h.p * 1000) / 10));
  }
  if (id.startsWith("ks:") && series && /^[\w.-]{3,80}$/.test(ref)) {
    const end = Math.floor(Date.now() / 1000);
    const body = await json<{ candlesticks?: Array<{ price?: { close_dollars?: string; previous_dollars?: string } }> }>(
      `https://api.elections.kalshi.com/trade-api/v2/series/${encodeURIComponent(series)}/markets/${encodeURIComponent(ref)}/candlesticks?start_ts=${end - 7 * 86_400}&end_ts=${end}&period_interval=60`,
    );
    let last: number | null = null;
    const out: number[] = [];
    for (const c of body?.candlesticks ?? []) {
      const p = Number(c.price?.close_dollars ?? c.price?.previous_dollars);
      if (Number.isFinite(p) && p > 0) last = Math.round(p * 1000) / 10;
      if (last != null) out.push(last);
    }
    return thin(out);
  }
  return [];
}

export async function GET(req: Request) {
  const wanted = (new URL(req.url).searchParams.get("m") ?? "")
    .split("|")
    .map((s) => s.split("~"))
    .filter((p) => p.length >= 2 && /^(pm|ks):[\w.-]+$/i.test(p[0]))
    .slice(0, 40);
  const lines = await Promise.all(wanted.map(async ([id, ref, series]) => [id, await spark(id, ref, series)] as const));
  return Response.json(Object.fromEntries(lines.filter(([, p]) => p.length > 2)), {
    headers: { "Cache-Control": "public, max-age=600, s-maxage=1800" },
  });
}
