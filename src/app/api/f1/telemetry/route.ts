import { lapTrace } from "@/lib/live/f1-telemetry";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET /api/f1/telemetry?session=<archive path>&code=VER[&t=<s>]
// One driver's lap of telemetry from a finished session (lib/live/f1-telemetry.ts):
// the lap in progress t seconds into the feed (the replay), or their fastest.

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const session = p.get("session") ?? "";
  const code = (p.get("code") ?? "").toUpperCase();
  const t = p.get("t");
  if (!/^\d{4}\/[\w-]+\/[\w-]+\/$/.test(session) || !/^[A-Z]{3}$/.test(code)) return Response.json({ error: "session, code" }, { status: 400 });
  const at = t === null ? undefined : Number(t);
  if (at !== undefined && !(Number.isFinite(at) && at >= 0 && at < 6 * 3600)) return Response.json({ error: "t" }, { status: 400 });
  const trace = await lapTrace(session, code, at).catch(() => null);
  return Response.json(
    { trace },
    { headers: { "Cache-Control": at === undefined && trace ? "public, max-age=86400, s-maxage=86400" : "no-store" } },
  );
}
