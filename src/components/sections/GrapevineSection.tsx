"use client";

import type { GrapevineData } from "@/lib/types";
import { SocialList, useSocialFeed, useSocialView } from "@/components/extras/SocialFeed";
import SocialPausedNote from "@/components/extras/SocialPausedNote";
import type { SocialAnswer } from "@/lib/live/social";
import SectionHeader from "@/components/story/SectionHeader";
import LiveBadge from "@/components/widgets/LiveBadge";
import PuzzleDesk from "@/components/widgets/PuzzleDesk";
import SearchBar from "@/components/widgets/SearchBar";
import SocialTrends from "@/components/widgets/SocialTrends";
import { EditFeedsButton } from "@/components/extras/FeedEditor";
import { describeFeed, feedQuery, useFeed } from "@/lib/feeds";

// The Grapevine: the Search Bar (what each country is searching right now,
// Google Trends) beside what's trending on X and Reddit (SocialTrends), then
// two newspaper columns, separated by a hairline, no cards. Either of a pair
// that has nothing (a source that keeps failing; lib/social-health.ts) isn't
// there, and the other takes the whole width.
//   Left  — "You Should See This": X accounts (the reader's, else the wires
//           and the paper's desks) read through our RSSHub, and the day's top
//           posts in their subreddits (Reddit's RSS), together, each with its
//           platform's mark and an All / X / Reddit filter. The few that fit
//           show; "See all" opens the rest in a sheet. Kept current in the
//           browser (components/extras/SocialFeed.tsx).
//   Right — "The Puzzle Desk": a couple of small games built from today's
//           headlines.

/** One of two columns side by side: a hairline before the second, none when it stands alone. */
const PAIR = "md:flex-1 md:basis-0 min-w-0 md:[&:not(:last-child)]:pr-10 md:[&:not(:first-child)]:pl-10 md:[&:not(:first-child)]:border-l hairline";

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
  dateKey,
  headlines = [],
}: {
  data: GrapevineData;
  /** Today's headlines, so a trending search that's in the paper says so. */
  headlines?: string[];
  /** Edition date (YYYY-MM-DD); seeds the daily puzzle so it's stable on reload. */
  dateKey?: string;
}) {
  // Seed from the edition date + the picks themselves so the puzzle only
  // changes when the paper does.
  const puzzleDateKey = `${dateKey ?? "edition"}:${data.picks.map((p) => p.id).join("|")}`;
  const puzzleHeadlines = data.picks.map((p) => p.title);
  // The reader's feeds (Edit feeds), else the paper's defaults (lib/feeds.ts).
  const feed = useFeed("grapevine");
  const live = useSocialFeed<SocialAnswer>(feed ? `/api/social?kind=grapevine&${feedQuery(feed.config)}` : null);
  const feeds = live.data;
  const sub = feed ? describeFeed(feed.config) : "";
  const social = useSocialView(feeds).view !== "hide";

  return (
    <section id="grapevine">
      <SectionHeader sectionKey="grapevine" />
      <p className="font-headline italic text-lg text-ink-soft -mt-2 mb-10 max-w-[60ch]">
        What the people you follow are saying, and what Reddit is talking about. Every item links to the post itself.
      </p>
      <SocialPausedNote place="grapevine" className="-mt-8 mb-8" />

      {/* Side by side from md up, a hairline between; one alone takes the width. */}
      <div className="flex flex-col md:flex-row gap-y-12 mb-12 empty:hidden">
        <SearchBar headlines={headlines} className={PAIR} />
        <SocialTrends className={PAIR} />
      </div>

      <div className="flex flex-col md:flex-row gap-y-12">
        {social && (
          <div className={PAIR}>
            <ColumnHead
              title="You Should See This"
              sub={sub}
              right={
                <span className="flex items-center gap-2">
                  {feeds?.status === "live" && feeds.posts.length > 0 && <LiveBadge />}
                  <EditFeedsButton section="grapevine" />
                </span>
              }
            />
            <SocialList data={feeds} refresh={live} filterKey="grapevine" max={6} more={{ title: "You Should See This", kicker: `The Grapevine · ${sub}` }} />
          </div>
        )}

        <div className={PAIR}>
          <ColumnHead title="The Puzzle Desk" sub="Two minutes of play, set from today's headlines" />
          <PuzzleDesk headlines={puzzleHeadlines} dateKey={puzzleDateKey} />
        </div>
      </div>
    </section>
  );
}
