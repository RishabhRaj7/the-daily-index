import type { Edition, WeatherNow } from "@/lib/types";
import { totalReadTime } from "@/lib/format";
import ListenButton from "@/components/extras/ListenButton";
import PullToRefreshStamp from "@/components/chrome/PullToRefreshStamp";
import ParticleWordmark from "./ParticleWordmark";
import SignalRow from "./SignalRow";

function shortDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d
    .toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    .replace(",", "")
    .toUpperCase();
}

export default function Masthead({
  edition,
  isArchive = false,
  weather,
}: {
  edition: Edition;
  isArchive?: boolean;
  weather?: WeatherNow;
}) {
  const w = weather ?? edition.weather;
  const shapes = [
    ["THE DAILY INDEX"],
    [shortDate(edition.isoDate)],
    [`NO. ${edition.issue}`],
    ...(w ? [[`${w.tempC}° ${w.city.toUpperCase()}`]] : []),
  ];

  return (
    <header id="masthead">
      <div className="page-wrap px-4 sm:px-6">
        <div className="flex items-center justify-between gap-4 pt-5 pb-2 font-mono text-[11px] text-ink-soft">
          <span>
            VOL. {edition.volume} · NO. {edition.issue}
          </span>
          <span className="hidden sm:inline text-ink">{edition.date}</span>
          <span>{totalReadTime(edition)} MIN READ</span>
        </div>
        <span className="block sm:hidden text-center font-mono text-[11px] text-ink pb-1">{edition.date}</span>

        <h1 className="m-0">
          <ParticleWordmark
            shapes={shapes}
            label="The Daily Index"
            className="h-[150px] sm:h-[clamp(96px,15.5vw,210px)] -mx-1"
          />
        </h1>

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-4 border-t hairline mt-3">
          <p className="font-headline italic text-[15px] sm:text-base text-ink-soft">
            An index of everything that matters today<span className="text-accent">.</span>
            <span className="hidden md:inline font-mono not-italic text-[10px] text-ink-faint ml-3 align-middle">
              TOUCH THE TYPE ↑
            </span>
          </p>
          {!isArchive && (
            <div className="flex items-center gap-2">
              <ListenButton edition={edition} />
              <PullToRefreshStamp />
            </div>
          )}
        </div>
      </div>
      <SignalRow edition={edition} weather={w} />
    </header>
  );
}
