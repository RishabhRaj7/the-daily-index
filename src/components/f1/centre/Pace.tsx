"use client";

import type { LiveRow, LiveSnapshot } from "@/lib/f1-live-types";

// The followed driver's pace, from the lap history (snap.lapTimes: kept from
// poll to poll live, rebuilt from the feed in a replay):
//
//   Stint pace — the average clean lap on the current set and how it is
//   moving (s a lap), beside the cars either side. Clean: not the out-lap,
//   not behind a safety car or VSC, not a lap 4 % off the stint's usual
//   (traffic, a mistake, the in-lap).
//   The last five laps against the car ahead — each lap's time and the
//   difference (a race).
//   Undercut risk — if the car behind stopped now: a fresh set is worth about
//   what the followed driver has lost since their own stop (fuel burn taken
//   out) plus a new tyre's edge; if that beats the gap in the lap before they
//   could answer, the risk is high (a race, the car within five seconds).

const FUEL = 0.03; // s a lap the car gains as fuel burns
const FRESH_EDGE = 0.4; // s a new set is worth on its first flying lap, beyond wear

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return m ? `${m}:${r.toFixed(3).padStart(6, "0")}` : r.toFixed(3);
};

interface Stint {
  /** Clean laps: [lap, seconds]. */
  laps: [number, number][];
  avg: number;
  /** Seconds a lap, + getting slower. */
  trend: number | null;
}

/** The current stint's clean laps, average and trend. */
function stintOf(snap: LiveSnapshot, r: LiveRow): Stint | null {
  const times = snap.lapTimes?.times[r.code];
  if (!times?.length || !r.laps) return null;
  const neutral = new Set(snap.lapTimes?.neutral ?? []);
  const stint = snap.stints?.find((s) => s.code === r.code)?.stints.at(-1);
  // The stint opened with an out-lap (or the race's first lap): the next one is the first that counts.
  const first = Math.max(2, r.laps - (stint?.laps ?? r.laps) + 2);
  const raw: [number, number][] = [];
  for (let lap = first; lap <= r.laps; lap++) {
    const t = times[lap - 1];
    if (t && !neutral.has(lap)) raw.push([lap, t]);
  }
  if (raw.length < 3) return null;
  const sorted = raw.map(([, t]) => t).sort((a, b) => a - b);
  const usual = sorted[Math.floor(sorted.length / 2)];
  const laps = raw.filter(([, t]) => t <= usual * 1.04);
  if (laps.length < 3) return null;
  const avg = laps.reduce((s, [, t]) => s + t, 0) / laps.length;
  let trend: number | null = null;
  if (laps.length >= 4) {
    const mx = laps.reduce((s, [l]) => s + l, 0) / laps.length;
    const num = laps.reduce((s, [l, t]) => s + (l - mx) * (t - avg), 0);
    const den = laps.reduce((s, [l]) => s + (l - mx) ** 2, 0);
    trend = den ? num / den : null;
  }
  return { laps, avg, trend };
}

function StintCell({ title, row, s }: { title: string; row: LiveRow | null; s: Stint | null }) {
  return (
    <div className="px-3 py-2 min-w-0">
      <div className="font-label text-[9px] text-ink-faint flex items-center gap-1.5 whitespace-nowrap">
        {title}
        {row && (
          <>
            <span className="w-[3px] h-2.5 rounded-full shrink-0" style={{ background: row.colour }} />
            <span className="text-ink-soft">{row.code}</span>
          </>
        )}
      </div>
      <div className="font-mono text-[13px] font-semibold tabular-nums mt-1 truncate">{s ? fmt(s.avg) : "—"}</div>
      {s && (
        <div
          className="font-mono text-[10px] tabular-nums mt-0.5 whitespace-nowrap"
          style={{ color: s.trend === null || Math.abs(s.trend) < 0.02 ? "var(--ink-soft)" : s.trend > 0 ? "var(--down)" : "var(--up)" }}
          title={`Average of ${s.laps.length} clean laps on this set${s.trend !== null ? `; ${s.trend > 0 ? "slower" : "quicker"} by ${Math.abs(s.trend).toFixed(2)} s a lap` : ""}`}
        >
          {s.trend === null ? `${s.laps.length} laps` : `${s.trend >= 0 ? "+" : "−"}${Math.abs(s.trend).toFixed(2)}/lap · ${s.laps.length}`}
        </div>
      )}
    </div>
  );
}

/** The followed driver's pace on this set, their last laps against the car ahead, and the undercut. */
export default function Pace({ snap, row }: { snap: LiveSnapshot; row: LiveRow }) {
  if (!snap.lapTimes || !snap.running || row.out) return null;
  const race = snap.type === "Race";
  const byPos = new Map(snap.rows.map((r) => [r.position, r]));
  const ahead = race ? (byPos.get(row.position - 1) ?? null) : null;
  const behindRow = race ? (byPos.get(row.position + 1) ?? null) : null;
  const behind = behindRow && !behindRow.out ? behindRow : null;
  const mine = stintOf(snap, row);
  if (!mine && !race) return null;

  // The last five laps against the car ahead.
  const times = snap.lapTimes.times;
  const neutral = new Set(snap.lapTimes.neutral);
  const last = ahead
    ? Array.from({ length: 5 }, (_, i) => row.laps - 4 + i)
        .filter((lap) => lap >= 1)
        .map((lap) => ({
          lap,
          me: times[row.code]?.[lap - 1] ?? null,
          them: times[ahead.code]?.[lap - 1] ?? null,
          sc: neutral.has(lap),
          // An in-lap or out-lap for either car: its time says nothing about pace.
          pit: (snap.pitStops ?? []).some((p) => (p.code === row.code || p.code === ahead.code) && (p.lap === lap || p.lap + 1 === lap)),
        }))
    : [];
  const showLast = last.some((l) => l.me !== null && l.them !== null);

  // The undercut, if the car behind stopped now.
  const gap = behind ? Number(/^\+?(\d+(?:\.\d+)?)$/.exec(behind.interval.trim())?.[1] ?? NaN) : NaN;
  let undercut: { level: "High" | "Medium" | "Low"; gain: number; gap: number } | null = null;
  if (mine && behind && Number.isFinite(gap) && gap <= 5 && !behind.inPit && !row.inPit && (row.tyre?.laps ?? 0) >= 5 && mine.laps.length >= 4) {
    const early = mine.laps.slice(0, 3).map(([, t]) => t);
    const late = mine.laps.slice(-3).map(([, t]) => t);
    const span = mine.laps.at(-1)![0] - mine.laps[0][0];
    const lost = late.reduce((a, b) => a + b, 0) / 3 - early.reduce((a, b) => a + b, 0) / 3 + FUEL * span;
    const gain = Math.max(0, lost) + FRESH_EDGE;
    undercut = { level: gain >= gap ? "High" : gain >= gap * 0.6 ? "Medium" : "Low", gain, gap };
  }

  return (
    <div className="rounded-xl border hairline">
      <div className={`grid ${race ? "grid-cols-3" : "grid-cols-1"} divide-x divide-[var(--rule)]`}>
        <StintCell title={race ? "Stint pace" : "Long-run pace"} row={race ? row : null} s={mine} />
        {race && <StintCell title="Ahead" row={ahead} s={ahead ? stintOf(snap, ahead) : null} />}
        {race && <StintCell title="Behind" row={behind} s={behind ? stintOf(snap, behind) : null} />}
      </div>
      {showLast && ahead && (
        <div className="border-t hairline px-3 py-2">
          <div className="font-label text-[9px] text-ink-faint">Last laps against {ahead.code}</div>
          <div className="grid grid-cols-5 gap-1.5 mt-1">
            {last.map((l) => {
              const d = l.me !== null && l.them !== null && !l.pit ? l.me - l.them : null;
              return (
                <div key={l.lap} className="min-w-0 text-center" title={l.me !== null && l.them !== null ? `Lap ${l.lap}: ${row.code} ${fmt(l.me)}, ${ahead.code} ${fmt(l.them)}` : `Lap ${l.lap}`}>
                  <div className="font-mono text-[9px] text-ink-faint">L{l.lap}{l.sc ? " SC" : ""}</div>
                  <div className="font-mono text-[10.5px] tabular-nums truncate">{l.me !== null ? fmt(l.me).replace(/^1:/, "") : "—"}</div>
                  <div className="font-mono text-[10px] font-semibold tabular-nums" style={{ color: d === null || Math.abs(d) < 0.05 ? "var(--ink-soft)" : d < 0 ? "var(--up)" : "var(--down)" }}>
                    {l.pit ? "pit" : d === null ? "—" : `${d < 0 ? "−" : "+"}${Math.abs(d).toFixed(2)}`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {undercut && behind && (
        <div
          className="border-t hairline px-3 py-2 flex items-baseline justify-between gap-2 font-sans text-[12px]"
          title={`If ${behind.code} stopped now: a fresh set is worth about ${undercut.gain.toFixed(1)} s on the lap before ${row.code} could answer, against a ${undercut.gap.toFixed(1)} s gap`}
        >
          <span className="text-ink-soft">Undercut risk from {behind.code}</span>
          <span className="font-semibold" style={{ color: undercut.level === "High" ? "var(--down)" : undercut.level === "Medium" ? "var(--f1-investigation)" : "var(--up)" }}>
            {undercut.level}
          </span>
        </div>
      )}
    </div>
  );
}
