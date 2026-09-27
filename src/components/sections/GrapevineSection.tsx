"use client";

import type { EditorsPick, GrapevineData, TrendingTopic } from "@/lib/types";
import SectionHeader from "@/components/story/SectionHeader";
import LiveBadge from "@/components/widgets/LiveBadge";
import PuzzleDesk from "@/components/widgets/PuzzleDesk";

// The Grapevine: two newspaper columns, separated by a hairline, no cards.
//   Left  — "You Should See This": real stories lifted from today's own wire
//           pool, weighted toward the reader's interests. Nothing invented.
//   Right — "Overheard on Reddit": top posts from the reader's subreddits via
//           the official API. When Reddit has nothing for us (blocked network,
//           rate-limited, unconfigured) the same column becomes "The Puzzle
//           Desk" — a couple of small games built from today's headlines —
//           rather than printing an error. Same footprint either way.

function ColumnHead({ title, sub, right }: { title: string; sub: string; right?: React.ReactNode }) {
  return (
    <div className="pb-3 mb-4 border-b hairline">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display font-extrabold text-[1.9rem] leading-none">{title}</h3>
        {right}
      </div>
      <p className="font-body italic text-xs text-ink-soft mt-0.5">{sub}</p>
    </div>
  );
}

function PickItem({ pick, index }: { pick: EditorsPick; index: number }) {
  return (
    <li className="group py-4 first:pt-0 last:pb-0 grid grid-cols-[2.4rem_1fr] gap-x-3" data-reveal style={{ ["--reveal-i" as string]: index }}>
      <span
        className="font-display font-extrabold text-[2.4rem] leading-[0.8] tabular-nums text-ink-faint transition-colors duration-300 group-hover:text-[color:var(--section-hue)]"
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="min-w-0">
        <a
          href={pick.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-headline text-[1.15rem] leading-snug"
        >
          <span className="headline-link">{pick.title}</span>
        </a>
        <p className="font-body text-[13px] leading-relaxed text-ink-soft mt-1">
          {pick.blurb ?? pick.why}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
          {pick.personal && (
            <span className="font-label text-[9px] text-accent">
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
        className="group font-headline text-[1.1rem] leading-snug"
      >
        <span className="headline-link">{topic.label}</span>
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
    status === "live" || status === "public" ? "text-ink-soft" : "text-accent";
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
  dateKey,
}: {
  data: GrapevineData;
  subreddits?: string[];
  redditUser?: string | null;
  /** Edition date (YYYY-MM-DD); seeds the daily puzzle so it's stable on reload. */
  dateKey?: string;
}) {
  // Seed from the edition date + the picks themselves so the puzzle only
  // changes when the paper does.
  const puzzleDateKey = `${dateKey ?? "edition"}:${data.picks.map((p) => p.id).join("|")}`;
  const picks = data.picks.slice(0, 5);
  const reddit = data.reddit.slice(0, 5);
  const puzzleMode = reddit.length === 0;
  const puzzleHeadlines = data.picks.map((p) => p.title);
  const puzzleNote =
    data.redditStatus === "unconfigured"
      ? "Reddit isn't wired up yet — the Puzzle Desk keeps this column busy meanwhile."
      : "Reddit's wire is quiet this edition — the Puzzle Desk keeps this column busy meanwhile.";
  const listed =
    subreddits.length > 0
      ? subreddits.slice(0, 3).map((s) => `r/${s}`).join(", ") + (subreddits.length > 3 ? " & more" : "")
      : null;
  const subLabel = redditUser
    ? `u/${redditUser}'s subscriptions${listed ? ` — ${listed}` : ""}`
    : (listed ?? "r/popular — add your subreddits in Settings");

  return (
    <section id="grapevine">
      <SectionHeader sectionKey="grapevine" />
      <p className="font-headline italic text-lg text-ink-soft -mt-2 mb-10 max-w-[60ch]">
        What a well-read friend would forward you this morning. Every item links to a real story from today&rsquo;s wire.
      </p>

      <div className="grid md:grid-cols-2 gap-y-12">
        <div className="md:pr-10 md:border-r hairline">
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

        <div className="md:pl-10">
          {puzzleMode ? (
            <>
              <ColumnHead
                title="The Puzzle Desk"
                sub="Two minutes of play, set from today's headlines"
              />
              <PuzzleDesk headlines={puzzleHeadlines} dateKey={puzzleDateKey} note={puzzleNote} />
            </>
          ) : (
            <>
              <ColumnHead
                title="Overheard on Reddit"
                sub={`Top of the day in ${subLabel}`}
                right={data.redditStatus === "live" ? <LiveBadge /> : undefined}
              />
              <ul className="divide-y hairline">
                {reddit.map((t) => (
                  <RedditItem key={t.id} topic={t} />
                ))}
              </ul>
              <RedditStatusLine status={data.redditStatus} note={data.redditNote} />
            </>
          )}
        </div>
      </div>
    </section>
  );
}
