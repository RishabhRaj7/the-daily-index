"use client";

import { useF1Favourites } from "@/components/f1/LiveTiming";
import { describeFeed, feedQuery, useFeed } from "@/lib/feeds";
import { EditFeedsButton } from "./FeedEditor";
import { SocialList, useSocialFeed } from "./SocialFeed";
import type { SocialAnswer } from "@/lib/live/social";

// The paddock talking, under Paddock Notes' stories: by default r/formula1 and
// r/F1Technical's top of the day, F1, the FIA, the reader's team and three
// reporters on X; "Edit feeds" changes any of it (lib/feeds.ts, synced).
// Posts about the reader's drivers or team rank first and carry their name
// (lib/live/social.ts, f1Chatter). A few show; "See all" opens the rest.

export default function PaddockChatter() {
  const fav = useF1Favourites();
  const feed = useFeed("paddock");
  const drivers = [...fav.codes].join(",").toLowerCase();
  const live = useSocialFeed<SocialAnswer>(feed ? `/api/social?kind=f1&drivers=${encodeURIComponent(drivers)}&team=${encodeURIComponent(fav.team)}&${feedQuery(feed.config)}` : null);
  return (
    <div className="mt-8 pt-4 border-t hairline min-w-0" data-reveal>
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="min-w-0">
          <span className="block font-label text-[10px] tracking-widest text-ink-soft uppercase">From the paddock</span>
          {feed && <span className="block font-mono text-[10px] text-ink-faint truncate mt-0.5">{describeFeed(feed.config)}</span>}
        </span>
        <EditFeedsButton section="paddock" />
      </div>
      <SocialList
        data={live.data}
        refresh={live}
        compact
        max={5}
        filterKey="paddock"
        more={{ title: "From the paddock", kicker: "Paddock Notes · X and Reddit, last two days" }}
        empty="The paddock's quiet on X and Reddit today."
      />
    </div>
  );
}
