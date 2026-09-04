import type { Story } from "@/lib/types";
import SectionHeader from "@/components/story/SectionHeader";
import StoryArticle from "@/components/story/StoryArticle";

export default function LedgerSection({
  stories,
}: {
  stories: Story[];
}) {
  return (
    <section id="ledger">
      <SectionHeader sectionKey="ledger" />
      <div className="divide-y hairline">
        {stories.map((s) => (
          <StoryArticle key={s.id} story={s} />
        ))}
      </div>
    </section>
  );
}
