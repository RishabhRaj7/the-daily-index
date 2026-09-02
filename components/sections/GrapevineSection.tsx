import type { TrendingTopic } from "@/lib/types";
import SectionHeader from "@/components/story/SectionHeader";
import LiveBadge from "@/components/widgets/LiveBadge";

function TrendItem({ topic }: { topic: TrendingTopic }) {
  const body = topic.summary ?? topic.detail;
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="text-sm font-semibold font-headline leading-snug mb-1">
        {topic.label}
      </div>
      <p className="text-xs text-ink-soft leading-relaxed">{body}</p>
      <div className="flex items-center justify-between gap-2 mt-1.5">
        <span className="font-mono text-[10px] text-ink-soft">{topic.detail}</span>
        {topic.url && (
          <a
            href={topic.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-label text-[10px] text-masthead-red hover:underline shrink-0"
          >
            Read thread ↗
          </a>
        )}
      </div>
    </li>
  );
}

function TrendColumn({
  title,
  topics,
  live = false,
}: {
  title: string;
  topics: TrendingTopic[];
  live?: boolean;
}) {
  return (
    <div className="border hairline rounded-sm p-4 bg-card-bg">
      <div className="flex items-center justify-between mb-3">
        <div className="font-label text-[10px] text-ink-soft">{title}</div>
        {live && <LiveBadge />}
      </div>
      {topics.length === 0 ? (
        <p className="text-xs text-ink-soft italic">Nothing to show right now.</p>
      ) : (
        <ul className="divide-y hairline">
          {topics.map((t) => (
            <TrendItem key={t.id} topic={t} />
          ))}
        </ul>
      )}
    </div>
  );
}

export default function GrapevineSection({
  trending,
  redditLive = false,
}: {
  trending: TrendingTopic[];
  redditLive?: boolean;
}) {
  const xTopics = trending.filter((t) => t.platform === "x").slice(0, 5);
  const redditTopics = trending.filter((t) => t.platform === "reddit").slice(0, 5);

  return (
    <section id="grapevine" className="pb-8">
      <SectionHeader sectionKey="grapevine" />
      <div className="grid sm:grid-cols-2 gap-4">
        <TrendColumn title="Editor's Picks" topics={xTopics} />
        <TrendColumn title="Trending on Reddit" topics={redditTopics} live={redditLive} />
      </div>
    </section>
  );
}
