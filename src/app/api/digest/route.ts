import { generateDigest } from "@/lib/live/digest";
import { normalizePreferences } from "@/lib/preferences/storage";
import type { DigestPreferences } from "@/lib/preferences/types";

export const dynamic = "force-dynamic";

// POST /api/digest — the preference-driven digest pipeline.
//
// The client posts its preferences (localStorage copy or the shipped
// defaults). The server keeps the existing multi-API fetch untouched,
// collates every article it got, and asks the AI to filter / prioritise /
// summarise them per section in ONE call. Reply shape:
//
//   { sections: { [sectionId]: [{ title, summary, source, url, publishedAt,
//                                 group?, priority, matchedEntity? }] },
//     generatedAt, engine, corpusSize }
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as {
      preferences?: unknown;
    } | null;

    // Whatever arrives is coerced into a valid shape — bad fields fall back
    // to defaults instead of failing the whole request.
    const prefs: DigestPreferences = normalizePreferences(body?.preferences);

    const digest = await generateDigest(prefs);
    return Response.json(digest, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[digest] request failed:", err);
    return Response.json(
      { error: "digest failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
