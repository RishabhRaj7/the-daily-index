import type { Story } from "@/lib/types";
import SectionHeader from "@/components/story/SectionHeader";
import StoryArticle from "@/components/story/StoryArticle";

export default function CircuitBoardSection({
  stories,
}: {
  stories: Story[];
}) {
  return (
    <section id="circuit-board" className="pb-8">
      <SectionHeader sectionKey="circuit-board" />
      <div className="divide-y hairline">
        {stories.map((s) => (
          <StoryArticle key={s.id} story={s} />
        ))}
      </div>
    </section>
  );
}
