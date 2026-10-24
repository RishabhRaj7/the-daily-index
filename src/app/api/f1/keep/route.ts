import { keepFinished } from "@/lib/live/f1-live";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET /api/f1/keep   keeps the session F1 last ran, once it is over, and reads
// it once more when it has settled (lib/live/f1-live.ts, keepFinished). Called
// every 15 minutes by .github/workflows/f1-keep.yml. It does no more than an
// open live centre does between sessions, so it needs no secret: a session
// already kept is only looked at, and one read at a time is allowed.
//
// { done: "nothing" | "running" | "kept" | "saved" | "settled" | "pending", session }

export async function GET() {
  try {
    const result = await keepFinished();
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[f1/keep] failed:", err);
    return Response.json({ done: "pending", error: "failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
