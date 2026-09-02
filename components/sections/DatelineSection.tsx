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
    <section id="dateline" className="pb-8">
      <SectionHeader sectionKey="dateline" />
      <div className="divide-y hairline">
        {stories.map((s) => (
          <StoryArticle key={s.id} story={s} />
        ))}
      </div>
      <div className="grid sm:grid-cols-2 gap-4 mt-4">
        <OnThisDayBox entries={onThisDay} />
        <WordOfDayBox word={wordOfDay} />
      </div>
    </section>
  );
}
