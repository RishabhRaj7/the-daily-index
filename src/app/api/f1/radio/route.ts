import { cachedTranscripts, transcribe } from "@/lib/live/f1-radio";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/f1/radio?u=<clip>&w=<code>&u=…   team radio transcripts.
// Answers every kept transcript at once and writes up to three new ones per
// call (newest first), so a page catching up never waits on a whole race's
// worth; the client asks again for the rest.

const CLIP = /^https:\/\/livetiming\.formula1\.com\/static\/[\w/.-]+\/TeamRadio\/[\w.-]+\.mp3$/;

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const urls = params.getAll("u").filter((u) => CLIP.test(u)).slice(0, 40);
  const who = params.getAll("w");
  const known = await cachedTranscripts(urls);
  const missing = urls.map((u, i) => ({ u, w: who[i] || "the driver" })).filter((x) => !known[x.u]);
  const written = await Promise.all(missing.slice(0, 3).map(async (x) => [x.u, await transcribe(x.u, x.w)] as const));
  for (const [u, t] of written) if (t) known[u] = t;
  return Response.json(
    { transcripts: known, pending: Math.max(0, missing.length - written.filter(([, t]) => t).length) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
