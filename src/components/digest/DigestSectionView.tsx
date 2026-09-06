// Renders a preference-driven digest section that has no existing paper slot
// of its own (a new topic, a grouped section the reader invented, or a
// "custom" experiment). Reuses SectionHeader + StoryArticle so it reads
// exactly like the rest of the paper.

import type { DigestArticle, DigestSection } from "@/lib/preferences/types";
import { digestArticleToStory } from "@/lib/preferences/stories";
import SectionHeader from "@/components/story/SectionHeader";
import StoryArticle from "@/components/story/StoryArticle";

export default function DigestSectionView({
  section,
  articles,
}: {
  section: DigestSection;
  articles: DigestArticle[];
}) {
  const sub =
    section.type === "grouped"
      ? `${section.groupBy}: ${section.groups.join(" · ")}`
      : section.type === "custom"
        ? section.instruction
        : undefined;

  if (section.type === "grouped") {
    const byGroup = new Map<string, DigestArticle[]>();
    for (const a of articles) {
      const key = a.group ?? "Other";
      byGroup.set(key, [...(byGroup.get(key) ?? []), a]);
    }
    // Print groups in the reader's declared order; leftovers at the end.
    const orderedGroups = [...section.groups.filter((g) => byGroup.has(g)),
      ...[...byGroup.keys()].filter((g) => !section.groups.includes(g))];

    return (
      <section id={`digest-${section.id}`}>
        <SectionHeader label={section.label} sub={sub} />
        {orderedGroups.map((group) => (
          <div key={group}>
            <div className="font-label text-[10px] text-masthead-red mt-5 mb-1">
              {group.toUpperCase()}
            </div>
            <div className="divide-y hairline">
              {(byGroup.get(group) ?? []).map((a, i) => (
                <StoryArticle key={a.url} story={digestArticleToStory(section, a, i)} />
              ))}
            </div>
          </div>
        ))}
      </section>
    );
  }

  return (
    <section id={`digest-${section.id}`}>
      <SectionHeader label={section.label} sub={sub} />
      <div className="divide-y hairline">
        {articles.map((a, i) => (
          <StoryArticle key={a.url} story={digestArticleToStory(section, a, i)} />
        ))}
      </div>
    </section>
  );
}
