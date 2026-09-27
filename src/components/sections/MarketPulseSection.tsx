import type { Story, MarketIndex, MarketMood } from "@/lib/types";
import SectionHeader from "@/components/story/SectionHeader";
import StoryArticle from "@/components/story/StoryArticle";
import MarketIndexCard from "@/components/widgets/MarketIndexCard";
import MoodGauge from "@/components/widgets/MoodGauge";

export default function MarketPulseSection({
  stories,
  indices,
  mood,
}: {
  stories: Story[];
  indices: MarketIndex[];
  mood: MarketMood | null;
}) {
  return (
    <section id="market-pulse">
      <SectionHeader
        sectionKey="market-pulse"
        folio={indices.length > 0 ? <><span className="live-dot text-up" /> live tape</> : undefined}
      />
      {indices.length > 0 && mood ? (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_260px] gap-5 items-start">
          <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {indices.map((idx, i) => (
              <MarketIndexCard key={idx.id} index={idx} i={i} />
            ))}
          </ul>
          <MoodGauge mood={mood} />
        </div>
      ) : (
        <div className="border-l-2 border-accent pl-4 py-1">
          <p className="font-headline text-xl leading-tight">The tape is silent.</p>
          <p className="font-body text-sm text-ink-soft mt-1">
            Live index data didn&rsquo;t arrive this edition. The table returns on the next refresh.
          </p>
        </div>
      )}
      {stories.length > 0 && (
        <div className="story-grid mt-10">
          {stories.map((s) => (
            <StoryArticle key={s.id} story={s} />
          ))}
        </div>
      )}
    </section>
  );
}
