import type { LiveRow, LiveSnapshot, SegmentMark, TrackModel } from "./f1-live-types";

// Where each car is on the map, estimated from live timing. F1 keeps exact
// car positions behind an F1 TV login, but its timing loops are open: every
// mini-sector a car completes lights up in the feed. So:
//   - a car's progress through its lap is the mini-sectors it has completed,
//     spread along the lap by a typical sector split — placed halfway into
//     the one it's in now (between two reads, that's where it is on average);
//   - progress is counted in laps (laps done + share of this one), so the
//     line never confuses who is where;
//   - in a race, a car's place against the leader comes from its gap (seconds
//     behind ÷ lap time), which keeps the field in order and properly spaced;
//   - the circuit model turns a share of a lap into a point on the track,
//     using the time a reference lap took to reach each point.
// The map (components/f1/TrackMap.tsx) then drives each car forward at its
// lap pace and steers it towards each new estimate by easing its speed —
// never backwards, never a jump. An estimate, good to a corner or so, and
// labelled as one.

/** The point on the track a car has reached, `f` of the way through a lap. */
export function pointAt(model: TrackModel, f: number): [number, number] {
  const x = ((f % 1) + 1) % 1;
  const fr = model.fraction;
  let lo = 0;
  let hi = fr.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (fr[mid] <= x) lo = mid;
    else hi = mid;
  }
  const span = fr[hi] - fr[lo] || 1;
  const k = Math.min(1, Math.max(0, (x - fr[lo]) / span));
  const a = model.points[lo];
  const b = model.points[hi];
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
}

/** The track's direction of travel at `f` (radians). */
export function headingAt(model: TrackModel, f: number): number {
  const [x1, y1] = pointAt(model, f - 0.004);
  const [x2, y2] = pointAt(model, f + 0.004);
  return Math.atan2(y2 - y1, x2 - x1);
}

/** The three sectors' ends as shares of the lap. */
export function sectorEnds(ref: [number, number, number] | null | undefined): [number, number] | null {
  if (!ref) return null;
  const lap = ref[0] + ref[1] + ref[2];
  return lap > 0 ? [ref[0] / lap, (ref[0] + ref[1]) / lap] : null;
}

/** Each mini-sector's start and end as a share of the lap. */
export function segmentBounds(snap: Pick<LiveSnapshot, "sectorRef" | "rows">): { sector: number; index: number; from: number; to: number }[] {
  const counts = [0, 1, 2].map((i) => Math.max(0, ...snap.rows.map((r) => r.sectors[i]?.segments.length ?? 0)));
  const ref = snap.sectorRef ?? [1, 1, 1];
  const lap = ref[0] + ref[1] + ref[2] || 1;
  const out: { sector: number; index: number; from: number; to: number }[] = [];
  let at = 0;
  for (let s = 0; s < 3; s++) {
    const share = ref[s] / lap;
    const n = counts[s] || 1;
    for (let i = 0; i < n; i++) out.push({ sector: s, index: i, from: at + (share * i) / n, to: at + (share * (i + 1)) / n });
    at += share;
  }
  return out;
}

/** How many of the lap's mini-sectors a car has completed (in order from the line). */
function completed(row: LiveRow): number {
  let k = 0;
  for (const s of row.sectors) {
    for (const g of s.segments) {
      if (g === "none") return k;
      k++;
    }
  }
  return k;
}

const seconds = (t: string) => {
  const m = /^\+?(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(t.trim());
  return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : null;
};

export interface CarEstimate {
  code: string;
  colour: string;
  /** Laps travelled at the read: laps done + share of the current one. */
  distance: number;
  /** Seconds per lap, for driving the car on between reads. */
  pace: number;
  onTrack: boolean;
}

export function estimateCars(snap: LiveSnapshot): CarEstimate[] {
  const bounds = segmentBounds(snap);
  const total = bounds.length;
  const lapRef = snap.sectorRef ? snap.sectorRef[0] + snap.sectorRef[1] + snap.sectorRef[2] : 100;

  const byLoops = (r: LiveRow) => {
    const k = Math.min(completed(r), total);
    // Every loop lit means the car has just crossed the line: the feed
    // clears the previous lap's lights a few seconds after the line.
    if (k >= total) return r.laps + 0.015;
    const from = k === 0 ? 0 : bounds[k - 1].to;
    const to = bounds[k].to;
    return r.laps + from + (to - from) / 2;
  };

  const race = snap.type === "Race";
  const leader = snap.rows.find((r) => r.position === 1 && !r.out && !r.inPit);
  const lead = leader ? byLoops(leader) : null;

  return snap.rows.map((r) => {
    const pace = Math.max(60, Math.min(240, seconds(r.last) ?? lapRef));
    const onTrack = !r.out && !r.inPit && !(r.knockedOut && !race);
    let distance = byLoops(r);
    if (race && lead !== null && r !== leader) {
      // Behind the leader by `gap` seconds: place by time, which updates
      // smoothly and keeps the order honest.
      const gap = seconds(r.gap);
      if (gap !== null && gap < lapRef * 0.97) distance = lead - gap / lapRef;
    }
    return { code: r.code, colour: r.colour, distance, pace, onTrack };
  });
}

/** The marks of one driver's mini-sectors this lap, in order. */
export function segmentMarks(row: LiveRow | undefined): SegmentMark[] {
  return row ? row.sectors.flatMap((s) => s.segments) : [];
}
