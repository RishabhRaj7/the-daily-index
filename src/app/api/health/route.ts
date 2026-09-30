import { isDatabaseConfigured, pingDatabase } from "@/db";
import { editionDiagnostics, readBuildReport } from "@/lib/server/editions";
import { editionDate } from "@/lib/edition-date";

export const dynamic = "force-dynamic";

// GET /api/health — the app itself is healthy as long as it can serve this
// response. Postgres is optional (it only backs the connected-Reddit feature),
// so a missing or unreachable database is reported but does not fail the check.
export async function GET(req: Request) {
  // ?report=1 → the default edition's full build report, every feed listed.
  const params = new URL(req.url).searchParams;
  if (params.get("report")) {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") ?? "") ? params.get("date")! : editionDate();
    const report = await readBuildReport(date);
    return Response.json(report ?? { error: `no build report for ${date}` }, {
      status: report ? 200 : 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const [database, editions] = await Promise.all([pingDatabase(), editionDiagnostics()]);
  return Response.json({
    ok: true,
    deployment: {
      env: process.env.VERCEL_ENV ?? "local",
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    },
    editions,
    database,
    databaseConfigured: isDatabaseConfigured(),
    features: {
      redditLogin: database === "ok",
    },
    timestamp: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
}
