import type { Story } from "@/lib/types";
import SectionHeader from "@/components/story/SectionHeader";
import StoryArticle from "@/components/story/StoryArticle";

export default function PlasticPointsSection({
  stories,
}: {
  stories: Story[];
}) {
  return (
    <section id="plastic-points">
      <SectionHeader sectionKey="plastic-points" />

      {stories.length > 0 ? (
        <div className="divide-y hairline">
          {stories.map((s) => (
            <StoryArticle key={s.id} story={s} />
          ))}
        </div>
      ) : (
        <p className="font-body italic text-sm text-ink-soft">
          Nothing card-shaped crossed the wire in the last day.
        </p>
      )}
    </section>
  );
}
