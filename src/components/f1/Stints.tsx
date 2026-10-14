"use client";

import type { LiveStints } from "@/lib/f1-live-types";
import { TYRE } from "./TyreIcon";

// A car's race in tyres, on a lap scale: each stint a solid bar in its
// compound's colour with the compound and its laps inside ("M 12"; striped
// for a used set), a hairline gap where it stopped, the set it's on now
// ringed, and the rest of the race a faint rail ahead. Used for the whole
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

export function StintLine({ stints, total, running = true, delay = 0, size = "md" }: { stints: Stint[]; total: number; running?: boolean; delay?: number; size?: "sm" | "md" }) {
  const scale = Math.max(1, total, stints.reduce((n, s) => n + s.laps, 0));
  const parts = stints.reduce<{ s: Stint; from: number; to: number }[]>((acc, s) => {
    const from = acc.at(-1)?.to ?? 0;
    return [...acc, { s, from, to: from + Math.max(s.laps, 0.5) }];
  }, []);
  const pct = (l: number) => `${(l / scale) * 100}%`;
  const h = size === "sm" ? "h-[16px]" : "h-[18px]";
  return (
    <div className={`relative ${h}`} role="img" aria-label={stints.map((s) => `${TYRE[s.compound].name}${s.fresh ? "" : " (used)"} ${s.laps} laps`).join(", then ")}>
      {/* the race ahead: a faint rail */}
      <span className="absolute inset-0 rounded-[5px] bg-[var(--rule)] opacity-60" />
      {parts.map(({ s, from, to }, i) => {
        const t = TYRE[s.compound];
        const share = (to - from) / scale;
        const current = running && i === parts.length - 1;
        return (
          <span
            key={i}
            className="stint-in absolute inset-y-0 rounded-[5px] flex items-center justify-center overflow-hidden"
            style={{
              left: `calc(${pct(from)} + ${i ? 1 : 0}px)`,
              width: `calc(${pct(to - from)} - ${i ? 2 : 1}px)`,
              animationDelay: `${delay + i * 60}ms`,
              // A used set: the same colour, softly striped (two close shades, so its label still reads).
              background: s.fresh ? t.colour : `repeating-linear-gradient(135deg, ${t.colour} 0 5px, color-mix(in srgb, ${t.colour} 68%, var(--card-bg)) 5px 9px)`,
              color: t.ink,
              boxShadow: current ? `0 0 0 1.5px var(--card-bg), 0 0 0 2.5px color-mix(in srgb, ${t.colour} 55%, transparent)` : undefined,
            }}
            title={`${t.name}${s.fresh ? ", new" : ", used"} · ${s.laps} lap${s.laps === 1 ? "" : "s"}${current ? " so far" : ""}`}
          >
            {/* the compound and its laps, where there's room ("M 12", else "12") */}
            <span className="font-mono font-bold text-[10px] leading-none tabular-nums whitespace-nowrap px-1">
              <span className={share >= 0.1 ? "" : "hidden"}>{t.letter} </span>
              <span className={share >= 0.045 ? "" : "hidden"}>{s.laps}</span>
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** The compounds as swatches, and what a striped bar means. */
export function StintKey() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[10px] text-ink-soft">
      {(["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"] as const).map((c) => (
        <span key={c} className="flex items-center gap-1.5">
          <span className="w-4 h-2.5 rounded-[3px]" style={{ background: TYRE[c].colour }} />
          {TYRE[c].name}
        </span>
      ))}
      <span className="flex items-center gap-1.5 text-ink-faint">
        <span className="w-4 h-2.5 rounded-[3px]" style={{ background: `repeating-linear-gradient(135deg, var(--ink-soft) 0 3px, transparent 3px 5px)` }} />
        A used set · the gap between bars: a stop · ringed: on it now
      </span>
    </div>
  );
}
