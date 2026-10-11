// What covers a circuit, for the 3D city view: roads and railways that cross
// over it on bridges, and tunnels it runs through (Monaco's under the hotel).
//
// The map's data says which roads are bridges or tunnels (Mapbox Streets'
// `structure`), not how high they stand, so this works from the plan alone.
// A bridge that runs along the track for most of its length is the circuit's
// own (Singapore's Anderson Bridge) and covers nothing; any other bridge that
// comes within reach of the track passes over it. A tunnel that runs along
// the track is one the cars drive through — unless a road at ground level
// runs there too, when the tunnel is underneath (Singapore's expressways). The stretches of track beneath are
// marked, so the cars can pass under rather than over.

export type LngLat = [number, number];

export interface Structure {
  /** none: a road at ground level. */
  structure: "bridge" | "tunnel" | "none";
  /** Mapbox Streets' road class (motorway, primary, path, major_rail …). */
  cls: string;
  lines: LngLat[][];
}

export interface Cover {
  /** The bridges over the track, to be drawn above it, with their width (m). */
  over: { line: LngLat[]; w: number }[];
  /** For each of the track's points: open (0), under a bridge (1) or in a tunnel (2). */
  covered: Uint8Array;
}

const M = 111_320;
/** Along-track: this close to the line (m) counts as on it (a dual carriageway's far side included). */
const ON = 18;
/** A crossing flatter than this (the sine of its angle, ~20°) is a road merging, not passing over. */
const STEEP = 0.34;

/** A road's width (m), by class: the cover it throws. */
export function widthOf(cls: string): number {
  if (/motorway|trunk/.test(cls)) return 22;
  if (/primary|secondary/.test(cls)) return 16;
  if (/rail/.test(cls)) return 10;
  if (/path|pedestrian|steps|track/.test(cls)) return 5;
  return 12;
}

type P = [number, number];

function segDist(p: P, a: P, b: P): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

function densify(pts: P[], step: number): P[] {
  const out: P[] = [];
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  if (pts.length) out.push(pts[pts.length - 1]);
  return out;
}

/** Where two segments cross, and the sine of the angle between them. */
function cross(a: P, b: P, c: P, d: P): { at: P; sin: number } | null {
  const r: P = [b[0] - a[0], b[1] - a[1]];
  const q: P = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * q[1] - r[1] * q[0];
  if (!den) return null;
  const t = ((c[0] - a[0]) * q[1] - (c[1] - a[1]) * q[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { at: [a[0] + t * r[0], a[1] + t * r[1]], sin: Math.abs(den) / (Math.hypot(...r) * Math.hypot(...q)) };
}

/** The track (its points, in order, as [lng, lat]) and the structures near it. */
export function findCover(track: LngLat[], structures: Structure[]): Cover {
  const covered = new Uint8Array(track.length);
  const over: Cover["over"] = [];
  if (track.length < 2) return { over, covered };
  const lat0 = track[0][1];
  const lon0 = track[0][0];
  const kx = Math.cos((lat0 * Math.PI) / 180) * M;
  const m = ([lon, lat]: LngLat): P => [(lon - lon0) * kx, (lat - lat0) * M];
  const T = track.map(m);
  const closed = T.concat([T[0]]);
  // The track's extent, to skip what's nowhere near it.
  const xs = T.map((p) => p[0]);
  const ys = T.map((p) => p[1]);
  const box = [Math.min(...xs) - 60, Math.min(...ys) - 60, Math.max(...xs) + 60, Math.max(...ys) + 60];
  const toTrack = (p: P) => {
    let d = Infinity;
    for (let i = 1; i < closed.length; i++) d = Math.min(d, segDist(p, closed[i - 1], closed[i]));
    return d;
  };

  // Roads at ground level, as segments.
  const ground: [P, P][] = [];
  for (const s of structures)
    if (s.structure === "none")
      for (const raw of s.lines) {
        const line = raw.map(m);
        if (line.every(([x, y]) => x < box[0] || x > box[2] || y < box[1] || y > box[3])) continue;
        for (let k = 1; k < line.length; k++) ground.push([line[k - 1], line[k]]);
      }
  /** A ground road runs here the way the track does (not just a side street meeting it). */
  const onGround = (i: number) => {
    const p = T[i];
    const a = T[(i - 1 + T.length) % T.length];
    const b = T[(i + 1) % T.length];
    const tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return ground.some(([u, v]) => {
      if (segDist(p, u, v) > 10) return false;
      const gl = Math.hypot(v[0] - u[0], v[1] - u[1]) || 1;
      return Math.abs(((b[0] - a[0]) * (v[0] - u[0]) + (b[1] - a[1]) * (v[1] - u[1])) / (tl * gl)) > 0.9;
    });
  };

  for (const s of structures) {
    if (s.structure === "none") continue;
    const w = widthOf(s.cls);
    for (const raw of s.lines) {
      const line = raw.map(m);
      if (line.every(([x, y]) => x < box[0] || x > box[2] || y < box[1] || y > box[3])) continue;
      const pts = densify(line, 4);
      const d = pts.map(toTrack);
      const along = d.filter((x) => x < ON).length / pts.length;
      if (s.structure === "bridge") {
        // The circuit's own bridge covers nothing; another covers the track
        // only where it crosses it: for its width across the track, longer the
        // flatter the crossing.
        if (along > 0.5) continue;
        let crosses = false;
        for (let k = 1; k < line.length; k++)
          for (let i = 1; i < closed.length; i++) {
            const x = cross(line[k - 1], line[k], closed[i - 1], closed[i]);
            if (!x || x.sin < STEEP) continue;
            crosses = true;
            const span = w / x.sin / 2 + 3;
            T.forEach((p, j) => {
              if (Math.hypot(p[0] - x.at[0], p[1] - x.at[1]) < span) covered[j] = 1;
            });
          }
        if (crosses) over.push({ line: raw, w });
      } else if (along > 0.5) {
        // A tunnel the track runs through.
        T.forEach((p, i) => {
          if (covered[i] || !pts.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 10)) return;
          if (!onGround(i)) covered[i] = 2;
        });
      }
    }
  }
  // One tunnel, not several: a short open stretch between two tunnel
  // stretches (a road beside the tunnel in the data) is tunnel too.
  const len = (from: number, to: number) => {
    let d = 0;
    for (let k = from + 1; k <= to; k++) d += Math.hypot(T[k][0] - T[k - 1][0], T[k][1] - T[k - 1][1]);
    return d;
  };
  let last = -1;
  for (let i = 0; i < T.length; i++) {
    if (covered[i] !== 2) continue;
    if (last >= 0 && i - last > 1 && len(last, i) < 100 && covered.subarray(last + 1, i).every((v) => v !== 1)) covered.fill(2, last + 1, i);
    last = i;
  }

  // A tunnel is a long stretch: a few metres flagged where the ground roads
  // have a gap in the data is not one.
  let from = -1;
  for (let i = 0; i <= T.length; i++) {
    if (covered[i] === 2) {
      if (from < 0) from = i;
      continue;
    }
    if (from >= 0) {
      if (len(from, i - 1) < 50) covered.fill(0, from, i);
      from = -1;
    }
  }
  return { over, covered };
}
