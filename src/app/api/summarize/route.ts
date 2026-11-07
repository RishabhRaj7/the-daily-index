import { writeEditorsNote, writePickBlurbs, type PickInput } from "@/lib/live/editorial-ai";
import type { ReaderProfile } from "@/lib/types";

export const dynamic = "force-dynamic";

interface SummarizeRequest {
  picks?: PickInput[];
  reader?: {
    profile: ReaderProfile;
    weekday: string;
    dateLabel: string;
    heroHeadline?: string;
    recentHeadlines: string[];
  };
}

export async function POST(req: Request) {
  const empty = { pickBlurbs: {}, editorsNote: null };
  try {
    const body = (await req.json()) as SummarizeRequest;
    const picks = Array.isArray(body.picks) ? body.picks.slice(0, 8) : [];

    const [pickBlurbs, editorsNote] = await Promise.all([
      writePickBlurbs(picks),
      body.reader
        ? writeEditorsNote(body.reader.profile, {
            weekday: body.reader.weekday,
            dateLabel: body.reader.dateLabel,
            heroHeadline: body.reader.heroHeadline,
            recentHeadlines: body.reader.recentHeadlines ?? [],
          })
        : Promise.resolve(null),
    ]);

    return Response.json(
      {
        pickBlurbs,
        editorsNote,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[summarize] request failed:", err);
    // Non-2xx so the client shows "tap to retry" instead of caching an empty
    // result as if the edition had been summarised.
    return Response.json(empty, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
