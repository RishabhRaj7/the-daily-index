"use client";

import { useEffect } from "react";
import type { LiveRow, LiveSnapshot } from "@/lib/f1-live-types";

// The followed driver's fight, in a race: the car ahead and the car behind,
// the gap to each, and how fast it is shrinking or growing.
//
// The rate comes from the gaps themselves: each car's gap to the car ahead is
// noted as it completes a lap (useGapHistory, kept for the whole session
// whichever view is open), and the change over the last three laps against
// the same car, per lap, is the closing rate. Before there are two laps of it
// (a page just opened), the last lap times stand in. From a rate and a gap
// comes when the chaser is within a second (Overtake Mode range).

interface Mark {
  lap: number;
  ahead: string;
  /** Seconds to the car ahead; null when a lap or more behind. */
  gap: number | null;
}

/** Per session, per car: its gap to the car ahead at each lap it completed. */
const store = new Map<string, Map<string, Mark[]>>();
const keyOf = (s: LiveSnapshot) => s.path ?? `${s.meeting}|${s.session}`;

const secs = (interval: string): number | null => {
  const m = /^\+?(\d+(?:\.\d+)?)$/.exec(interval.trim());
  return m ? Number(m[1]) : null;
};

const lapSecs = (t: string): number | null => {
  const m = /^(?:(\d+):)?(\d+\.\d+)$/.exec(t.trim());
  return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : null;
};

/** Notes every car's gap to the car ahead as each lap completes. Call once, above the views. */
export function useGapHistory(snap: LiveSnapshot | null) {
  useEffect(() => {
    if (!snap || snap.type !== "Race") return;
    let cars = store.get(keyOf(snap));
    if (!cars) {
      cars = new Map();
      store.set(keyOf(snap), cars);
    }
    const byPos = new Map(snap.rows.map((r) => [r.position, r]));
    for (const r of snap.rows) {
      if (r.out || r.inPit || r.position === 1) continue;
      const ahead = byPos.get(r.position - 1);
      if (!ahead) continue;
      let marks = cars.get(r.code) ?? [];
      // A replay sent back in time: forget what lies ahead of it.
      if (marks.length && marks[marks.length - 1].lap > r.laps) marks = marks.filter((m) => m.lap <= r.laps);
      if (!marks.length || marks[marks.length - 1].lap < r.laps) marks.push({ lap: r.laps, ahead: ahead.code, gap: secs(r.interval) });
      cars.set(r.code, marks.slice(-12));
    }
  }, [snap]);
}

/** How fast `code` is closing on `ahead` (s a lap, + closing), over up to three laps; else from the last laps. */
function closing(snap: LiveSnapshot, me: LiveRow, ahead: LiveRow): { rate: number; over: number } | null {
  const marks = (store.get(keyOf(snap))?.get(me.code) ?? []).filter((m) => m.ahead === ahead.code && m.gap !== null);
  const last = marks[marks.length - 1];
  const base = last && marks.find((m) => m.lap < last.lap && last.lap - m.lap <= 3);
  if (last && base) return { rate: (base.gap! - last.gap!) / (last.lap - base.lap), over: last.lap - base.lap };
  // Not two laps yet: the last laps, if neither car was in the pits.
  const a = lapSecs(ahead.last);
  const b = lapSecs(me.last);
  if (a === null || b === null || me.pitOut || ahead.pitOut || me.inPit || ahead.inPit) return null;
  return { rate: a - b, over: 0 };
}

function Side({ title, other, gap, lapped = "", rate, chaser, idle = false, race = true }: { title: string; other: LiveRow | null; gap: number | null; /** The interval as timed ("1L" when a lap down; empty before there is one). */ lapped?: string; rate: { rate: number; over: number } | null; chaser: "me" | "them"; /** Nothing running: the box stays, with dashes. */ idle?: boolean; /** Overtake Mode is a race's. */ race?: boolean }) {
  if (!other) {
    return (
      <div className="px-3 py-2 min-w-0 overflow-hidden">
        <div className="font-label text-[9px] text-ink-faint whitespace-nowrap">{title}</div>
        <div className="font-mono text-[15px] font-semibold text-ink-faint mt-1 truncate">{idle ? "—" : chaser === "me" ? "Leading" : "No one behind"}</div>
      </div>
    );
  }
  const r = rate?.rate ?? null;
  const steady = r !== null && Math.abs(r) < 0.05;
  // Good for the followed driver: closing on the car ahead, or the car behind dropping back.
  const good = r !== null && !steady && (chaser === "me" ? r > 0 : r < 0);
  const tone = r === null || steady ? "var(--ink-soft)" : good ? "var(--up)" : "var(--down)";
  const verb = r === null ? null : steady ? "Holding" : chaser === "me" ? (r > 0 ? "Closing" : "Losing") : r > 0 ? "Gaining" : "Dropping";
  // Within a second at the detection point earns Overtake Mode (2026: DRS's successor, extra electrical deployment).
  const toRange = gap !== null && r !== null && r > 0.05 && gap > 1 ? Math.ceil((gap - 1) / r) : null;
  const drs = gap === null || !race ? null : gap <= 1 ? "In Overtake range" : toRange !== null && toRange <= 30 ? `Overtake range in ~${toRange} lap${toRange === 1 ? "" : "s"}` : null;
  return (
    <div className="px-3 py-2 min-w-0 overflow-hidden">
      <div className="font-label text-[9px] text-ink-faint flex items-center gap-1.5 whitespace-nowrap">
        {title}
        <span className="w-[3px] h-2.5 rounded-full shrink-0" style={{ background: other.colour }} />
        <span className="text-ink-soft">{other.code}</span>
      </div>
      <div className="font-mono text-[15px] font-semibold tabular-nums mt-1 whitespace-nowrap">{gap !== null ? `${gap.toFixed(3)} s` : /L/i.test(lapped) ? "A lap or more" : "—"}</div>
      {verb && (
        <div
          className="font-mono text-[10px] tabular-nums mt-0.5 whitespace-nowrap"
          style={{ color: tone }}
          title={`${chaser === "me" ? `${verb} on ${other.code}` : `${other.code} ${verb.toLowerCase()}`}${steady ? "" : ` ${Math.abs(r!).toFixed(2)} s a lap`} · ${rate?.over ? `over the last ${rate.over} lap${rate.over === 1 ? "" : "s"}` : "from the last lap times"}`}
        >
          {steady ? verb : `${verb} ${Math.abs(r!).toFixed(2)}/lap`}
        </div>
      )}
      {drs && <div className="font-mono text-[10px] text-ink-faint mt-0.5 truncate" title="Within a second at the detection point earns Overtake Mode">{drs}</div>}
    </div>
  );
}

/** The followed driver against the cars either side (while a session runs; dashes otherwise, the box stays). */
export default function Battle({ snap, row, className = "" }: { snap: LiveSnapshot; row: LiveRow; className?: string }) {
  if (!snap.running || row.out) {
    return (
      <div className={`rounded-xl border hairline grid grid-cols-2 divide-x divide-[var(--rule)] ${className}`}>
        <Side title="Car ahead" other={null} gap={null} rate={null} chaser="me" idle />
        <Side title="Car behind" other={null} gap={null} rate={null} chaser="them" idle />
      </div>
    );
  }
  const race = snap.type === "Race";
  const byPos = new Map(snap.rows.map((r) => [r.position, r]));
  const ahead = byPos.get(row.position - 1) ?? null;
  const behind = byPos.get(row.position + 1) ?? null;
  const behindLive = behind && !behind.out ? behind : null;
  return (
    <div className={`rounded-xl border hairline grid grid-cols-2 divide-x divide-[var(--rule)] ${className}`}>
      <Side title="Car ahead" other={ahead} gap={ahead ? secs(row.interval) : null} lapped={row.interval} rate={ahead && race ? closing(snap, row, ahead) : null} chaser="me" race={race} />
      <Side title="Car behind" other={behindLive} gap={behindLive ? secs(behindLive.interval) : null} lapped={behindLive?.interval} rate={behindLive && race ? closing(snap, behindLive, row) : null} chaser="them" race={race} />
    </div>
  );
}
