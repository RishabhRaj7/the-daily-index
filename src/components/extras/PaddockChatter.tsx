"use client";

import { useF1Favourites } from "@/components/f1/LiveTiming";
import { describeFeed, feedQuery, useFeed } from "@/lib/feeds";
import { EditFeedsButton } from "./FeedEditor";
import { SocialList, SourceLogo, useSocialFeed, useSocialView } from "./SocialFeed";
import type { SocialAnswer } from "@/lib/live/social";

// The paddock talking, a small card in the Pit wall under the Starting Grid:
// by default r/formula1 and r/F1Technical's top of the day, F1, the FIA, the
// reader's team and three reporters on X; the sliders mark changes any of it
// (lib/feeds.ts, synced). Posts about the reader's drivers or team rank first
// and carry their name (lib/live/social.ts, f1Chatter). Three show; "See all"
// opens the rest, with the X / Reddit filter. When X and Reddit have nothing
// (or keep failing; lib/social-health.ts) the card isn't there.

const SHOW = 3;

export default function PaddockChatter() {
  const fav = useF1Favourites();
  const feed = useFeed("paddock");
  const drivers = [...fav.codes].join(",").toLowerCase();
  const live = useSocialFeed<SocialAnswer>(feed ? `/api/social?kind=f1&drivers=${encodeURIComponent(drivers)}&team=${encodeURIComponent(fav.team)}&${feedQuery(feed.config)}` : null);
  const { posts, view } = useSocialView(live.data);
  if (view === "hide" || !feed) return null;
  // Yours first: posts naming the reader's drivers or team lead the three.
  const data = live.data ? { ...live.data, posts: [...live.data.posts.filter((p) => p.tags?.length), ...live.data.posts.filter((p) => !p.tags?.length)] } : null;
  const sources = new Set(posts.map((p) => p.source));
  return (
    <div className="module min-w-0" data-reveal>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="flex items-center gap-1.5 min-w-0" title={describeFeed(feed.config)}>
          {(sources.size ? [...sources] : (["x", "reddit"] as const)).map((s) => (
            <SourceLogo key={s} source={s} size={13} />
          ))}
          <span className="font-label text-[10px] text-ink-soft truncate">Paddock chatter</span>
        </span>
        <EditFeedsButton section="paddock" iconOnly />
      </div>
      <SocialList data={data} compact max={SHOW} filterKey="paddock" filterInSheet more={{ title: "Paddock chatter", kicker: `Paddock Notes · ${describeFeed(feed.config)}` }} />
    </div>
  );
}
