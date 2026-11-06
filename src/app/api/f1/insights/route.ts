import { insightsFor, latestRaceRecap } from "@/lib/live/f1-insights";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/f1/insights?session=<archive path>  a finished session's recap and radio moments
// GET /api/f1/insights                         the same for the latest session
// GET /api/f1/insights?latest=race             the latest race's recap, for the main page
// Written once on radio's own key, then kept (lib/live/f1-insights.ts). Anything
// that couldn't be written is simply absent, and the page shows nothing for it.

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  try {
    if (params.get("latest") === "race") {
      const recap = await latestRaceRecap();
      return Response.json({ recap, moments: [] }, { headers: { "Cache-Control": recap ? "public, max-age=300, s-maxage=900" : "no-store" } });
    }
    const session = params.get("session");
    if (session && !/^\d{4}\/[\w-]+\/[\w-]+\/$/.test(session)) return Response.json({ recap: null, moments: [] }, { status: 400 });
    const out = await insightsFor(session);
    return Response.json(out, { headers: { "Cache-Control": out.recap ? "public, max-age=300, s-maxage=600" : "no-store" } });
  } catch (err) {
    console.error("[f1/insights] failed:", err);
    return Response.json({ recap: null, moments: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}
