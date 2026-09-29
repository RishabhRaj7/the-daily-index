import { CHART_RANGES, getChart, type ChartKind, type ChartRange } from "@/lib/live/charts";

// GET /api/chart?kind=index|commodity|crypto&id=nifty50&range=1D
// Price history for the market detail charts. Each range is cached for
// about as long as its bars last (a minute for 1D, hours for 5Y).
export const dynamic = "force-dynamic";

const KINDS: ChartKind[] = ["index", "commodity", "crypto"];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") as ChartKind;
  const id = url.searchParams.get("id") ?? "";
  const range = (url.searchParams.get("range") ?? "1D") as ChartRange;
  if (!KINDS.includes(kind) || !CHART_RANGES.includes(range) || !/^[a-z0-9]{2,20}$/.test(id)) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  const data = await getChart(kind, id, range).catch(() => null);
  if (!data || data.bars.length === 0) return Response.json({ error: "no data" }, { status: 404 });
  const maxAge = range === "1D" ? 60 : range === "5D" ? 300 : 900;
  return Response.json(data, { headers: { "Cache-Control": `public, max-age=${Math.min(maxAge, 60)}, s-maxage=${maxAge}` } });
}
