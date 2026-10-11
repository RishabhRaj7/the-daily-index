"use client";

import type { LiveStints } from "@/lib/f1-live-types";
import TyreIcon, { TYRE } from "./TyreIcon";

// A car's race in tyres, on a lap scale: each stint a line in its compound's
// colour (dashed for a used set), the tyre where it was fitted, how many laps
// it ran along it, and at the end of the current one a dot with the laps on
// the set now. The rest of the race is a faint track ahead. Used for the whole
// field (Analysis → Tyres) and for the followed driver (the card under the map).

type Stint = LiveStints["stints"][number];

/** The lap numbers along the top (0, 10, 20 …). */
export function LapAxis({ total }: { total: number }) {
  const step = total > 40 ? 10 : 5;
  const marks = Array.from({ length: Math.floor(total / step) + 1 }, (_, i) => i * step);
  return (
    <div className="relative h-4 font-mono text-[10.5px] text-ink-faint">
      {marks.map((m) => (
        <span key={m} className="absolute -translate-x-1/2" style={{ left: `${(m / total) * 100}%` }}>
          {m}
        </span>
      ))}
    </div>
  );
}

export function StintLine({ stints, total, running = true, delay = 0 }: { stints: Stint[]; total: number; running?: boolean; delay?: number }) {
  const scale = Math.max(1, total, stints.reduce((n, s) => n + s.laps, 0));
  const parts = stints.reduce<{ s: Stint; from: number; to: number }[]>((acc, s) => {
    const from = acc.at(-1)?.to ?? 0;
    return [...acc, { s, from, to: from + Math.max(s.laps, 0.5) }];
  }, []);
  const last = parts.at(-1);
  const pct = (l: number) => `${(l / scale) * 100}%`;
  return (
    <div className="relative h-6" role="img" aria-label={stints.map((s) => `${TYRE[s.compound].name}${s.fresh ? "" : " (used)"} ${s.laps} laps`).join(", then ")}>
      {/* the race ahead */}
      <span className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full bg-[var(--rule)]" />
      {parts.map(({ s, from, to }, i) => {
        const t = TYRE[s.compound];
        return (
          <span key={i} className="stint-in absolute top-1/2 -translate-y-1/2" style={{ left: pct(from), width: `calc(${pct(to - from)} - 2px)`, animationDelay: `${delay + i * 60}ms` }}>
            <span
              className="block h-[4px] rounded-full"
              style={s.fresh ? { background: t.colour } : { background: `repeating-linear-gradient(90deg, ${t.colour} 0 6px, transparent 6px 9px)` }}
            />
            {/* laps on the stint, along it */}
            {to - from >= scale * 0.07 && (
              <span className="absolute left-1/2 -translate-x-1/2 -top-[13px] font-mono text-[10px] tabular-nums" style={{ color: t.colour }}>
                {s.laps}
              </span>
            )}
          </span>
        );
      })}
      {/* where each set went on */}
      {parts.map(({ s, from }, i) => (
        <span key={`t${i}`} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full bg-[var(--card-bg)] leading-none" style={{ left: pct(from) }} title={`${TYRE[s.compound].name}${s.fresh ? ", new" : ", used"}`}>
          <TyreIcon compound={s.compound} fresh={s.fresh} size={15} />
        </span>
      ))}
      {/* now: laps on the current set */}
      {last && running && (
        <span
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 min-w-[18px] h-[18px] px-1 rounded-full grid place-items-center font-mono text-[10.5px] font-bold"
          style={{ left: pct(last.to), background: TYRE[last.s.compound].colour, color: "#111" }}
          title={`${last.s.laps} laps on this set`}
        >
          {last.s.laps}
        </span>
      )}
    </div>
  );
}
