import { after } from "next/server";
import { buildIfIdle, readStoredPrefs } from "@/lib/server/editions";
import { isCronAuthorized } from "@/lib/server/cron-auth";
import { editionDate } from "@/lib/edition-date";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/cron/build { hash } — internal: rebuilds one reader's edition for
// today from their stored preferences. Called only by /api/cron/daily.
// Acknowledges at once and builds in after(), so the daily cron never waits
// on (or times out behind) a reader's build.
export async function POST(req: Request) {
  if (!isCronAuthorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { hash?: unknown } | null;
  const hash = typeof body?.hash === "string" ? body.hash : "";
  const prefs = /^[0-9a-f]{16}$/.test(hash) ? await readStoredPrefs(hash) : null;
  if (!prefs) return Response.json({ error: "unknown edition" }, { status: 404 });

  const date = editionDate();
  after(() => buildIfIdle(date, hash, prefs));
  return Response.json({ accepted: true }, { status: 202 });
}
