import { getStore } from "@/lib/server/store";
import { HOUR_KEY } from "@/lib/live/odds";

// GET /api/odds/history?id=pm:…&token=… — a week of the favourite's price
// for the Straw Poll detail sheet, as [time ms, chance %] points.
//   Polymarket  its CLOB's own hourly history, by the favourite's token
//   Kalshi      the paper's hourly snapshots (lib/live/odds.ts)
export const dynamic = "force-dynamic";

const WEEK_HOURS = 7 * 24;

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const id = params.get("id") ?? "";
  const token = params.get("token") ?? "";
  let points: Array<[number, number]> = [];

  if (id.startsWith("pm:") && /^\d{10,90}$/.test(token)) {
    try {
      const res = await fetch(`https://clob.polymarket.com/prices-history?market=${token}&interval=1w&fidelity=60`, {
        next: { revalidate: 900 },
        signal: AbortSignal.timeout(8000),
      });
      const body = res.ok ? ((await res.json()) as { history?: Array<{ t: number; p: number }> }) : null;
      points = (body?.history ?? []).map((h) => [h.t * 1000, Math.round(h.p * 1000) / 10]);
    } catch {
      points = [];
    }
  } else if (id.startsWith("ks:")) {
    const now = Date.now();
    const hours = Array.from({ length: WEEK_HOURS }, (_, i) => new Date(now - (WEEK_HOURS - 1 - i) * 3_600_000).toISOString().slice(0, 13));
    const snaps = await getStore()
      .getMany<Record<string, number>>(hours.map(HOUR_KEY))
      .catch(() => new Map<string, Record<string, number>>());
    points = hours.flatMap((h) => {
      const p = snaps.get(HOUR_KEY(h))?.[id];
      return typeof p === "number" ? [[Date.parse(`${h}:00:00Z`), p] as [number, number]] : [];
    });
  }
  return Response.json({ points }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=900" } });
}
