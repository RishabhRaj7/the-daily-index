import { isDatabaseConfigured, pingDatabase } from "@/db";
import { editionDiagnostics } from "@/lib/server/editions";

export const dynamic = "force-dynamic";

// GET /api/health — the app itself is healthy as long as it can serve this
// response. Postgres is optional (it only backs the connected-Reddit feature),
// so a missing or unreachable database is reported but does not fail the check.
export async function GET() {
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
