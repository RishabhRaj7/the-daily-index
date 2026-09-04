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
    <section id="market-pulse">
      <SectionHeader sectionKey="market-pulse" folio={indices.length > 0 ? "live tape" : undefined} />
      {indices.length > 0 && (
        <div className="flex justify-end mb-2">
          <LiveBadge />
        </div>
      )}
      <div className="divide-y hairline">
        {stories.map((s) => (
          <StoryArticle key={s.id} story={s} />
        ))}
      </div>
      {indices.length > 0 && mood ? (
        <div className="grid md:grid-cols-[1fr_220px] gap-6 mt-4">
          <div>
            <div className="hidden sm:grid grid-cols-[minmax(0,1.4fr)_auto_repeat(3,4.2rem)_5rem] gap-x-3 border-t-2 border-ink border-b hairline py-1.5 font-label text-[9px] text-ink-soft">
              <span>Index</span>
              <span className="text-right">Level</span>
              <span className="text-right">1D</span>
              <span className="text-right">7D</span>
              <span className="text-right">1M</span>
              <span className="text-right">30 days</span>
            </div>
            <ul className="divide-y hairline border-b hairline sm:border-t-0 border-t-2 sm:border-ink">
              {indices.map((idx) => (
                <MarketIndexCard key={idx.id} index={idx} />
              ))}
            </ul>
          </div>
          <MoodGauge mood={mood} />
        </div>
      ) : (
        <div className="border-l-2 border-masthead-red pl-4 py-1 mt-4">
          <p className="font-headline text-lg font-semibold leading-tight">The tape is silent.</p>
          <p className="font-body text-sm text-ink-soft mt-1">
            Live index data didn&rsquo;t arrive this edition. The table returns on the next refresh.
          </p>
        </div>
      )}
    </section>
  );
}
