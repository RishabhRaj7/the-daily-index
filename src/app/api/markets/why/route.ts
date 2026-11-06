import { marketWhy, WHY_MIN_MOVE } from "@/lib/live/market-why";
import type { MarketRegion } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET /api/markets/why?region=India&pct=1.72  one sentence on a region's big day,
// with its source, or null (lib/live/market-why.ts).

const REGIONS: MarketRegion[] = ["India", "US", "Europe", "Asia"];

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const region = params.get("region") as MarketRegion;
  const pct = Number(params.get("pct"));
  if (!REGIONS.includes(region) || !Number.isFinite(pct) || Math.abs(pct) < WHY_MIN_MOVE) return Response.json({ why: null });
  const why = await marketWhy(region, pct).catch(() => null);
  return Response.json({ why }, { headers: { "Cache-Control": why ? "public, max-age=900, s-maxage=1800" : "no-store" } });
}
