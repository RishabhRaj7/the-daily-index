import { inflateRawSync } from "node:zlib";
import { getStore } from "@/lib/server/store";
import type { TrackModel } from "@/lib/f1-live-types";

// Circuit maps as vectors, from MultiViewer's public circuit API (the source
// the open-source F1 timing apps use): the track outline in F1's own
// coordinate system, the rotation it is shown at, every corner, and the time
// a reference lap reached each point — which is what lets a car's progress
// through the lap (from the timing loops) be placed on the map.
//
// A circuit MultiViewer doesn't have (a returning venue like Sepang, a new
// one) is drawn from F1's own archive instead: the fastest driver's best lap
// at the latest session held there, traced from the car's recorded positions
// between the moments that lap began and ended (which also gives each point's
// time through the lap). No corner numbers that way, but the shape and the
// timing are exact.
//
// Fetched once per circuit and season, then kept in the store for two months.

const API = "https://api.multiviewer.app/api/v1/circuits";
const KEEP_DAYS = 60;
const POINTS = 320;
const SIZE = 1000; // the model's coordinate box (viewBox), before padding
const PAD = 60;

interface Raw {
  x: number[];
  y: number[];
  rotation: number;
  trackPositionTime?: number[];
  candidateLap?: { lapTime?: number };
  corners?: { number: number; angle: number; trackPosition: { x: number; y: number } }[];
  circuitName?: string;
  location?: string;
  pitLoss?: { normal?: string };
}

const memo = new Map<string, { at: number; model: TrackModel | null }>();

function rotate(x: number, y: number, deg: number, cx: number, cy: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  const dx = x - cx;
  const dy = y - cy;
  return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)];
}

export function buildModel(raw: Raw, circuitKey: number, year: number): TrackModel | null {
  const n = Math.min(raw.x?.length ?? 0, raw.y?.length ?? 0);
  if (n < 20) return null;
  const cx = (Math.min(...raw.x) + Math.max(...raw.x)) / 2;
  const cy = (Math.min(...raw.y) + Math.max(...raw.y)) / 2;
  // MultiViewer's rotation is given for a display turned a quarter (the
  // convention the open-source timing apps follow), drawn straight onto the
  // screen's y-down axes.
  const turn = (x: number, y: number) => rotate(x, y, (raw.rotation ?? 0) + 90, cx, cy);
  const pts = Array.from({ length: n }, (_, i) => turn(raw.x[i], raw.y[i]));
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY) || 1;
  const k = (SIZE - PAD * 2) / span;
  const w = (Math.max(...xs) - minX) * k + PAD * 2;
  const h = (Math.max(...ys) - minY) * k + PAD * 2;
  const fit = ([x, y]: [number, number]): [number, number] => [Math.round(((x - minX) * k + PAD) * 10) / 10, Math.round(((y - minY) * k + PAD) * 10) / 10];

  // Lap fraction at each point, from the reference lap's clock; without it,
  // by distance along the line.
  const times = raw.trackPositionTime?.length === n ? raw.trackPositionTime : null;
  const total = times ? times[n - 1] || 1 : 0;
  const dist: number[] = [0];
  for (let i = 1; i < n; i++) dist.push(dist[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const length = dist[n - 1] || 1;

  const step = Math.max(1, Math.floor(n / POINTS));
  const keep: number[] = [];
  for (let i = 0; i < n; i += step) keep.push(i);
  if (keep.at(-1) !== n - 1) keep.push(n - 1);

  const points = keep.map((i) => fit(pts[i]));
  const fraction = keep.map((i) => Math.round((times ? times[i] / total : dist[i] / length) * 10000) / 10000);
  const path = `M${points.map(([x, y]) => `${x},${y}`).join("L")}Z`;

  const corners = (raw.corners ?? []).map((c) => {
    const [x, y] = fit(turn(c.trackPosition.x, c.trackPosition.y));
    return { number: c.number, x, y };
  });

  return {
    circuitKey,
    year,
    name: raw.circuitName ?? raw.location ?? "",
    width: Math.round(w),
    height: Math.round(h),
    path,
    points,
    fraction,
    corners,
    lapTime: raw.candidateLap?.lapTime ?? (times ? total : null),
    pitLoss: raw.pitLoss?.normal ? Number(raw.pitLoss.normal) : null,
  };
}

async function fetchRaw(circuitKey: number, year: number): Promise<Raw | null> {
  try {
    const res = await fetch(`${API}/${circuitKey}/${year}`, {
      headers: { "User-Agent": "the-daily-index (personal newspaper)" },
      next: { revalidate: 7 * 86_400 },
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? ((await res.json()) as Raw) : null;
  } catch {
    return null;
  }
}

// ---- from F1's archive ----------------------------------------------------------

const STATIC = "https://livetiming.formula1.com/static";

const stampOf = (s: string) => {
  const [h, m, sec] = s.split(":").map(Number);
  return (h * 3600 + m * 60 + sec) * 1000;
};

async function text(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(25_000) });
    return res.ok ? (await res.text()).replace(/^\uFEFF/, "") : null;
  } catch {
    return null;
  }
}

/** The latest archived sessions held at this circuit, best for tracing first. */
async function sessionsAt(circuitKey: number): Promise<{ path: string; name: string }[]> {
  const year = new Date().getUTCFullYear();
  const out: { path: string; name: string; rank: number; when: string }[] = [];
  for (const y of [year, year - 1]) {
    const idx = await text(`${STATIC}/${y}/Index.json`);
    if (!idx) continue;
    try {
      const d = JSON.parse(idx) as { Meetings?: { Circuit?: { Key?: number; ShortName?: string }; Sessions?: { Name: string; Path?: string; EndDate: string }[] }[] };
      for (const m of d.Meetings ?? []) {
        if (m.Circuit?.Key !== circuitKey) continue;
        for (const x of m.Sessions ?? []) {
          if (!x.Path || Date.parse(`${x.EndDate}Z`) > Date.now() - 3 * 3_600_000) continue;
          out.push({ path: x.Path, name: m.Circuit.ShortName ?? "", when: x.EndDate, rank: x.Name === "Qualifying" ? 0 : x.Name === "Race" ? 1 : 2 });
        }
      }
    } catch {}
  }
  return out.sort((a, b) => a.rank - b.rank || b.when.localeCompare(a.when)).map((x) => ({ path: x.path, name: x.name }));
}

async function traceFromArchive(path: string): Promise<Raw | null> {
  const final = await text(`${STATIC}/${path}TimingData.json`);
  if (!final) return null;
  // The fastest driver and the lap they set it on.
  let best: { no: string; lap: number; secs: number } | null = null;
  try {
    const lines = (JSON.parse(final) as { Lines: Record<string, { BestLapTime?: { Value?: string; Lap?: number } }> }).Lines;
    for (const [no, l] of Object.entries(lines)) {
      const v = l.BestLapTime?.Value ?? "";
      const m = /^(\d+):(\d+\.\d+)$/.exec(v);
      if (!m || !l.BestLapTime?.Lap) continue;
      const secs = Number(m[1]) * 60 + Number(m[2]);
      if (!best || secs < best.secs) best = { no, lap: l.BestLapTime.Lap, secs };
    }
  } catch {
    return null;
  }
  if (!best) return null;

  // When that lap began and ended, from the stream of lap counts.
  const stream = await text(`${STATIC}/${path}TimingData.jsonStream`);
  if (!stream) return null;
  let start = -1;
  let end = -1;
  const lapRe = new RegExp(`"${best.no}":\\{[^{}]*"NumberOfLaps":(\\d+)`);
  for (const line of stream.split(/\r?\n/)) {
    const m = /^(\d{2}:\d{2}:\d{2}\.\d{3})(.*)$/.exec(line);
    if (!m) continue;
    const hit = lapRe.exec(m[2]);
    if (!hit) continue;
    const laps = Number(hit[1]);
    if (laps === best.lap - 1) start = stampOf(m[1]);
    if (laps === best.lap) {
      end = stampOf(m[1]);
      break;
    }
  }
  if (start < 0 || end <= start) return null;

  // The car's positions over that lap (the stream's clock, matched to the samples').
  const pos = await text(`${STATIC}/${path}Position.z.jsonStream`);
  if (!pos) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  const ts: number[] = [];
  let offset: number | null = null;
  for (const line of pos.split(/\r?\n/)) {
    const m = /^(\d{2}:\d{2}:\d{2}\.\d{3})"(.*)"$/.exec(line);
    if (!m) continue;
    const rel = stampOf(m[1]);
    if (offset !== null && rel < start - 5000) continue;
    if (rel > end + 5000) break;
    let batch: { Position: { Timestamp: string; Entries: Record<string, { X: number; Y: number }> }[] };
    try {
      batch = JSON.parse(inflateRawSync(Buffer.from(m[2], "base64")).toString());
    } catch {
      continue;
    }
    for (const b of batch.Position) {
      const abs = Date.parse(b.Timestamp);
      offset ??= abs - rel;
      const t = abs - offset;
      const e = b.Entries[best.no];
      if (t < start || t > end || !e || (e.X === 0 && e.Y === 0)) continue;
      xs.push(e.X);
      ys.push(e.Y);
      ts.push((t - start) / 1000);
    }
  }
  if (xs.length < 40) return null;
  return { x: xs, y: ys, rotation: 0, trackPositionTime: ts, candidateLap: { lapTime: best.secs } };
}

/** The circuit as a vector model, this season's layout or failing that last season's. */
export async function getTrack(circuitKey: number, year = new Date().getUTCFullYear()): Promise<TrackModel | null> {
  const id = `${circuitKey}:${year}`;
  const hit = memo.get(id);
  if (hit && Date.now() - hit.at < 6 * 3_600_000) return hit.model;
  const store = getStore();
  const key = `f1:track:v3:${id}`;
  let model = await store.get<TrackModel>(key).catch(() => null);
  if (!model) {
    for (const y of [year, year - 1, year - 2]) {
      const raw = await fetchRaw(circuitKey, y);
      model = raw ? buildModel(raw, circuitKey, y) : null;
      if (model) break;
    }
    // Not in MultiViewer: trace it from F1's archive.
    if (!model) {
      for (const { path, name } of (await sessionsAt(circuitKey)).slice(0, 3)) {
        const raw = await traceFromArchive(path).then((r) => (r ? { ...r, circuitName: name } : null)).catch(() => null);
        model = raw ? buildModel(raw, circuitKey, Number(path.slice(0, 4))) : null;
        if (model) break;
      }
    }
    if (model) await store.set(key, model, { ttlSeconds: KEEP_DAYS * 86_400 }).catch(() => {});
  }
  memo.set(id, { at: Date.now(), model });
  return model;
}

// ---- the sectors -----------------------------------------------------------
// Where the timing sectors fall is in no circuit file, but every session run
// at a circuit shows it (its typical sector times). Remembered per circuit so
// the next-race map can mark S2 and S3 before any running there this year.

const sectorKey = (circuitKey: number) => `f1:track:sectors:v1:${circuitKey}`;

export async function rememberSectors(circuitKey: number | null, ref: [number, number, number] | null): Promise<void> {
  if (!circuitKey || !ref) return;
  const lap = ref[0] + ref[1] + ref[2];
  if (!(lap > 0)) return;
  const ends: [number, number] = [Math.round((ref[0] / lap) * 10000) / 10000, Math.round(((ref[0] + ref[1]) / lap) * 10000) / 10000];
  await getStore().set(sectorKey(circuitKey), ends, { ttlSeconds: 120 * 86_400 }).catch(() => {});
}

export async function sectorsFor(circuitKey: number): Promise<[number, number] | null> {
  return getStore().get<[number, number]>(sectorKey(circuitKey)).catch(() => null);
}

// ---- the timing loops ------------------------------------------------------
// Each sector is split into mini-sectors by timing loops buried in the track,
// and they are not evenly spaced: at Sepang the last loop before the line is
// at the final corner, so the whole main straight is one mini-sector. Placing
// a car "halfway into its mini-sector" needs to know where each one really
// starts and ends — so it is measured from F1's archive of a session held
// here: on every clean lap, the moment each loop lit after the car crossed
// the line, as a share of that lap (the median across the field). Those
// shares are on the same clock as the map's (a lap's time at each point), so
// they place straight onto it. Kept four months per circuit.

const loopKey = (circuitKey: number) => `f1:track:loops:v1:${circuitKey}`;

type Obj = Record<string, unknown>;
const entries = (v: unknown): [number, unknown][] =>
  Array.isArray(v) ? v.map((x, i) => [i, x] as [number, unknown]) : v && typeof v === "object" ? Object.entries(v as Obj).map(([k, x]) => [Number(k), x] as [number, unknown]) : [];

/** The share of a lap at which each mini-sector ends, from one archived session. */
export async function measureLoops(path: string): Promise<number[] | null> {
  const stream = await text(`${STATIC}/${path}TimingData.jsonStream`);
  if (!stream) return null;
  const counts: number[] = [0, 0, 0];
  const lapStart = new Map<string, number>();
  const hits = new Map<string, Map<number, number>>();
  const laps: { duration: number; shares: Map<number, number> }[] = [];
  for (const line of stream.split(/\r?\n/)) {
    const m = /^(\d{2}:\d{2}:\d{2}\.\d{3})(.*)$/.exec(line);
    if (!m) continue;
    let d: { Lines?: Obj };
    try {
      d = JSON.parse(m[2]);
    } catch {
      continue;
    }
    const t = stampOf(m[1]);
    for (const [no, raw] of Object.entries(d.Lines ?? {})) {
      const l = raw as Obj;
      // Loops lit (the full first state gives the layout: segments per sector).
      for (const [s, sec] of entries(l.Sectors)) {
        const segs = entries((sec as Obj)?.Segments);
        if (s < 3 && segs.length) counts[s] = Math.max(counts[s], ...segs.map(([i]) => i + 1));
        for (const [i, seg] of segs) {
          const status = Number((seg as Obj)?.Status ?? 0);
          if (!status || status === 2064 || !lapStart.has(no)) continue;
          const k = (s > 0 ? counts[0] : 0) + (s > 1 ? counts[1] : 0) + i;
          const mine = hits.get(no) ?? new Map<number, number>();
          if (!mine.has(k)) mine.set(k, t);
          hits.set(no, mine);
        }
      }
      if (typeof l.NumberOfLaps === "number") {
        const began = lapStart.get(no);
        const mine = hits.get(no);
        if (began !== undefined && mine) {
          const duration = t - began;
          const shares = new Map<number, number>();
          for (const [k, at] of mine) if (at > began + 1500) shares.set(k, (at - began) / duration);
          laps.push({ duration, shares });
        }
        lapStart.set(no, t);
        hits.set(no, new Map());
      }
    }
  }
  const total = counts[0] + counts[1] + counts[2];
  if (total < 6 || laps.length < 5) return null;
  // Clean laps: within 7% of the quickest (no pit stops, no safety car, no cool-downs).
  const quickest = Math.min(...laps.map((l) => l.duration).filter((x) => x > 30_000));
  const clean = laps.filter((l) => l.duration <= quickest * 1.07 && l.shares.size >= total * 0.8);
  if (clean.length < 3) return null;
  const ends: number[] = [];
  for (let k = 0; k < total - 1; k++) {
    const v = clean.map((l) => l.shares.get(k)).filter((x): x is number => x !== undefined && x > 0 && x < 1).sort((a, b) => a - b);
    const med = v.length ? v[Math.floor(v.length / 2)] : null;
    ends.push(med ?? (k + 1) / total);
  }
  ends.push(1);
  // In order, each a sliver at least.
  for (let k = 1; k < ends.length; k++) ends[k] = Math.max(ends[k], ends[k - 1] + 0.002);
  ends[ends.length - 1] = 1;
  return ends.map((x) => Math.round(Math.min(1, x) * 10000) / 10000);
}

/** Where each mini-sector ends at this circuit (shares of a lap), measured once and kept. */
export async function loopsFor(circuitKey: number): Promise<number[] | null> {
  const store = getStore();
  const kept = await store.get<number[] | "none">(loopKey(circuitKey)).catch(() => null);
  if (kept) return kept === "none" ? null : kept;
  if (!(await store.setIfAbsent(`${loopKey(circuitKey)}:lock`, 1, 120).catch(() => true))) return null;
  let found: number[] | null = null;
  for (const { path } of (await sessionsAt(circuitKey)).slice(0, 2)) {
    found = await measureLoops(path).catch(() => null);
    if (found) break;
  }
  // Nothing measurable yet (a new circuit): ask again in a day.
  await store.set(loopKey(circuitKey), found ?? "none", { ttlSeconds: found ? 120 * 86_400 : 86_400 }).catch(() => {});
  return found;
}
