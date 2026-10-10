import { compact, getLive, pastSession, replay } from "@/lib/live/f1-live";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

// GET /api/f1/live           the Pit wall's live table (compact)
// GET /api/f1/live?full=1    everything, for /f1/live; between sessions it
//                            carries the last session in full ({ last })
// GET /api/f1/live?session=<archive path>            a past session, final
// GET /api/f1/live?session=<path>&t=<s>[&timeline=1] that session as it stood
//                            t seconds into its feed (the replay bar), with
//                            its flags, laps and parts on the first ask
//
// { live: false, next } when no session is near (no connection is made);
// { live: true, snapshot } from a few seconds before the start until half an
// hour after the flag. One read of F1's live timing is shared by every reader
// (lib/live/f1-live.ts), so polling every few seconds costs F1 almost nothing.

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  try {
    // ?replay=<archive path> plays a finished session, in development only.
    const path = process.env.NODE_ENV !== "production" ? params.get("replay") : null;
    const t = params.get("t");
    const full = params.get("full") === "1";
    // ?session=<archive path>: one past session in full.
    const past = params.get("session");
    if (past && /^\d{4}\/[\w-]+\/[\w-]+\/$/.test(past)) {
      const at = t === null ? NaN : Number(t);
      if (Number.isFinite(at) && at >= 0 && at < 6 * 3600) {
        const [answer, line] = await Promise.all([replay(past, at), params.get("timeline") === "1" ? import("@/lib/live/f1-replay").then((m) => m.timeline(past)) : null]);
        const servedAt = new Date().toISOString();
        return Response.json(
          answer.live ? { live: true, snapshot: { ...answer.snapshot, servedAt }, timeline: line } : { live: false, next: null, timeline: line },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      const last = await pastSession(past);
      return Response.json({ live: false, next: null, last }, { headers: { "Cache-Control": "public, max-age=300" } });
    }
    const answer = path
      ? await replay(path, t ? Number(t) : undefined)
      : await getLive({ fresh: params.get("fresh") === "1", withLast: full });
    const servedAt = new Date().toISOString();
    const body = answer.live ? { live: true, snapshot: { ...(full ? answer.snapshot : compact(answer.snapshot)), servedAt } } : answer;
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[f1/live] failed:", err);
    return Response.json({ live: false, next: null }, { headers: { "Cache-Control": "no-store" } });
  }
}
