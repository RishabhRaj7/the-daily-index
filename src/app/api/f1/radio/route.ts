import { cachedTranscripts, radioPaused, transcribe } from "@/lib/live/f1-radio";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/f1/radio?u=<clip>&w=<code>&f=<first name>&u=…   team radio transcripts.
// Answers every kept transcript at once and writes up to three new ones per
// call (newest first), so a page catching up never waits on a whole race's
// worth; the client asks again for the rest. { paused: true } when every
// radio model has spent its day's allowance — the page stops asking.

const CLIP = /^https:\/\/livetiming\.formula1\.com\/static\/[\w/.-]+\/TeamRadio\/[\w.-]+\.mp3$/;

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const w = params.getAll("w");
  const f = params.getAll("f");
  // Each clip with its driver (code, first name), paired before any is dropped.
  const clips = params
    .getAll("u")
    .map((u, i) => ({ u, w: w[i] || "", f: f[i] || null }))
    .filter((x) => CLIP.test(x.u))
    .slice(0, 40);
  const urls = clips.map((x) => x.u);
  const known = await cachedTranscripts(urls);
  const missing = clips.filter((x) => !known[x.u]);
  const paused = missing.length > 0 && (await radioPaused());
  const written = paused ? [] : await Promise.all(missing.slice(0, 3).map(async (x) => [x.u, await transcribe(x.u, x.w || "the driver", x.f)] as const));
  for (const [u, t] of written) if (t) known[u] = t;
  return Response.json(
    { transcripts: known, pending: Math.max(0, missing.length - written.filter(([, t]) => t).length), paused },
    { headers: { "Cache-Control": "no-store" } },
  );
}
