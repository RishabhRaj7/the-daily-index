import type { TrackModel } from "./f1-live-types";

// Clipping: the 2026 cars run half their power from the battery, and on a long
// straight it can run dry before the braking point — the car, still flat out,
// starts losing speed ("clipping", "super-clipping"). In a lap's car data
// that shows as a stretch at full throttle, no brake, where the speed peaks
// and then falls by several km/h before the driver lifts or brakes. Read
// from a lap trace (about four readings a second): replays, past sessions
// and the telemetry detail. The live feed's one reading every five seconds
// is too sparse to see it.

/** A trace sample: [seconds into the lap, km/h, throttle %, brake 0/1, gear, rpm, …]. */
type Sample = number[];

export interface Clip {
  /** Seconds into the lap: where the speed peaked, and where it stopped falling. */
  at: number;
  until: number;
  peak: number;
  /** km/h lost at full throttle. */
  drop: number;
}

const FULL = 98; // throttle %
const MIN_RUN = 3; // seconds flat out, to count as a straight
const MIN_DROP = 8; // km/h
const MIN_FADE = 1; // seconds the speed keeps falling

export function detectClipping(samples: Sample[]): Clip[] {
  const out: Clip[] = [];
  let i = 0;
  while (i < samples.length) {
    if (!(samples[i][2] >= FULL && !samples[i][3])) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < samples.length && samples[j + 1][2] >= FULL && !samples[j + 1][3]) j++;
    if (samples[j][0] - samples[i][0] >= MIN_RUN) {
      let peak = i;
      for (let k = i; k <= j; k++) if (samples[k][1] > samples[peak][1]) peak = k;
      let low = peak;
      for (let k = peak; k <= j; k++) if (samples[k][1] < samples[low][1]) low = k;
      const drop = samples[peak][1] - samples[low][1];
      if (drop >= MIN_DROP && samples[low][0] - samples[peak][0] >= MIN_FADE) out.push({ at: samples[peak][0], until: samples[low][0], peak: samples[peak][1], drop: Math.round(drop) });
    }
    i = j + 1;
  }
  return out;
}

/** The corner a clip runs into ("T1"): the first corner past where it ended, by share of the lap. */
export function cornerAfter(model: TrackModel | null, f: number): number | null {
  if (!model?.corners.length) return null;
  const at = model.corners.map((c) => {
    let best = 0;
    let d = Infinity;
    model.points.forEach(([x, y], i) => {
      const e = (x - c.x) ** 2 + (y - c.y) ** 2;
      if (e < d) {
        d = e;
        best = i;
      }
    });
    return { n: c.number, f: model.fraction[best] ?? 0 };
  });
  const next = at.filter((c) => c.f > f).sort((a, b) => a.f - b.f)[0] ?? at.sort((a, b) => a.f - b.f)[0];
  return next?.n ?? null;
}

const KEY = "f1-clipping";
/** Clipping marks are on unless switched off on this device. */
export const clippingOn = () => {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
};
export const setClipping = (on: boolean) => {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {}
  window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
};
