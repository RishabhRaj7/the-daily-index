import type { Story, CreditCard } from "@/lib/types";
import SectionHeader from "@/components/story/SectionHeader";
import StoryArticle from "@/components/story/StoryArticle";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-x-3 py-1.5 border-b hairline last:border-b-0">
      <dt className="font-label text-[9px] text-ink-soft pt-[3px]">{label}</dt>
      <dd className="font-body text-[13px] leading-snug">{value}</dd>
    </div>
  );
}

function CardFactFile({ card }: { card: CreditCard }) {
  return (
    <div className="paper-box paper-box-tight">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h3 className="font-headline text-lg font-semibold leading-tight">{card.name}</h3>
        <span className="font-mono text-[10px] text-ink-soft text-right shrink-0">{card.issuer}</span>
      </div>
      <div className="font-mono text-[10px] text-ink-soft mb-2">{card.network}</div>
      <dl>
        <Row label="Fee" value={card.annualFee} />
        <Row label="Earn" value={card.rewardRate} />
        <Row label="Milestones" value={card.milestoneBenefit} />
        <Row label="Lounges" value={card.loungeAccess} />
      </dl>
    </div>
  );
}

export default function PlasticPointsSection({
  stories,
  cards,
  cardsFollowing,
}: {
  stories: Story[];
  cards: CreditCard[];
  cardsFollowing: string[];
}) {
  const followed = cards.filter((c) => cardsFollowing.includes(c.id));

  return (
    <section id="plastic-points">
      <SectionHeader sectionKey="plastic-points" />

      {followed.length > 0 && (
        <div className="mb-6">
          <div className="font-label text-[10px] text-ink-soft mb-2">
            Your wallet · {followed.length} card{followed.length === 1 ? "" : "s"} on file
          </div>
          <div
            className={`grid gap-x-8 gap-y-4 ${
              followed.length === 1 ? "md:grid-cols-2" : followed.length === 2 ? "md:grid-cols-2" : "md:grid-cols-3"
            }`}
          >
            {followed.map((c) => (
              <CardFactFile key={c.id} card={c} />
            ))}
          </div>
        </div>
      )}

      {stories.length > 0 ? (
        <div className="divide-y hairline">
          {stories.map((s) => (
            <StoryArticle key={s.id} story={s} />
          ))}
        </div>
      ) : (
        <p className="font-body italic text-sm text-ink-soft">
          Nothing card-shaped crossed the wire in the last day.
        </p>
      )}
    </section>
  );
}
