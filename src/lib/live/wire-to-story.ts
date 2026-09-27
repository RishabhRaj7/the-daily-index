import type { SectionKey, Story, WireBrief } from "@/lib/types";

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
