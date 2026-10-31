"use client";

import type { GrapevineData } from "@/lib/types";
import { SocialList, useSocial } from "@/components/extras/SocialFeed";
import SectionHeader from "@/components/story/SectionHeader";
import LiveBadge from "@/components/widgets/LiveBadge";
import PuzzleDesk from "@/components/widgets/PuzzleDesk";
import SearchBar from "@/components/widgets/SearchBar";

// The Grapevine: the Search Bar (what each country is searching right now,
// Google Trends), then two newspaper columns, separated by a hairline, no cards.
//   Left  — "You Should See This": the X accounts and searches the reader
//           follows (read through our RSSHub) and the day's top posts in their
//           subreddits (Reddit's RSS), together, each with its platform's mark
//           and an All / X / Reddit filter the reader controls. Kept current in
//           the browser (components/extras/SocialFeed.tsx). The wire's best
//           stories already run as In Brief in each section.
//   Right — "The Puzzle Desk": a couple of small games built from today's
//           headlines.

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

export default function GrapevineSection({
  data,
  subreddits = [],
  redditUser = null,
  dateKey,
  headlines = [],
  xAccounts = [],
  xSearches = [],
}: {
  data: GrapevineData;
  /** The reader's X accounts and searches. */
  xAccounts?: string[];
  xSearches?: string[];
  /** Today's headlines, so a trending search that's in the paper says so. */
  headlines?: string[];
  /** The subreddits the paper reads for this reader (their list, their Reddit subscriptions, or one from their sports). */
  subreddits?: string[];
  redditUser?: string | null;
  /** Edition date (YYYY-MM-DD); seeds the daily puzzle so it's stable on reload. */
  dateKey?: string;
}) {
  // Seed from the edition date + the picks themselves so the puzzle only
  // changes when the paper does.
  const puzzleDateKey = `${dateKey ?? "edition"}:${data.picks.map((p) => p.id).join("|")}`;
  const puzzleHeadlines = data.picks.map((p) => p.title);
  const subs = subreddits.length ? subreddits : ["popular"];
  const feeds = useSocial(
    `/api/social?kind=grapevine&x=${encodeURIComponent(xAccounts.join(","))}&q=${encodeURIComponent(xSearches.join("|"))}&r=${encodeURIComponent(subs.join(","))}`,
  );
  const onX = [...xAccounts.slice(0, 2).map((h) => `@${h}`), ...(xAccounts.length > 2 ? [`${xAccounts.length - 2} more`] : []), ...(xSearches.length ? [`${xSearches.length} search${xSearches.length > 1 ? "es" : ""}`] : [])].join(", ");
  const onReddit = redditUser ? `u/${redditUser}'s subreddits` : subs.slice(0, 2).map((s) => `r/${s}`).join(", ") + (subs.length > 2 ? ` & ${subs.length - 2} more` : "");
  const sub = onX ? `${onX} on X · ${onReddit}` : `${onReddit} · add X accounts in Settings`;

  return (
    <section id="grapevine">
      <SectionHeader sectionKey="grapevine" />
      <p className="font-headline italic text-lg text-ink-soft -mt-2 mb-10 max-w-[60ch]">
        What the people you follow are saying, and what Reddit is talking about. Every item links to the post itself.
      </p>

      <SearchBar headlines={headlines} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-y-12">
        <div className="md:pr-10 md:border-r hairline min-w-0">
          <ColumnHead title="You Should See This" sub={sub} right={feeds?.status === "live" && feeds.posts.length > 0 ? <LiveBadge /> : undefined} />
          <SocialList data={feeds} filterKey="grapevine" max={8} empty="Nothing new from your feeds today." />
        </div>

        <div className="md:pl-10 min-w-0">
          <ColumnHead title="The Puzzle Desk" sub="Two minutes of play, set from today's headlines" />
          <PuzzleDesk headlines={puzzleHeadlines} dateKey={puzzleDateKey} />
        </div>
      </div>
    </section>
  );
}
