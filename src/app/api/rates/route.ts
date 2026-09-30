import { getRates } from "@/lib/live/rates";

// GET /api/rates — Market Pulse's rates row: RBI repo, Fed funds, US 10-year
// and FII/DII flows (lib/live/rates.ts). They change a few times a day at
// most, so the edge keeps the answer half an hour.
export const dynamic = "force-dynamic";

export async function GET() {
  const rates = await getRates();
  return Response.json(rates, { headers: { "Cache-Control": "public, max-age=900, s-maxage=1800, stale-while-revalidate=3600" } });
}
