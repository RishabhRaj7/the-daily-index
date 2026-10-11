import { getStore } from "@/lib/server/store";
import type { TrackGeo, TrackModel } from "@/lib/f1-live-types";

// Where a circuit is on Earth, so the map can be shown in 3D, among the city around it.
//
// F1's coordinates are the circuit's own (a local grid, in tenths of a
// metre), with no latitude or longitude. bacinger/f1-circuits (MIT) has every
// circuit's racing line as GPS coordinates, and its length; our outline is
// fitted onto that line — scale, turn and shift (iterative closest point from
// a few dozen starting turns, the scale started from the official length) —
// and the fit is kept with the circuit. Monaco, Monza, Zandvoort and Baku all
// land within 2–3 m on average. A fit that's off by more than 15 m, or whose
// scale disagrees with the official length by over 10 %, isn't used.

const SOURCE = "https://raw.githubusercontent.com/bacinger/f1-circuits/master/f1-circuits.geojson";
const KEEP_DAYS = 120;
const M = 111_320; // metres per degree of latitude

type Feature = { properties: { id: string; Location: string; Name: string; length: number }; geometry: { coordinates: [number, number][] } };

const norm = (s: string | undefined) => (s ?? "").toLowerCase().normalize("NFD").replace(/[^a-z]/g, "");
// MultiViewer's names where the dataset's differ.
const ALIAS: Record<string, string> = {
  interlagos: "br-1940",
  saopaulo: "br-1940",
  marinabay: "sg-2008",
  montecarlo: "mc-1929",
  catalunya: "es-1991",
  barcelona: "es-1991",
  spafrancorchamps: "be-1925",
  yasmarina: "ae-2009",
  yasisland: "ae-2009",
  lusail: "qa-2004",
  losail: "qa-2004",
  mexicocity: "mx-1962",
  austin: "us-2012",
  lasvegas: "us-2023",
  madring: "es-2026",
  madrid: "es-2026",
};

type Pt = [number, number];
interface Fit {
  m: 1 | -1;
  s: number;
  a: number;
  tx: number;
  ty: number;
}

const apply = (T: Fit, [x, y]: Pt): Pt => {
  const yy = T.m * y;
  return [T.s * (Math.cos(T.a) * x - Math.sin(T.a) * yy) + T.tx, T.s * (Math.sin(T.a) * x + Math.cos(T.a) * yy) + T.ty];
};
const every = <T,>(arr: T[], n: number) => arr.filter((_, i) => i % Math.max(1, Math.floor(arr.length / n)) === 0);

function nearest(Q: Pt[], p: Pt): [number, number] {
  let best = Infinity;
  let at = 0;
  for (let i = 0; i < Q.length; i++) {
    const d = (Q[i][0] - p[0]) ** 2 + (Q[i][1] - p[1]) ** 2;
    if (d < best) {
      best = d;
      at = i;
    }
  }
  return [at, Math.sqrt(best)];
}

/** Iterative closest point with a similarity (scale, turn, shift); the worst tenth of pairs ignored. */
function icp(start: Fit, P: Pt[], Q: Pt[], rounds: number): { T: Fit; err: number } {
  let T = start;
  let err = Infinity;
  for (let r = 0; r < rounds; r++) {
    const pairs = P.map((p) => {
      const [i, d] = nearest(Q, apply(T, p));
      return { p: [p[0], T.m * p[1]] as Pt, q: Q[i], d };
    }).sort((a, b) => a.d - b.d);
    const keep = pairs.slice(0, Math.floor(pairs.length * 0.9));
    const n = keep.length;
    err = keep.reduce((sum, x) => sum + x.d, 0) / n;
    const mp: Pt = [0, 0];
    const mq: Pt = [0, 0];
    for (const k of keep) {
      mp[0] += k.p[0] / n;
      mp[1] += k.p[1] / n;
      mq[0] += k.q[0] / n;
      mq[1] += k.q[1] / n;
    }
    let sxx = 0;
    let sxy = 0;
    let vp = 0;
    for (const k of keep) {
      const px = k.p[0] - mp[0];
      const py = k.p[1] - mp[1];
      const qx = k.q[0] - mq[0];
      const qy = k.q[1] - mq[1];
      sxx += px * qx + py * qy;
      sxy += px * qy - py * qx;
      vp += px * px + py * py;
    }
    const a = Math.atan2(sxy, sxx);
    const s = Math.hypot(sxx, sxy) / vp;
    T = { m: T.m, a, s, tx: mq[0] - s * (Math.cos(a) * mp[0] - Math.sin(a) * mp[1]), ty: mq[1] - s * (Math.sin(a) * mp[0] + Math.cos(a) * mp[1]) };
  }
  return { T, err };
}

async function features(): Promise<Feature[]> {
  try {
    const res = await fetch(SOURCE, { next: { revalidate: 30 * 86_400 }, signal: AbortSignal.timeout(15_000) });
    return res.ok ? (((await res.json()) as { features: Feature[] }).features ?? []) : [];
  } catch {
    return [];
  }
}

/** Fit a model onto its circuit's GPS line. */
export function fitGeo(model: TrackModel, f: Feature): TrackGeo | null {
  const line = f.geometry.coordinates;
  if (line.length < 10 || model.points.length < 20) return null;
  const lon0 = line.reduce((n, p) => n + p[0], 0) / line.length;
  const lat0 = line.reduce((n, p) => n + p[1], 0) / line.length;
  const kx = Math.cos((lat0 * Math.PI) / 180) * M;
  // The racing line in metres east and north of its middle, a point every 5 m.
  const g = line.map(([lon, lat]) => [(lon - lon0) * kx, (lat - lat0) * M] as Pt);
  const Q: Pt[] = [];
  for (let i = 1; i < g.length; i++) {
    const [a, b] = [g[i - 1], g[i]];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 5));
    for (let k = 0; k < n; k++) Q.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  const P = model.points as Pt[];
  let length = 0;
  for (let i = 1; i < P.length; i++) length += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
  const s0 = f.properties.length / length;
  const cP = P.reduce<Pt>((n, p) => [n[0] + p[0] / P.length, n[1] + p[1] / P.length], [0, 0]);
  const cQ = Q.reduce<Pt>((n, p) => [n[0] + p[0] / Q.length, n[1] + p[1] / Q.length], [0, 0]);

  // Coarse: a few points, every tenth of a turn, both ways round; then fine.
  const Ps = every(P, 40);
  const Qs = every(Q, 400);
  let best: { T: Fit; err: number } | null = null;
  for (const m of [-1, 1] as const)
    for (let deg = 0; deg < 360; deg += 10) {
      const T: Fit = { m, a: (deg * Math.PI) / 180, s: s0, tx: 0, ty: 0 };
      const c = apply(T, cP);
      T.tx = cQ[0] - c[0];
      T.ty = cQ[1] - c[1];
      const r = icp(T, Ps, Qs, 10);
      if (!best || r.err < best.err) best = r;
    }
  if (!best) return null;
  const fin = icp(best.T, every(P, 200), Q, 12);
  if (fin.err > 15 || Math.abs(fin.T.s / s0 - 1) > 0.1) return null;
  return { id: f.properties.id, lat0, lon0, ...fin.T, err: Math.round(fin.err * 10) / 10 };
}

/** The circuit's place on Earth (fitted once, kept), or null when it can't be placed well. */
export async function geoFor(model: TrackModel): Promise<TrackGeo | null> {
  const store = getStore();
  const k = `f1:track:geo:v2:${model.circuitKey}:${model.year}`;
  const kept = await store.get<TrackGeo | "none">(k).catch(() => null);
  if (kept) return kept === "none" ? null : kept;
  const all = await features();
  if (!all.length) return null;
  const want = norm(model.name);
  const f =
    all.find((x) => x.properties.id === ALIAS[want]) ??
    all.find((x) => norm(x.properties.Location) === want || norm(x.properties.Name).includes(want) || (want.length > 3 && want.includes(norm(x.properties.Location))));
  const fit = f ? fitGeo(model, f) : null;
  await store.set(k, fit ?? "none", { ttlSeconds: fit ? KEEP_DAYS * 86_400 : 86_400 }).catch(() => {});
  return fit;
}
