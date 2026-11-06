import { catchUp, type CatchUpAsk } from "@/lib/live/catch-up";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/catch-up  { since, stories: [{ section, headline }], moves: [string] }
// What changed since the reader last looked, in a headline and two sentences, with the
// F1 session finished since (lib/live/catch-up.ts). Sizes are capped here: anyone can ask.

const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export async function POST(req: Request) {
  const empty = { headline: null, story: null, session: null };
  try {
    const body = (await req.json()) as Partial<CatchUpAsk>;
    const since = Number(body.since);
    if (!Number.isFinite(since) || since <= 0) return Response.json(empty, { status: 400 });
    const ask: CatchUpAsk = {
      since,
      stories: (Array.isArray(body.stories) ? body.stories : []).slice(0, 12).map((s) => ({ section: text(s?.section, 40), headline: text(s?.headline, 180) })).filter((s) => s.headline),
      moves: (Array.isArray(body.moves) ? body.moves : []).slice(0, 6).map((m) => text(m, 100)).filter(Boolean),
    };
    return Response.json(await catchUp(ask), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(empty, { status: 400 });
  }
}
