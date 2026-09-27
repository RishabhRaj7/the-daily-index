import type { Story } from "@/lib/types";
import SectionHeader from "@/components/story/SectionHeader";
import StoryArticle from "@/components/story/StoryArticle";

export default function DatelineSection({ stories }: { stories: Story[] }) {
  return (
    <section id="dateline">
      <SectionHeader sectionKey="dateline" />
      <div className={`story-grid ${stories.length > 2 ? "is-paired" : ""}`}>
        {stories.map((s, i) => (
          <StoryArticle key={s.id} story={s} lead={i === 0 && stories.length > 2} />
        ))}
      </div>
    </section>
  );
}
