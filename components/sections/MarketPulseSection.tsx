import type { Story, MarketIndex, MarketMood } from "@/lib/types";
import SectionHeader from "@/components/story/SectionHeader";
import StoryArticle from "@/components/story/StoryArticle";
import MarketIndexCard from "@/components/widgets/MarketIndexCard";
import MoodGauge from "@/components/widgets/MoodGauge";
import LiveBadge from "@/components/widgets/LiveBadge";

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
    <section id="market-pulse" className="pb-8">
      <SectionHeader sectionKey="market-pulse" />
      {indices.length > 0 && (
        <div className="flex justify-end -mt-3 mb-2">
          <LiveBadge />
        </div>
      )}
      <div className="divide-y hairline">
        {stories.map((s) => (
          <StoryArticle key={s.id} story={s} />
        ))}
      </div>
      {indices.length > 0 && mood ? (
        <div className="grid md:grid-cols-[1fr_220px] gap-4 mt-4">
          <div className="grid sm:grid-cols-2 gap-3">
            {indices.map((idx) => (
              <MarketIndexCard key={idx.id} index={idx} />
            ))}
          </div>
          <MoodGauge mood={mood} />
        </div>
      ) : (
        <p className="text-sm text-ink-soft italic mt-4">
          Live market data is temporarily unavailable.
        </p>
      )}
    </section>
  );
}
