import { DEFAULT_DIGEST_PREFERENCES } from "@/lib/preferences/storage";
import { DEFAULT_HASH, buildIfIdle, recentlyActive } from "@/lib/server/editions";
import { isCronAuthorized } from "@/lib/server/cron-auth";
import { editionDate } from "@/lib/edition-date";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/cron/daily — scheduled in vercel.json (00:00 UTC = 05:30 IST).
//
// 1. Builds today's default edition inline. That edition is the permanent
//    archive entry for the day.
// 2. Fans out one /api/cron/build request per edition read in the last three
//    days, so regular readers with their own preferences also wake up to a
//    finished paper. Each is acknowledged at once and built in its own
//    invocation, so this function only waits for the default build.
const ACTIVE_DAYS = 3;
const MAX_FANOUT = 10;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const date = editionDate();
  const origin = new URL(req.url).origin;

  const others = (await recentlyActive(ACTIVE_DAYS, MAX_FANOUT + 1))
    .filter((e) => e.hash !== DEFAULT_HASH)
    .slice(0, MAX_FANOUT);

  // Start the fan-out first so it overlaps the inline default build.
  const fanout = Promise.allSettled(
    others.map((e) =>
      fetch(`${origin}/api/cron/build`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.CRON_SECRET}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ hash: e.hash }),
      }).then((r) => r.status),
    ),
  );

  const built = await buildIfIdle(date, DEFAULT_HASH, DEFAULT_DIGEST_PREFERENCES);
  const results = await fanout;

  // A failed default build must not look like success in the cron log.
  const ok = built !== null;
  return Response.json({
    ok,
    date,
    default:
      built === "busy"
        ? "already building"
        : built
          ? { engine: built.digest.engine, corpusSize: built.digest.corpusSize }
          : "failed",
    fanout: results.map((r, i) => ({
      hash: others[i].hash,
      status: r.status === "fulfilled" ? r.value : "error",
    })),
  }, { status: ok ? 200 : 500 });
}
