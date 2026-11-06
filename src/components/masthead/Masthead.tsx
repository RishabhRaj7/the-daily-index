import type { Edition, WeatherNow } from "@/lib/types";
import { totalReadTime } from "@/lib/format";
import ParticleWordmark from "./ParticleWordmark";
import SignalRow from "./SignalRow";

// The masthead, kept to about a tenth of the screen so the day's news starts on
// the first screen of any device: one quiet line (from a tablet up; a phone has
// the date in its top row), the particle wordmark, and the numbers. Listen and
// Refresh sit with the briefing, next to what they act on.

function shortDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d
    .toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    .replace(",", "")
    .toUpperCase();
}

export default function Masthead({ edition, weather }: { edition: Edition; weather?: WeatherNow }) {
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
        <div className="hidden md:flex items-center justify-between gap-4 pt-2.5 font-mono text-[11px] text-ink-soft">
          <span>
            VOL. {edition.volume} · NO. {edition.issue}
          </span>
          <span className="text-ink">{edition.date}</span>
          <span>{totalReadTime(edition)} MIN READ</span>
        </div>

        <h1 className="m-0">
          <ParticleWordmark shapes={shapes} label="The Daily Index" className="h-[64px] md:h-[86px] -mx-1" />
        </h1>
      </div>
      <SignalRow edition={edition} weather={w} />
    </header>
  );
}
