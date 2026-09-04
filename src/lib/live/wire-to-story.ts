import type { SectionKey, Story, WireBrief } from "@/lib/types";
import { batchSummarize } from "./summarize";

const BASE_SIGNIFICANCE = 55;

function wireBriefToStory(
  brief: WireBrief,
  section: SectionKey,
  index: number,
  summary: string,
  personalLabel?: string | null,
): Story {
  return {
    id: `wire-${section}-${index}`,
    section,
    headline: brief.title,
    deck: "",
    dateline: brief.domain,
    readTimeMin: 1,
    lastUpdated: brief.postedAgo || "recently",
    body: [summary],
    significance: Math.max(1, BASE_SIGNIFICANCE - index * 5),
    personal: personalLabel ?? undefined,
    sourceUrl: brief.url,
    sourceName: brief.domain,
  };
}

// Builds sections synchronously using raw RSS snippets — no AI call.
// Used for the initial page render so content appears immediately.
// The client then fetches AI summaries in the background via /api/summarize.
export function buildSectionsSync(
  sections: Array<{
    briefs: WireBrief[];
    section: SectionKey;
    count: number;
    /** Returns the matched-interest label for a brief, if any — the story
     *  is then tagged `personal` for the "For you" kicker + hero boost. */
    personalize?: (brief: WireBrief) => string | null;
  }>,
): Array<{ stories: Story[]; rest: WireBrief[] }> {
  return sections.map(({ briefs, section, count, personalize }) => {
    const byRichness = [...briefs].sort(
      (a, b) => (b.summary?.length ?? 0) - (a.summary?.length ?? 0),
    );
    const promoted = byRichness.slice(0, count);
    const promotedIds = new Set(promoted.map((p) => p.id));
    const rest = briefs.filter((b) => !promotedIds.has(b.id));
    const stories = promoted.map((b, i) =>
      wireBriefToStory(
        b,
        section,
        i,
        b.summary ?? `Read the full story at ${b.domain}.`,
        personalize?.(b),
      ),
    );
    return { stories, rest };
  });
}

// Promotes all sections in a single function so every article that needs
// a summary is collected upfront and sent to Gemini in one batch call.
// This replaces multiple per-article calls with a single prompt → response.
export async function promoteAllSections(
  sections: Array<{
    briefs: WireBrief[];
    section: SectionKey;
    count: number;
  }>,
): Promise<Array<{ stories: Story[]; rest: WireBrief[] }>> {
  // Decide which briefs to promote for each section.
  const sectionWork = sections.map(({ briefs, count }) => {
    const byRichness = [...briefs].sort(
      (a, b) => (b.summary?.length ?? 0) - (a.summary?.length ?? 0),
    );
    const promoted = byRichness.slice(0, count);
    const promotedIds = new Set(promoted.map((p) => p.id));
    const rest = briefs.filter((b) => !promotedIds.has(b.id));
    return { promoted, rest };
  });

  // Collect every brief that needs a summary across all sections.
  const allPromoted = sectionWork.flatMap((s) => s.promoted);

  // One Gemini call for everything.
  const summaries = await batchSummarize(
    allPromoted.map((b) => ({
      id: b.id,
      url: b.url,
      snippet: b.summary ?? `Read the full story at ${b.domain}.`,
    })),
  );

  // Build stories for each section using the pre-fetched summaries.
  return sections.map(({ section }, si) => {
    const { promoted, rest } = sectionWork[si];
    const stories = promoted.map((b, i) =>
      wireBriefToStory(
        b,
        section,
        i,
        summaries.get(b.id) ?? b.summary ?? `Read the full story at ${b.domain}.`,
      ),
    );
    return { stories, rest };
  });
}
