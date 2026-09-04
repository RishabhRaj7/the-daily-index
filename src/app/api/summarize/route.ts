import { batchSummarize, generateEditionBrief, type SummarizeInput } from "@/lib/live/summarize";
import { writeEditorsNote, writePickBlurbs, type PickInput } from "@/lib/live/editorial-ai";
import type { ReaderProfile } from "@/lib/types";

export const dynamic = "force-dynamic";

interface SummarizeRequest {
  articles?: SummarizeInput[];
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
  const empty = { summaries: {}, brief: null, pickBlurbs: {}, editorsNote: null };
  try {
    const body = (await req.json()) as SummarizeRequest;
    const articles = (Array.isArray(body.articles) ? body.articles : [])
      .filter((a) => a && typeof a.id === "string" && typeof a.url === "string")
      .slice(0, 40)
      .map((a) => ({
        id: a.id,
        url: a.url,
        snippet: typeof a.snippet === "string" ? a.snippet : "",
        title: typeof a.title === "string" ? a.title : undefined,
      }));
    const picks = Array.isArray(body.picks) ? body.picks.slice(0, 8) : [];

    const [map, pickBlurbs, editorsNote] = await Promise.all([
      articles.length > 0 ? batchSummarize(articles) : Promise.resolve(new Map<string, string>()),
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

    const brief = articles.length > 0 ? await generateEditionBrief(articles, map) : null;

    return Response.json(
      {
        summaries: Object.fromEntries(map),
        brief,
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
