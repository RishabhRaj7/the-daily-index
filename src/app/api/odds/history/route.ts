// GET /api/odds/history?id=pm:…&range=1w&o=Name~token|Name~token
//     /api/odds/history?id=ks:…&range=1w&series=KXFED&o=Name~TICKER|…
// The chance of up to four outcomes over a day, a week, a month or all
// time, for Straw Poll's charts, as { series: [{ name, points: [ms, %][] }] }.
//   Polymarket  its CLOB's own price history, by each outcome's token
//   Kalshi      its public candlesticks, by each outcome's market ticker
// Prices from the past don't change, so the edge keeps each answer a while.
export const dynamic = "force-dynamic";

type Range = "1d" | "1w" | "1m" | "all";
const RANGES: Record<Range, { pm: string; fidelity: number; seconds: number; ks: number }> = {
  // fidelity in minutes; Kalshi's period_interval in minutes (1, 60 or 1440).
  "1d": { pm: "1d", fidelity: 10, seconds: 86_400, ks: 60 },
  "1w": { pm: "1w", fidelity: 60, seconds: 7 * 86_400, ks: 60 },
  "1m": { pm: "1m", fidelity: 240, seconds: 30 * 86_400, ks: 1440 },
  all: { pm: "max", fidelity: 1440, seconds: 365 * 86_400, ks: 1440 },
};

async function json<T>(url: string, revalidate: number): Promise<T | null> {
  try {
    const res = await fetch(url, { next: { revalidate }, signal: AbortSignal.timeout(8000) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

const r1 = (p: number) => Math.round(p * 1000) / 10;

async function polymarket(token: string, range: Range): Promise<Array<[number, number]>> {
  const r = RANGES[range];
  const body = await json<{ history?: Array<{ t: number; p: number }> }>(
    `https://clob.polymarket.com/prices-history?market=${token}&interval=${r.pm}&fidelity=${r.fidelity}`,
    range === "1d" ? 300 : 900,
  );
  return (body?.history ?? []).map((h) => [h.t * 1000, r1(h.p)]);
}

async function kalshi(series: string, ticker: string, range: Range): Promise<Array<[number, number]>> {
  const r = RANGES[range];
  const end = Math.floor(Date.now() / 1000);
  const body = await json<{ candlesticks?: Array<{ end_period_ts: number; price?: { close_dollars?: string; previous_dollars?: string } }> }>(
    `https://api.elections.kalshi.com/trade-api/v2/series/${encodeURIComponent(series)}/markets/${encodeURIComponent(ticker)}/candlesticks?start_ts=${end - r.seconds}&end_ts=${end}&period_interval=${r.ks}`,
    range === "1d" ? 300 : 900,
  );
  // A quiet hour has no trades: carry the last price forward.
  let last: number | null = null;
  const out: Array<[number, number]> = [];
  for (const c of body?.candlesticks ?? []) {
    const p = Number(c.price?.close_dollars ?? c.price?.previous_dollars);
    if (Number.isFinite(p) && p > 0) last = p;
    if (last != null) out.push([c.end_period_ts * 1000, r1(last)]);
  }
  return out;
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const id = params.get("id") ?? "";
  const range = (["1d", "1w", "1m", "all"].includes(params.get("range") ?? "") ? params.get("range") : "1w") as Range;
  const outcomes = (params.get("o") ?? "")
    .split("|")
    .map((s) => s.split("~"))
    .filter((p) => p.length === 2 && p[0].length > 0 && p[0].length <= 80)
    .slice(0, 4);
  const series = params.get("series") ?? "";

  const lines = await Promise.all(
    outcomes.map(async ([name, ref]) => {
      if (id.startsWith("pm:") && /^\d{10,90}$/.test(ref)) return { name, points: await polymarket(ref, range) };
      if (id.startsWith("ks:") && /^[\w.-]{3,80}$/.test(ref) && /^[\w.-]{2,40}$/.test(series)) return { name, points: await kalshi(series, ref, range) };
      return { name, points: [] as Array<[number, number]> };
    }),
  );
  return Response.json(
    { series: lines.filter((l) => l.points.length > 1) },
    { headers: { "Cache-Control": `public, max-age=300, s-maxage=${range === "1d" ? 300 : 900}` } },
  );
}
