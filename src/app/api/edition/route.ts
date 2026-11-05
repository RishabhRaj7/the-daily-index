import { editionState, requestEdition, type EditionState } from "@/lib/server/editions";
import { isEditionDate } from "@/lib/edition-date";
import { digestRevision } from "@/lib/preferences/stories";

export const dynamic = "force-dynamic";
// Without Redis the build runs inline; with Redis it runs in after(), which
// shares this limit. Retries while Gemini is busy can take minutes.
export const maxDuration = 300;

// POST /api/edition { preferences, force?, retry? }
//   Returns today's edition for these preferences, starting a build when
//   there is none, or a repair when stories are still waiting for Gemini.
//   `retry` is the page's "Try now". States: ready (with digest) | building |
//   failed. `revision` changes whenever the stored edition does.
// GET /api/edition?hash=…&date=…
//   Poll an edition started by POST. Never starts a build.
//
// Both answer the same flat shape so the client has one parser.

const NO_STORE = { "Cache-Control": "no-store" } as const;

function toJson(s: EditionState) {
  switch (s.state) {
    case "ready":
      return {
        state: s.state,
        date: s.date,
        hash: s.hash,
        builtAt: s.edition.builtAt,
        revision: digestRevision(s.edition.digest),
        digest: s.edition.digest,
        refreshing: s.refreshing,
        ...(s.note ? { note: s.note } : {}),
      };
    case "building":
      return { state: s.state, date: s.date, hash: s.hash, startedAt: s.startedAt };
    case "failed":
      return { state: s.state, date: s.date, hash: s.hash, error: s.error };
    case "missing":
      return { state: s.state, date: s.date, hash: s.hash };
  }
}

function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || null;
  return req.headers.get("x-real-ip");
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { preferences?: unknown; force?: unknown; retry?: unknown } | null;
    const state = await requestEdition(body?.preferences, {
      force: body?.force === true,
      retry: body?.retry === true,
      ip: clientIp(req),
    });
    return Response.json(toJson(state), { headers: NO_STORE });
  } catch (err) {
    console.error("[edition] request failed:", err);
    return Response.json({ state: "failed", error: "The edition service is unavailable." }, { status: 500, headers: NO_STORE });
  }
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const hash = params.get("hash") ?? "";
  const date = params.get("date") ?? "";
  if (!/^[0-9a-f]{16}$/.test(hash) || !isEditionDate(date)) {
    return Response.json({ state: "failed", error: "bad hash or date" }, { status: 400, headers: NO_STORE });
  }
  try {
    return Response.json(toJson(await editionState(date, hash)), { headers: NO_STORE });
  } catch (err) {
    console.error("[edition] poll failed:", err);
    return Response.json({ state: "failed", error: "The edition service is unavailable." }, { status: 500, headers: NO_STORE });
  }
}
