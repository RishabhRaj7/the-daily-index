import { isDatabaseConfigured, pingDatabase } from "@/db";

export const dynamic = "force-dynamic";

// GET /api/health — the app itself is healthy as long as it can serve this
// response. Postgres is optional (it only backs the connected-Reddit feature),
// so a missing or unreachable database is reported but does not fail the check.
export async function GET() {
  const database = await pingDatabase();
  return Response.json({
    ok: true,
    database,
    databaseConfigured: isDatabaseConfigured(),
    features: {
      redditLogin: database === "ok",
    },
    timestamp: new Date().toISOString(),
  });
}
