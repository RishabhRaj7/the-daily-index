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
    section.type === "custom" ? section.instruction : undefined;

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
        <SectionHeader label={section.label} />
        {sub && <p className="font-headline italic text-ink-soft -mt-4 mb-8">{sub}</p>}
        {orderedGroups.map((group) => (
          <div key={group}>
            <div className="flex items-center gap-3 mt-10 mb-4 first:mt-0" data-reveal>
              <span className="w-2 h-2 rounded-full" style={{ background: "var(--section-hue, var(--accent))" }} />
              <span className="font-display font-bold text-[1.6rem] leading-none">{group}</span>
              <span className="h-px flex-1 bg-rule" />
            </div>
            <div className="story-grid">
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
      <SectionHeader label={section.label} />
      {sub && <p className="font-headline italic text-ink-soft -mt-4 mb-8">{sub}</p>}
      <div className={`story-grid ${articles.length > 2 ? "is-paired" : ""}`}>
        {articles.map((a, i) => (
          <StoryArticle key={a.url} story={digestArticleToStory(section, a, i)} lead={i === 0 && articles.length > 2} />
        ))}
      </div>
    </section>
  );
}
