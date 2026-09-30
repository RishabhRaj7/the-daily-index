import type { Story } from "@/lib/types";
import SectionHeader from "@/components/story/SectionHeader";
import StoryArticle from "@/components/story/StoryArticle";

// The Nation: India's own news, apart from the world. Laid out like
// Dateline: the lead across the top, the rest paired beneath it.
export default function NationSection({ stories }: { stories: Story[] }) {
  return (
    <section id="the-nation">
      <SectionHeader sectionKey="the-nation" />
      <div className={`story-grid ${stories.length > 2 ? "is-paired" : ""}`}>
        {stories.map((s, i) => (
          <StoryArticle key={s.id} story={s} lead={i === 0 && stories.length > 2} />
        ))}
      </div>
    </section>
  );
}
