import { compact, getLive, replay } from "@/lib/live/f1-live";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

// GET /api/f1/live           the Pit wall's live table (compact)
// GET /api/f1/live?full=1    everything, for /f1/live
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
    const answer = path ? await replay(path) : await getLive({ fresh: params.get("fresh") === "1" });
    const body = answer.live && params.get("full") !== "1" ? { live: true, snapshot: compact(answer.snapshot) } : answer;
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[f1/live] failed:", err);
    return Response.json({ live: false, next: null }, { headers: { "Cache-Control": "no-store" } });
  }
}
