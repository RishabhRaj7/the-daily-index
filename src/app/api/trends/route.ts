import { getWorldTrends, TREND_COUNTRIES } from "@/lib/live/trends";

// GET /api/trends?geo=IN,US,GB — what each country is searching for right
// now (Google Trends), with the news behind each search. The same for
// every reader, so the edge keeps it ten minutes.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const asked = (new URL(req.url).searchParams.get("geo") ?? "")
    .toUpperCase()
    .split(",")
    .filter((g) => TREND_COUNTRIES.some(([c]) => c === g));
  const countries = await getWorldTrends(asked.length ? asked : TREND_COUNTRIES.map(([g]) => g));
  return Response.json(
    { countries, at: new Date().toISOString() },
    { headers: { "Cache-Control": countries.length ? "public, max-age=300, s-maxage=600, stale-while-revalidate=1800" : "no-store" } },
  );
}
