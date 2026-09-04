import Link from "next/link";
import type { Edition, WeatherNow } from "@/lib/types";
import { formatIssue, totalReadTime } from "@/lib/format";
import EditionToggle from "./EditionToggle";
import WeatherCornerBox from "./WeatherCornerBox";
import ListenButton from "@/components/extras/ListenButton";
import PullToRefreshStamp from "@/components/chrome/PullToRefreshStamp";

export default function Masthead({
  edition,
  isArchive = false,
  weather,
  weatherLive = false,
}: {
  edition: Edition;
  isArchive?: boolean;
  weather?: WeatherNow;
  weatherLive?: boolean;
}) {
  return (
    <header className="border-b-4 border-double border-ink">
      <div className="max-w-5xl mx-auto px-4 pt-3 pb-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 font-label text-[11px] sm:text-xs text-ink-soft">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>{edition.date}</span>
          <span className="font-mono">{formatIssue(edition.volume, edition.issue)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-mono">{totalReadTime(edition)} min read</span>
          {isArchive ? (
            <Link href="/" className="underline">
              Today&rsquo;s edition
            </Link>
          ) : (
            <Link href="/archive" className="underline">
              The Morgue
            </Link>
          )}
          <Link href="/settings" className="underline">
            Settings
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-start justify-between gap-4 sm:gap-6">
        <div className="flex-1 min-w-0">
          <h1 className="font-headline text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight">
            The Daily Index
          </h1>
          <p className="text-ink-soft italic mt-1 text-sm md:text-base">
            An index of everything that matters today.
          </p>
        </div>
        {(weather ?? edition.weather) && (
          <WeatherCornerBox weather={(weather ?? edition.weather)!} live={weatherLive} />
        )}
      </div>

      <div className="max-w-5xl mx-auto px-4 pb-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <EditionToggle />
          <ListenButton edition={edition} />
        </div>
        <PullToRefreshStamp />
      </div>
    </header>
  );
}
