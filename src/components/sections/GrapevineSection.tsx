"use client";

import type { EditorsPick, GrapevineData, TrendingTopic } from "@/lib/types";
import SectionHeader from "@/components/story/SectionHeader";
import LiveBadge from "@/components/widgets/LiveBadge";

// The Grapevine: two newspaper columns, separated by a hairline, no cards.
//   Left  — "You Should See This": real stories lifted from today's own wire
//           pool, weighted toward the reader's interests. Nothing invented.
//   Right — "Overheard on Reddit": top posts from the reader's subreddits via
//           the official API, or an honest note about why the column is thin.

function ColumnHead({ title, sub, right }: { title: string; sub: string; right?: React.ReactNode }) {
  return (
    <div className="border-b hairline pb-2 mb-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-label text-[11px] text-ink">{title}</h3>
        {right}
      </div>
      <p className="font-body italic text-xs text-ink-soft mt-0.5">{sub}</p>
    </div>
  );
}

function PickItem({ pick, index }: { pick: EditorsPick; index: number }) {
  return (
    <li className="py-3 first:pt-0 last:pb-0 grid grid-cols-[1.6rem_1fr] gap-x-2">
      <span className="font-headline text-2xl leading-none text-masthead-red tabular-nums pt-0.5">
        {index + 1}
      </span>
      <div className="min-w-0">
        <a
          href={pick.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-headline text-[15px] sm:text-base font-semibold leading-snug hover:underline decoration-masthead-red underline-offset-2"
        >
          {pick.title}
        </a>
        <p className="font-body text-[13px] leading-relaxed text-ink-soft mt-1">
          {pick.blurb ?? pick.why}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
          {pick.personal && (
            <span className="font-label text-[9px] text-masthead-red">
              For you{pick.matchedInterest ? ` · ${pick.matchedInterest}` : ""}
            </span>
          )}
          <span className="font-label text-[9px] text-ink-soft">{pick.pool} wire</span>
          <span className="font-mono text-[10px] text-ink-soft">
            {pick.domain} · {pick.postedAgo}
          </span>
        </div>
      </div>
    </li>
  );
}

function RedditItem({ topic }: { topic: TrendingTopic }) {
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <a
        href={topic.url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-headline text-[15px] sm:text-base font-semibold leading-snug hover:underline decoration-masthead-red underline-offset-2"
      >
        {topic.label}
      </a>
      {topic.summary && (
        <p className="font-body text-[13px] leading-relaxed text-ink-soft mt-1">{topic.summary}</p>
      )}
      <div className="font-mono text-[10px] text-ink-soft mt-1.5">{topic.detail}</div>
    </li>
  );
}

function RedditStatusLine({ status, note }: { status: GrapevineData["redditStatus"]; note: string | null }) {
  if (status === "live" && !note) return null;
  const tone =
    status === "live" || status === "public" ? "text-ink-soft" : "text-masthead-red";
  return (
    <p className={`font-body italic text-xs leading-relaxed mt-3 pt-2 border-t hairline ${tone}`}>
      {status === "public" && !note
        ? "Fetched from Reddit's public endpoint; configure API credentials for a steadier feed."
        : note}
    </p>
  );
}

export default function GrapevineSection({
  data,
  subreddits = [],
  redditUser = null,
}: {
  data: GrapevineData;
  subreddits?: string[];
  redditUser?: string | null;
}) {
  const picks = data.picks.slice(0, 5);
  const reddit = data.reddit.slice(0, 5);
  const listed =
    subreddits.length > 0
      ? subreddits.slice(0, 3).map((s) => `r/${s}`).join(", ") + (subreddits.length > 3 ? " & more" : "")
      : null;
  const subLabel = redditUser
    ? `u/${redditUser}'s subscriptions${listed ? ` — ${listed}` : ""}`
    : (listed ?? "r/popular — add your subreddits in Settings");

  return (
    <section id="grapevine" className="pb-8">
      <SectionHeader sectionKey="grapevine" />
      <p className="font-body italic text-sm text-ink-soft -mt-2 mb-5">
        What a well-read friend would forward you this morning — every item links to a real story
        fetched for today&rsquo;s edition. Nothing here is invented.
      </p>

      <div className="grid md:grid-cols-2 md:divide-x hairline gap-y-8">
        <div className="md:pr-6">
          <ColumnHead
            title="You Should See This"
            sub="Editor's picks from today's wire, weighted toward what you follow"
          />
          {picks.length === 0 ? (
            <p className="font-body italic text-sm text-ink-soft">
              The wires were thin today; nothing surprising enough to forward.
            </p>
          ) : (
            <ol className="divide-y hairline">
              {picks.map((p, i) => (
                <PickItem key={p.id} pick={p} index={i} />
              ))}
            </ol>
          )}
        </div>

        <div className="md:pl-6">
          <ColumnHead
            title="Overheard on Reddit"
            sub={`Top of the day in ${subLabel}`}
            right={data.redditStatus === "live" ? <LiveBadge /> : undefined}
          />
          {reddit.length === 0 ? (
            <p className="font-body italic text-sm text-ink-soft">
              The Reddit column is empty this edition.
            </p>
          ) : (
            <ul className="divide-y hairline">
              {reddit.map((t) => (
                <RedditItem key={t.id} topic={t} />
              ))}
            </ul>
          )}
          <RedditStatusLine status={data.redditStatus} note={data.redditNote} />
        </div>
      </div>
    </section>
  );
}
