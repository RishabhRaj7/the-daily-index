import type { Story, CreditCard } from "@/lib/types";
import SectionHeader from "@/components/story/SectionHeader";
import StoryArticle from "@/components/story/StoryArticle";

function CardBadge({ card }: { card: CreditCard }) {
  return (
    <span className="text-xs px-2 py-1 border hairline rounded-sm bg-card-bg">
      {card.name}
    </span>
  );
}

export default function PlasticPointsSection({
  stories,
  cards,
  cardFollowing,
}: {
  stories: Story[];
  cards: CreditCard[];
  cardFollowing: string;
}) {
  const followed = cards.find((c) => c.id === cardFollowing);

  return (
    <section id="plastic-points" className="pb-8">
      <SectionHeader sectionKey="plastic-points" />

      {followed && (
        <div className="paper-box paper-box-tight mb-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-label text-[10px] text-ink-soft">Following</span>
            <CardBadge card={followed} />
            <span className="font-mono text-[11px] text-ink-soft">
              {followed.issuer} · {followed.network}
            </span>
          </div>
          <p className="font-body text-[13px] text-ink-soft mt-1.5 leading-relaxed">
            {followed.rewardRate} · {followed.annualFee} annual fee
            {followed.loungeAccess ? ` · ${followed.loungeAccess}` : ""}
            {followed.milestoneBenefit ? ` · ${followed.milestoneBenefit}` : ""} —
            stories mentioning {followed.issuer} lead this section.
          </p>
        </div>
      )}

      {stories.length > 0 ? (
        <div className="divide-y hairline">
          {stories.map((s) => (
            <StoryArticle key={s.id} story={s} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-soft italic">
          No live credit-card updates found in the last day.
        </p>
      )}
    </section>
  );
}
