import type { Story, OnThisDayEntry, WordOfDay } from "@/lib/types";
import SectionHeader from "@/components/story/SectionHeader";
import StoryArticle from "@/components/story/StoryArticle";
import { OnThisDayBox, WordOfDayBox } from "@/components/widgets/FillerBox";

export default function DatelineSection({
  stories,
  onThisDay,
  wordOfDay,
}: {
  stories: Story[];
  onThisDay: OnThisDayEntry[];
  wordOfDay: WordOfDay;
}) {
  return (
    <section id="dateline">
      <SectionHeader sectionKey="dateline" />
      <div className={`story-grid ${stories.length > 2 ? "is-paired" : ""}`}>
        {stories.map((s, i) => (
          <StoryArticle key={s.id} story={s} lead={i === 0 && stories.length > 2} />
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-x-12 gap-y-10 mt-12 pt-10 border-t hairline">
        <OnThisDayBox entries={onThisDay} />
        <WordOfDayBox word={wordOfDay} />
      </div>
    </section>
  );
}
