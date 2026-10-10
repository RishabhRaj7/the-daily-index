import type { LiveRow, LiveSnapshot, SegmentMark, TrackModel } from "./f1-live-types";

// Where each car is on the map, estimated from live timing. F1 keeps exact
// car positions behind an F1 TV login, but its timing loops are open: every
// mini-sector a car completes lights up in the feed. So:
//   - a car's progress through its lap is the share of the lap's mini-sectors
//     it has completed, spread along the lap by a typical sector split;
//   - in a race, a car's place relative to the leader comes from its gap
//     (seconds behind ÷ lap time), which updates every few seconds and keeps
//     the field in the right order and spacing;
//   - the circuit model turns that share of a lap into a point on the track,
//     using the time a reference lap took to reach each point (so the slow
//     corners take their real share of the lap).
// Between reads the map carries each car on at lap pace, never past its next
// timing loop. It is an estimate — good to a corner or so — and says so.

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
    for (let i = 0; i < n; i++) {
      out.push({ sector: s, index: i, from: at + (share * i) / n, to: at + (share * (i + 1)) / n });
    }
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
  /** Share of the lap reached at the read (0–1, may run past 1 by a little). */
  progress: number;
  /** How far ahead the next timing loop lies, as a share of the lap. */
  room: number;
  /** Seconds per lap, for carrying the car on between reads. */
  pace: number;
  onTrack: boolean;
}

export function estimateCars(snap: LiveSnapshot, model: TrackModel): CarEstimate[] {
  const bounds = segmentBounds(snap);
  const total = bounds.length;
  const lapRef = snap.sectorRef ? snap.sectorRef[0] + snap.sectorRef[1] + snap.sectorRef[2] : (model.lapTime ?? 100);
  const byLoops = (r: LiveRow) => {
    const k = Math.min(completed(r), total);
    const at = k === 0 ? 0 : bounds[k - 1].to;
    const next = k < total ? bounds[k].to : 1;
    return { at, room: Math.max(0.005, next - at) };
  };
  const race = snap.type === "Race";
  const leader = snap.rows.find((r) => r.position === 1 && !r.out && !r.inPit);
  const lead = leader ? byLoops(leader) : null;
  return snap.rows.map((r) => {
    const pace = seconds(r.last) ?? lapRef;
    const onTrack = !r.out && !r.inPit && !(r.knockedOut && !race);
    let { at, room } = byLoops(r);
    if (race && lead && r !== leader) {
      const gap = seconds(r.gap);
      // Behind the leader by `gap` seconds on the same lap: place by time.
      if (gap !== null && gap < lapRef) {
        at = (((lead.at - gap / lapRef) % 1) + 1) % 1;
        room = lead.room;
      }
    }
    return { code: r.code, colour: r.colour, progress: at, room, pace: Math.max(30, pace), onTrack };
  });
}

/** The marks of one driver's mini-sectors this lap, in order. */
export function segmentMarks(row: LiveRow | undefined): SegmentMark[] {
  return row ? row.sectors.flatMap((s) => s.segments) : [];
}
