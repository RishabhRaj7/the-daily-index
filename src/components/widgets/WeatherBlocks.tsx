import type { WeatherBlock } from "@/lib/types";
import WeatherIcon from "./WeatherIcon";

// The rest of the day in four blocks, each with its chance of rain as a
// column that fills from the bottom — a glance answers "do I need an
// umbrella this evening?".

function rainWord(pct: number): string {
  if (pct < 15) return "dry";
  if (pct < 40) return "slight chance";
  if (pct < 70) return "likely";
  return "rain expected";
}

export default function WeatherBlocks({ blocks, compact = false }: { blocks: WeatherBlock[]; compact?: boolean }) {
  if (blocks.length === 0) return null;
  return (
    <ol className={`grid grid-cols-2 sm:grid-cols-4 ${compact ? "gap-2" : "gap-3"}`}>
      {blocks.map((b, i) => (
        <li
          key={`${b.label}-${i}`}
          data-reveal
          style={{ ["--reveal-i" as string]: i }}
          className={`module flex gap-3 ${compact ? "p-3" : ""} ${i === 0 ? "border-[color:var(--section-hue)]" : ""}`}
        >
          {/* Chance of rain as a filling column. */}
          <span
            className="relative w-2.5 shrink-0 rounded-full bg-card-bg overflow-hidden border hairline"
            aria-hidden
          >
            <span
              className="absolute inset-x-0 bottom-0 rounded-full bar-grow-y"
              style={{
                height: `${Math.max(4, b.rainPct)}%`,
                background: "var(--hue-tech)",
                ["--bar-i" as string]: i,
              }}
            />
          </span>
          <span className="flex flex-col min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2">
              <span className="font-label text-[9px] text-ink-soft truncate">
                {compact ? b.label.replace(/^This /, "") : b.label}
              </span>
              <span style={{ color: "var(--section-hue, var(--accent))" }}>
                <WeatherIcon code={b.weatherCode} size={compact ? 18 : 22} night={b.night} />
              </span>
            </span>
            <span className="font-mono text-[10px] text-ink-faint">
              {b.from}–{b.to}
            </span>
            <span className={`font-display font-bold leading-none mt-2 ${compact ? "text-[1.4rem]" : "text-[1.9rem]"}`}>
              {b.rainPct}%
            </span>
            <span className="font-sans text-[11px] text-ink-soft mt-1">{rainWord(b.rainPct)}</span>
            <span className="font-mono text-[11px] text-ink-soft mt-1.5 tabular-nums">
              {b.tempMin === b.tempMax ? `${b.tempMax}°` : `${b.tempMin}–${b.tempMax}°`}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
