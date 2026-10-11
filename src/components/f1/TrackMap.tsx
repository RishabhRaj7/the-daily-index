"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LiveSnapshot, SegmentMark, TrackModel } from "@/lib/f1-live-types";
import { estimateCars, headingAt, pointAt, sectorEnds, segmentBounds, segmentMarks } from "@/lib/f1-track-progress";
import dynamic from "next/dynamic";
import type { CityApi, CityBadge, CityCar } from "./City3D";
import { useF1Favourites } from "./LiveTiming";
import { TYRE } from "./TyreIcon";

// The circuit as a vector: it draws itself when it comes into view, with the
// start/finish line (chequered) and the three sectors marked. During a
// session it carries the field — each car's place estimated from the timing
// loops (lib/f1-track-progress.ts) — and lights the followed driver's
// mini-sectors purple, green or yellow along the track.
//
// Car motion. Each car is driven forward at the speed it has been making —
// measured over the last half-minute of estimates, so a cool-down lap, an
// out-lap or a safety car slows it as it slows the real car — and every new
// estimate only changes how fast it goes until it has caught up: up to two
// and a half times its speed when behind, down to a standstill when ahead.
// So a car waits rather than runs backwards, and catches up rather than
// jumps. Whole laps are ignored when comparing (the lap counter and the
// loops don't tick over at the same instant), and only a car a third of a
// lap out — a first sighting, say — is placed outright.

const cache = new Map<number, Promise<TrackModel | null>>();

// The 3D city view (Mapbox), loaded only when the reader picks it and a token is set.
const City3D = dynamic(() => import("./City3D"), { ssr: false });
const HAS_MAPBOX = !!process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

/** Sector colours: S1 red, S2 blue, S3 yellow (as the broadcast's sector boards). */
const SECTOR_COLOUR = ["#ff3b4a", "#3b9dff", "#ffcf3a"];

export function useTrack(circuitKey: number | null | undefined): TrackModel | null {
  const [model, setModel] = useState<{ key: number; model: TrackModel | null } | null>(null);
  useEffect(() => {
    if (!circuitKey) return;
    let live = true;
    let p = cache.get(circuitKey);
    if (!p) {
      p = fetch(`/api/f1/track?key=${circuitKey}&v=7`)
        .then((r) => (r.ok ? (r.json() as Promise<TrackModel>) : null))
        .catch(() => null);
      cache.set(circuitKey, p);
    }
    p.then((m) => live && setModel({ key: circuitKey, model: m }));
    return () => {
      live = false;
    };
  }, [circuitKey]);
  return model && model.key === circuitKey ? model.model : null;
}

const MARK: Record<SegmentMark, string> = {
  fastest: "var(--f1-fastest)",
  personal: "var(--f1-personal)",
  slower: "var(--f1-slower)",
  pit: "var(--f1-pit)",
  none: "transparent",
};

/** The points of the track between two shares of the lap. */
function stretchPts(model: TrackModel, from: number, to: number): [number, number][] {
  const pts: [number, number][] = [pointAt(model, from)];
  for (let i = 0; i < model.points.length; i++) {
    const f = model.fraction[i];
    if (f > from && f < to) pts.push(model.points[i]);
  }
  pts.push(pointAt(model, to));
  return pts;
}

/** The same, as an SVG points list. */
function stretch(model: TrackModel, from: number, to: number): string {
  return stretchPts(model, from, to)
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
}

/** A short line across the track at `f`, `half` long each side. */
function across(model: TrackModel, f: number, half: number) {
  const [x, y] = pointAt(model, f);
  const a = headingAt(model, f) + Math.PI / 2;
  return { x1: x - Math.cos(a) * half, y1: y - Math.sin(a) * half, x2: x + Math.cos(a) * half, y2: y + Math.sin(a) * half, x, y };
}

export default function TrackMap({
  model,
  snap = null,
  focus = null,
  onFocus,
  corners = true,
  sectors = null,
  onExpand,
  big = false,
  fit = false,
  className = "",
  label,
  controls = false,
  minimal = false,
}: {
  model: TrackModel;
  snap?: LiveSnapshot | null;
  /** The driver whose mini-sectors colour the track. */
  focus?: string | null;
  onFocus?: (code: string) => void;
  corners?: boolean;
  /** Where sectors 1 and 2 end (shares of a lap) when no session gives them. */
  sectors?: [number, number] | null;
  /** Shows an enlarge button. */
  onExpand?: () => void;
  /** The enlarged map: finer labels, and the map fits its box both ways. */
  big?: boolean;
  /** Fit the box both ways (give it a height through className). */
  fit?: boolean;
  className?: string;
  label?: string;
  /** The map's toolbar (codes, colours, follow, zoom) and mini map, for a session. */
  controls?: boolean;
  /** Just the circuit: no numbers, labels or sectors (the home page). */
  minimal?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drawn, setDrawn] = useState(false);

  // Draw the outline the first time the map is seen.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setDrawn(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const scale = Math.max(model.width, model.height) / 1000;
  const cx = model.width / 2;
  const cy = model.height / 2;
  const ends = sectorEnds(snap?.sectorRef) ?? sectors ?? model.sectors ?? null;

  // The field is drawn only while a session runs.
  const cars = useMemo(() => (snap?.running ? estimateCars(snap, model.loops) : []), [snap, model.loops]);
  const focusRow = snap?.rows.find((r) => r.code === focus);
  const bounds = useMemo(() => (snap ? segmentBounds(snap, model.loops) : []), [snap, model.loops]);
  // Mini-sectors light only while the session runs (afterwards they'd show
  // whatever lap each car was on when it came in).
  const marks = useMemo(() => (snap?.running ? segmentMarks(focusRow) : []), [snap?.running, focusRow]);

  // The followed driver's mini-sectors are drawn up to where the car is on
  // the map — never ahead of it, never trailing it: the frame loop clips the
  // lit ones at the car and runs a faint trail in the team colour over the
  // stretch it is driving now (its colour comes when the loop lights).
  const segRefs = useRef<(SVGPolylineElement | null)[]>([]);
  const trailRef = useRef<SVGPolylineElement>(null);
  const overlay = useRef({ focus: null as string | null, marks: [] as SegmentMark[], bounds: [] as { from: number; to: number }[], drawn: "" });
  useEffect(() => {
    overlay.current = { focus: snap?.running ? (focus ?? null) : null, marks, bounds, drawn: "" };
  }, [focus, marks, bounds, snap?.running]);

  // ---- the field: driven forward, steered towards each estimate ------------
  const carRefs = useRef(new Map<string, SVGGElement>());
  /** Where each car is drawn now (the 3D view reads it every frame). */
  const placedRef = useRef(new Map<string, [number, number, number]>());
  const motion = useRef(new Map<string, number>());
  /** Each car's recent estimates (read time, laps travelled), for its speed. */
  const seen = useRef(new Map<string, { t: number; d: number }[]>());
  const paceRef = useRef(new Map<string, number>());
  const carsRef = useRef(cars);
  const readAt = snap?.localAt ?? (snap ? Date.parse(snap.at) : 0);
  const readRef = useRef(readAt);
  // A replay runs the session clock at its own rate (0 while paused).
  const rate = snap?.replaySpeed ?? 1;
  const rateRef = useRef(rate);
  useEffect(() => {
    carsRef.current = cars;
    readRef.current = readAt;
    if (rateRef.current !== rate) seen.current.clear(); // speeds measured at the old rate
    rateRef.current = rate;
    for (const c of cars) {
      if (!c.onTrack) {
        // Off the track: forget it, so it is placed afresh when it rejoins.
        seen.current.delete(c.code);
        motion.current.delete(c.code);
        paceRef.current.delete(c.code);
        continue;
      }
      const hist = (seen.current.get(c.code) ?? []).filter((h) => readAt - h.t < 40_000 && h.t < readAt);
      hist.push({ t: readAt, d: c.distance });
      seen.current.set(c.code, hist);
      // The speed it has really been making over the last 12–40 s (in session time).
      const first = hist[0];
      const span = ((readAt - first.t) / 1000) * (rate || 1);
      const moved = c.distance - first.d;
      const made = span >= 12 && moved > 0.02 && moved < 0.9 ? span / moved : null;
      // Close to its lap pace: the lap pace (steadier). Well off it: what it's making.
      const pace = made && Math.abs(made / c.pace - 1) > 0.15 ? Math.min(400, Math.max(55, made)) : c.pace;
      paceRef.current.set(c.code, pace);
    }
  }, [cars, readAt, rate]);

  // ---- the camera: turn, zoom, pan, follow --------------------------------------
  // The reader can turn the circuit in steps of 45°. The drawing turns inside
  // a box that fits it turned; labels and badges stay upright.
  const [turn, setTurn] = useState(0);
  const turnRef = useRef(0);
  const base = useMemo(() => {
    if (!turn) return { x: 0, y: 0, w: model.width, h: model.height };
    const a = (turn * Math.PI) / 180;
    const [c, s] = [Math.cos(a), Math.sin(a)];
    const [mx, my] = [model.width / 2, model.height / 2];
    const xs = model.points.map(([x, y]) => mx + (x - mx) * c - (y - my) * s);
    const ys = model.points.map(([x, y]) => my + (x - mx) * s + (y - my) * c);
    const pad = 70 * (Math.max(model.width, model.height) / 1000);
    const [x0, y0] = [Math.min(...xs) - pad, Math.min(...ys) - pad];
    return { x: x0, y: y0, w: Math.max(...xs) + pad - x0, h: Math.max(...ys) + pad - y0 };
  }, [model, turn]);
  /** A point of the model where it is drawn, turned. */
  const spin = useCallback(
    (x: number, y: number): [number, number] => {
      const t = turnRef.current;
      if (!t) return [x, y];
      const a = (t * Math.PI) / 180;
      const [mx, my] = [model.width / 2, model.height / 2];
      return [mx + (x - mx) * Math.cos(a) - (y - my) * Math.sin(a), my + (x - mx) * Math.sin(a) + (y - my) * Math.cos(a)];
    },
    [model],
  );
  // The view is a window on the model's box, kept in refs and written straight
  // onto the SVG (the frame loop moves it every frame while following a car),
  // so panning and following never re-render the map.
  const [zoom, setZoom] = useState(1);
  const [follow, setFollow] = useState(false);
  const zoomRef = useRef(1);
  const followRef = useRef<string | null>(null);
  const centre = useRef({ x: model.width / 2, y: model.height / 2 });
  useEffect(() => {
    turnRef.current = turn;
  }, [turn]);
  const miniRef = useRef<SVGRectElement>(null);
  const applyView = useCallback(() => {
    const z = zoomRef.current;
    const b = base;
    const w = b.w / z;
    const h = b.h / z;
    const c = centre.current;
    c.x = z <= 1 ? b.x + b.w / 2 : Math.min(b.x + b.w - w / 2, Math.max(b.x + w / 2, c.x));
    c.y = z <= 1 ? b.y + b.h / 2 : Math.min(b.y + b.h - h / 2, Math.max(b.y + h / 2, c.y));
    const box = [c.x - w / 2, c.y - h / 2, w, h].map((v) => v.toFixed(1));
    svgRef.current?.setAttribute("viewBox", box.join(" "));
    const m = miniRef.current;
    if (m) ["x", "y", "width", "height"].forEach((k, i) => m.setAttribute(k, box[i]));
  }, [base]);
  useEffect(() => {
    zoomRef.current = zoom;
    applyView();
  }, [zoom, applyView]);
  useEffect(() => {
    followRef.current = follow && focus && snap?.running ? focus : null;
  }, [follow, focus, snap?.running]);
  const zoomBy = (factor: number, at?: { x: number; y: number }) => {
    const z = zoomRef.current;
    const next = Math.min(8, Math.max(1, z * factor));
    if (at && next !== z) {
      // Keep the point under the pointer where it is.
      const c = centre.current;
      c.x = at.x + (c.x - at.x) * (z / next);
      c.y = at.y + (c.y - at.y) * (z / next);
    }
    zoomRef.current = next;
    setZoom(next);
    applyView();
  };
  /** A screen point in the model's units. */
  const toModel = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  // Scroll to zoom (the enlarged map only: on the page a scroll should scroll).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !big) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const at = toModel(e.clientX, e.clientY) ?? undefined;
      zoomBy(Math.exp(-e.deltaY * 0.0015), at);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [big, model]);
  // Drag to pan once zoomed; two fingers pinch (the enlarged map).
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<number | null>(null);
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (zoomRef.current <= 1 && !big) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const was = pointers.current.get(e.pointerId);
    if (!was) return;
    const now = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, now);
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomBy(d / pinch.current, toModel((a.x + b.x) / 2, (a.y + b.y) / 2) ?? undefined);
      pinch.current = d;
      return;
    }
    if (zoomRef.current <= 1) return;
    const k = svgRef.current?.getScreenCTM()?.a ?? 1;
    if (Math.hypot(now.x - was.x, now.y - was.y) > 0.5) {
      if (followRef.current) setFollow(false);
      followRef.current = null;
      centre.current.x -= (now.x - was.x) / k;
      centre.current.y -= (now.y - was.y) / k;
      applyView();
    }
  };
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const hasSnap = !!snap;
  useEffect(() => {
    if (!hasSnap) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      // Carried on from the last read for 12 s at most: a stalled feed
      // leaves the cars waiting, not running on alone.
      const r = rateRef.current;
      const since = Math.min(12, Math.max(0, (Date.now() - readRef.current) / 1000)) * r;
      for (const c of carsRef.current) {
        const el = carRefs.current.get(c.code);
        if (!el) continue;
        const pace = paceRef.current.get(c.code) ?? c.pace;
        // Where the estimate says the car is by now, carried on at its speed.
        const target = c.distance + since / pace;
        let at = motion.current.get(c.code);
        if (at !== undefined) at += Math.round(target - at); // whole laps don't count
        const err = at === undefined ? 0 : target - at;
        if (at === undefined || reduced || Math.abs(err) > 0.33) at = target;
        else at += ((dt * r) / pace) * Math.min(2.5, Math.max(0, 1 + err * 12));
        motion.current.set(c.code, at);
        const [x, y] = pointAt(model, at);
        placedRef.current.set(c.code, [x, y, ((at % 1) + 1) % 1]);
        el.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
        // The camera rides with the followed car (zoomed in a little if it wasn't).
        if (followRef.current === c.code) {
          [centre.current.x, centre.current.y] = spin(x, y);
          applyView();
        }
      }

      // The followed driver's lit mini-sectors, up to the car.
      const o = overlay.current;
      if (o.focus) {
        const at = carRefs.current.has(o.focus) ? motion.current.get(o.focus) : undefined;
        // Off the map (in the pits): the lap so far, whole.
        const f = at === undefined ? 1 : ((at % 1) + 1) % 1;
        const q = `${Math.round(f * 800)}`;
        if (q !== o.drawn) {
          o.drawn = q;
          let lastLit = 0;
          o.bounds.forEach((b, i) => {
            const el = segRefs.current[i];
            if (!el) return;
            const lit = o.marks[i] && o.marks[i] !== "none";
            if (!lit || b.from >= f) {
              el.setAttribute("points", "");
              return;
            }
            el.setAttribute("points", stretch(model, b.from, Math.min(b.to, f)));
            if (b.to <= f) lastLit = Math.max(lastLit, b.to);
          });
          trailRef.current?.setAttribute("points", at !== undefined && f - lastLit > 0.003 ? stretch(model, lastLit, f) : "");
        }
      }
      if (!reduced) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [hasSnap, model, applyView, spin]);

  // Zoomed in, the cars and their codes grow a little, not as much as the track.
  const inv = 1 / Math.sqrt(zoom);
  /** Keeps a label upright at (x, y) when the circuit is turned. */
  const upright = (x = 0, y = 0) => (turn ? `rotate(${-turn} ${x} ${y})` : undefined);
  const r = (big ? 10 : 13) * scale * inv;
  const fav = useF1Favourites();
  const [codes, setCodes] = useStoredChoice<"all" | "yours" | "off">("f1-map-codes", "all", ["all", "yours", "off"]);
  const [paint, setPaint] = useStoredChoice<"team" | "tyre">("f1-map-paint", "team", ["team", "tyre"]);
  // What the map carries (the live maps): sector numbers on at first; coloured edges and corner numbers off.
  const [cornerPick, setCornerPick] = useStoredChoice<"on" | "off">("f1-map-corners", "off", ["on", "off"]);
  const [sectorPick, setSectorPick] = useStoredChoice<"on" | "off">("f1-map-sectors", "on", ["on", "off"]);
  const [edgePick, setEdgePick] = useStoredChoice<"on" | "off">("f1-map-edges-v2", "off", ["on", "off"]);
  const showCorners = corners && (!controls || cornerPick === "on");
  const showSectors = !controls || sectorPick === "on";
  const showEdges = !controls || edgePick === "on";
  // Basic (the drawing) or 3D (the city around the circuit), where the circuit has been placed on Earth.
  const [view, setView] = useStoredChoice<"basic" | "3d">("f1-map-view", "basic", ["basic", "3d"]);
  const can3d = controls && !minimal && HAS_MAPBOX && !!model.geo;
  const city = can3d && view === "3d";
  const cityApi = useRef<CityApi | null>(null);
  const tyreOf = new Map((snap?.rows ?? []).map((row) => [row.code, row.tyre?.compound ?? null]));
  const fill = (code: string, colour: string) => {
    const t = paint === "tyre" ? tyreOf.get(code) : null;
    return t ? TYRE[t].colour : colour;
  };
  const showCode = (code: string) => codes === "all" || code === focus || (codes === "yours" && fav.codes.has(code));
  const start = across(model, 0, 30 * scale);
  const out = (x: number, y: number, d: number) => {
    const dx = x - cx;
    const dy = y - cy;
    const n = Math.hypot(dx, dy) || 1;
    return [x + (dx / n) * d, y + (dy / n) * d] as const;
  };
  const startLabel = out(start.x, start.y, 60 * scale);

  // The pit lane (traced from a real stop, entry to exit), and the cars in it
  // now, spread along its middle where the garages are, in running order.
  const lane = model.pit && model.pit.length > 1 ? model.pit : null;
  const laneAt = (() => {
    if (!lane) return null;
    const run = [0];
    for (let i = 1; i < lane.length; i++) run.push(run[i - 1] + Math.hypot(lane[i][0] - lane[i - 1][0], lane[i][1] - lane[i - 1][1]));
    const total = run[run.length - 1] || 1;
    return (f: number): [number, number] => {
      const d = f * total;
      let i = 1;
      while (i < lane.length - 1 && run[i] < d) i++;
      const t = (d - run[i - 1]) / (run[i] - run[i - 1] || 1);
      return [lane[i - 1][0] + (lane[i][0] - lane[i - 1][0]) * t, lane[i - 1][1] + (lane[i][1] - lane[i - 1][1]) * t];
    };
  })();
  const pitted = laneAt && snap?.running ? snap.rows.filter((x) => x.inPit && !x.out && !(x.knockedOut && snap.type !== "Race")) : [];

  // The sectors, each its own colour along the track's edge and on its label.
  const sectorRanges: [number, number][] | null = ends ? [[0, ends[0]], [ends[0], ends[1]], [ends[1], 1]] : null;

  // Badges sit beside the track, never on it: from the point, out along the
  // track's normal (the side away from the middle first), as far as it takes
  // to clear every part of the circuit — a hairpin's other leg, the pit lane,
  // the start line and the badges already placed included.
  const spots = useMemo(() => {
    const pts = model.points;
    const lanePts = model.pit ?? [];
    const half = 14 * scale;
    const placed: { x: number; y: number; r: number }[] = [];
    const clearance = (px: number, py: number) => {
      let m = Infinity;
      for (const [qx, qy] of pts) m = Math.min(m, (qx - px) ** 2 + (qy - py) ** 2);
      let d = Math.sqrt(m);
      // the pit lane is narrower than the track
      for (const [qx, qy] of lanePts) d = Math.min(d, Math.hypot(qx - px, qy - py) + half * 0.45);
      for (const b of placed) d = Math.min(d, Math.hypot(b.x - px, b.y - py) - b.r + half);
      return d;
    };
    const place = (x: number, y: number, nx: number, ny: number, size: number): [number, number] => {
      const need = half + size + 3 * scale;
      const away = nx * (x - model.width / 2) + ny * (y - model.height / 2) >= 0 ? 1 : -1;
      let best: [number, number] = [x + away * nx * need, y + away * ny * need];
      let bestD = -1;
      search: for (const k of [1, 1.3, 1.7, 2.2, 2.9, 3.8, 5])
        for (const side of [away, -away]) {
          const p: [number, number] = [x + side * nx * need * k, y + side * ny * need * k];
          const d = clearance(p[0], p[1]);
          if (d >= need - 0.5) {
            best = p;
            break search;
          }
          if (d > bestD) {
            bestD = d;
            best = p;
          }
        }
      placed.push({ x: best[0], y: best[1], r: size + 2 * scale });
      return best;
    };
    const normalAt = (x: number, y: number): [number, number] => {
      let i = 0;
      let m = Infinity;
      pts.forEach(([qx, qy], k) => {
        const d = (qx - x) ** 2 + (qy - y) ** 2;
        if (d < m) {
          m = d;
          i = k;
        }
      });
      const a = pts[(i - 1 + pts.length) % pts.length];
      const b = pts[(i + 1) % pts.length];
      const tx = b[0] - a[0];
      const ty = b[1] - a[1];
      const n = Math.hypot(tx, ty) || 1;
      return [-ty / n, tx / n];
    };
    const line = across(model, 0, 30 * scale);
    placed.push({ x: line.x1, y: line.y1, r: 6 * scale }, { x: line.x2, y: line.y2, r: 6 * scale });
    const sector = (sectorRanges ?? []).map(([from]) => {
      const a = across(model, from, 1);
      const n = Math.hypot(a.x2 - a.x1, a.y2 - a.y1) || 1;
      return place(a.x, a.y, (a.x2 - a.x1) / n, (a.y2 - a.y1) / n, 16 * scale * inv);
    });
    const corner = new Map(
      model.corners.map((c) => {
        const [nx, ny] = normalAt(c.x, c.y);
        return [c.number, place(c.x, c.y, nx, ny, 12 * scale * inv)] as const;
      }),
    );
    return { corner, sector };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, scale, inv, ends?.[0], ends?.[1]]);

  const cityCars: CityCar[] = city
    ? [
        ...cars
          .filter((c) => c.onTrack)
          .map((c) => ({ code: c.code, colour: c.colour, fill: fill(c.code, c.colour), ring: paint === "tyre" ? c.colour : "#0b0e17", mine: c.code === focus, label: showCode(c.code) })),
        ...pitted.map((row, i) => ({
          code: row.code,
          colour: row.colour,
          fill: fill(row.code, row.colour),
          ring: "var(--f1-pit)",
          mine: row.code === focus,
          label: (pitted.length <= 6 || row.code === focus) && showCode(row.code),
          pit: laneAt!(pitted.length === 1 ? 0.5 : 0.25 + (0.5 * i) / (pitted.length - 1)),
        })),
      ]
    : [];
  const cityBadges: CityBadge[] = city
    ? [
        ...(showSectors ? (sectorRanges ?? []).map((_, i) => ({ key: `s${i}`, x: spots.sector[i][0], y: spots.sector[i][1], text: `S${i + 1}`, colour: SECTOR_COLOUR[i], ink: "#111", round: false })) : []),
        ...(showCorners ? model.corners.map((c) => ({ key: `c${c.number}`, x: (spots.corner.get(c.number) ?? [c.x, c.y])[0], y: (spots.corner.get(c.number) ?? [c.x, c.y])[1], text: String(c.number), colour: "rgba(20,22,30,.9)", ink: "#fff", round: true })) : []),
      ]
    : [];

  return (
    <div className={`relative ${className}`}>
      {city && model.geo && (
        <City3D
          model={model}
          geo={model.geo}
          cars={cityCars}
          spots={placedRef}
          badges={cityBadges}
          edges={showEdges && sectorRanges ? sectorRanges.map(([from, to], i) => ({ pts: stretchPts(model, from, to), colour: SECTOR_COLOUR[i] })) : null}
          follow={followRef}
          onFocus={onFocus}
          onLeaveFollow={() => {
            setFollow(false);
            followRef.current = null;
          }}
          api={cityApi}
          big={big}
          turn={turn}
        />
      )}
      <svg
        ref={svgRef}
        viewBox={`${base.x} ${base.y} ${base.w} ${base.h}`}
        className={`relative block w-full ${big || fit ? "h-full" : "h-auto"} ${drawn ? "track-drawn" : "track-undrawn"} ${city ? "invisible" : ""}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={controls ? onPointerDown : undefined}
        onPointerMove={controls ? onPointerMove : undefined}
        onPointerUp={controls ? onPointerUp : undefined}
        onPointerCancel={controls ? onPointerUp : undefined}
        style={controls && (zoom > 1 || big) ? { touchAction: "none", cursor: zoom > 1 ? "grab" : undefined } : undefined}
        role="img"
        aria-label={label ?? `${model.name} circuit map`}
      >
        <defs>
          <pattern id={`chequer-${model.circuitKey}`} width={8 * scale} height={8 * scale} patternUnits="userSpaceOnUse">
            <rect width={8 * scale} height={8 * scale} fill="#fff" />
            <rect width={4 * scale} height={4 * scale} fill="#111" />
            <rect x={4 * scale} y={4 * scale} width={4 * scale} height={4 * scale} fill="#111" />
          </pattern>
        </defs>
        <g transform={turn ? `rotate(${turn} ${cx} ${cy})` : undefined}>

        {/* the pit lane, under the track: a narrow lane, dashed down the middle */}
        {lane && (
          <g aria-label="Pit lane">
            <polyline points={lane.map((p) => p.join(",")).join(" ")} fill="none" stroke="var(--track-edge)" strokeWidth={14 * scale} strokeLinejoin="round" strokeLinecap="round" />
            <polyline points={lane.map((p) => p.join(",")).join(" ")} fill="none" stroke="var(--track-tarmac)" strokeWidth={9 * scale} strokeLinejoin="round" strokeLinecap="round" />
            {!minimal && (
              <polyline
                points={lane.map((p) => p.join(",")).join(" ")}
                fill="none"
                stroke="var(--ink-faint)"
                strokeWidth={2 * scale}
                strokeDasharray={`${8 * scale} ${7 * scale}`}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
          </g>
        )}

        {/* the edge (in each sector's colour), then the tarmac, which draws itself */}
        <path d={model.path} fill="none" stroke="var(--track-edge)" strokeWidth={28 * scale} strokeLinejoin="round" strokeLinecap="round" />
        {!minimal &&
          showEdges &&
          sectorRanges?.map(([from, to], i) => (
            <polyline key={i} className="track-corner" points={stretch(model, from, to)} fill="none" stroke={SECTOR_COLOUR[i]} strokeOpacity={0.55} strokeWidth={28 * scale} strokeLinejoin="round" />
          ))}
        <path className="track-line" d={model.path} pathLength={1} fill="none" stroke="var(--track-tarmac)" strokeWidth={19 * scale} strokeLinejoin="round" strokeLinecap="round" />

        {/* the followed driver's mini-sectors, lit as the timing screens light them (points set by the frame loop) */}
        {snap &&
          bounds.map((_, i) => (
            <polyline
              key={i}
              ref={(el) => {
                segRefs.current[i] = el;
              }}
              points=""
              fill="none"
              stroke={MARK[marks[i] ?? "none"]}
              strokeWidth={9 * scale}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transition: "stroke 0.3s ease" }}
            />
          ))}
        {snap && <polyline ref={trailRef} points="" fill="none" stroke={focusRow?.colour ?? "var(--ink)"} strokeOpacity={0.5} strokeWidth={9 * scale} strokeLinecap="round" strokeLinejoin="round" />}

        {!minimal && (
          <g className="track-corner">
            {/* where each sector begins: a tick across in its colour, and its badge */}
            {showSectors &&
              sectorRanges?.map(([from], i) => {
              const a = across(model, from, 18 * scale);
              const [lx, ly] = spots.sector[i] ?? out(a.x, a.y, 52 * scale);
              const w = 30 * scale * inv;
              const h = 17 * scale * inv;
              return (
                <g key={i}>
                  {i > 0 && <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke={SECTOR_COLOUR[i]} strokeWidth={4 * scale} strokeLinecap="round" />}
                  <g transform={upright(lx, ly)}>
                    <rect x={lx - w / 2} y={ly - h / 2} width={w} height={h} rx={h / 2} fill={SECTOR_COLOUR[i]} />
                    <text x={lx} y={ly} dy="0.36em" textAnchor="middle" fontSize={11 * scale * inv} fontWeight={800} fontFamily="var(--font-sans)" fill="#111">
                      S{i + 1}
                    </text>
                  </g>
                </g>
              );
            })}

            {/* the corners, numbered in badges just off the track */}
            {showCorners &&
              model.corners.map((c) => {
                const [x, y] = spots.corner.get(c.number) ?? out(c.x, c.y, 36 * scale);
                const rr = 11 * scale * inv;
                return (
                  <g key={c.number}>
                    <circle cx={x} cy={y} r={rr} fill="var(--track-badge)" stroke="var(--ink)" strokeOpacity={0.85} strokeWidth={1.6 * scale * inv} />
                    <text x={x} y={y} transform={upright(x, y)} dy="0.36em" textAnchor="middle" fontSize={(c.number > 9 ? 10 : 11) * scale * inv} fontWeight={700} fontFamily="var(--font-sans)" fill="var(--ink)">
                      {c.number}
                    </text>
                  </g>
                );
              })}

          </g>
        )}

        {/* start / finish, chequered across the track */}
        <line x1={start.x1} y1={start.y1} x2={start.x2} y2={start.y2} stroke={`url(#chequer-${model.circuitKey})`} strokeWidth={10 * scale} />

        {/* in the pits */}
        {laneAt &&
          pitted.map((row, i) => {
            const [x, y] = laneAt(pitted.length === 1 ? 0.5 : 0.25 + (0.5 * i) / (pitted.length - 1));
            const mine = row.code === focus;
            return (
              <g key={`pit-${row.code}`} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`} onClick={onFocus ? () => onFocus(row.code) : undefined} style={onFocus ? { cursor: "pointer" } : undefined}>
                <title>{`${row.code} in the pits`}</title>
                <g transform={upright()}>
                <circle r={(mine ? 1.1 : 0.85) * r} fill={fill(row.code, row.colour)} stroke="var(--f1-pit)" strokeWidth={3 * scale * inv} />
                {(pitted.length <= 6 || mine) && showCode(row.code) && (
                  <text x={r * 1.3} y={-r} fontSize={(mine ? 20 : 15) * scale * inv} fontWeight={700} fontFamily="var(--font-sans)" fill="var(--ink-soft)" stroke="var(--paper)" strokeWidth={5 * scale} paintOrder="stroke">
                    {row.code}
                  </text>
                )}
                </g>
              </g>
            );
          })}

        {/* the field */}
        {cars
          .filter((c) => c.onTrack)
          .sort((a, b) => (a.code === focus ? 1 : 0) - (b.code === focus ? 1 : 0))
          .map((c) => {
            const mine = c.code === focus;
            return (
              <g
                key={c.code}
                ref={(el) => {
                  if (!el) {
                    carRefs.current.delete(c.code);
                    return;
                  }
                  carRefs.current.set(c.code, el);
                  // Placed once on arrival; the motion loop moves it after.
                  if (!el.getAttribute("transform")) {
                    const [x, y] = pointAt(model, c.distance);
                    el.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
                  }
                }}
                onClick={onFocus ? () => onFocus(c.code) : undefined}
                style={onFocus ? { cursor: "pointer" } : undefined}
              >
                <g transform={upright()}>
                {mine && <circle r={r * 1.9} fill={c.colour} opacity={0.22} className="car-pulse" />}
                <circle r={mine ? r * 1.25 : r} fill={fill(c.code, c.colour)} stroke={paint === "tyre" ? c.colour : "var(--paper)"} strokeWidth={(paint === "tyre" ? 4.5 : 3.5) * scale * inv} />
                {showCode(c.code) && (
                  <text
                    x={r * 1.5}
                    y={-r * 1.2}
                    fontSize={(mine ? (big ? 19 : 24) : big ? 14 : 19) * scale * inv}
                    fontWeight={700}
                    fontFamily="var(--font-sans)"
                    fill="var(--ink)"
                    stroke="var(--paper)"
                    strokeWidth={5 * scale * inv}
                    paintOrder="stroke"
                  >
                    {c.code}
                  </text>
                )}
                </g>
              </g>
            );
          })}
        </g>
      </svg>
      {controls && snap && (
        <MapTools
          view={can3d ? view : null}
          onView={(v) => {
            setView(v);
            setFollow(false);
            followRef.current = null;
          }}
          layers={{ corners: cornerPick === "on", sectors: sectorPick === "on", edges: edgePick === "on" }}
          onLayer={(k, on) => (k === "corners" ? setCornerPick : k === "sectors" ? setSectorPick : setEdgePick)(on ? "on" : "off")}
          codes={codes}
          onCodes={setCodes}
          paint={paint}
          onPaint={setPaint}
          follow={follow}
          onFollow={(on) => {
            setFollow(on);
            if (city) {
              followRef.current = on && focus ? focus : null;
              if (on && focus) cityApi.current?.closeIn(focus);
            } else if (on && zoomRef.current < 2.5) zoomBy(2.5 / zoomRef.current);
          }}
          canFollow={!!focus && snap.running}
          onRotate={(dir) => {
            if (city) cityApi.current?.rotate(dir);
            setTurn((t) => (t + dir * 45 + 360) % 360);
          }}
          zoom={city ? 2 : zoom}
          onZoom={(f) => (city ? cityApi.current?.zoomBy(f) : zoomBy(f))}
          tyres={paint === "tyre" && snap.running ? (["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"] as const).filter((t) => [...tyreOf.values()].includes(t)) : []}
          onReset={() => {
            setFollow(false);
            followRef.current = null;
            if (city) {
              cityApi.current?.reset();
              return;
            }
            zoomRef.current = 1;
            setZoom(1);
            applyView();
          }}
        />
      )}
      {controls && zoom > 1 && !city && (
        // Where the zoomed view is on the whole circuit.
        <svg viewBox={`${base.x} ${base.y} ${base.w} ${base.h}`} className="absolute left-0 bottom-0 w-20 sm:w-24 h-auto rounded-lg border hairline bg-[var(--surface)] opacity-90 pointer-events-none" aria-hidden="true">
          <path d={model.path} transform={turn ? `rotate(${turn} ${cx} ${cy})` : undefined} fill="none" stroke="var(--ink-faint)" strokeWidth={14 * scale} strokeLinejoin="round" />
          <rect ref={miniRef} fill="color-mix(in srgb, var(--hue-f1) 18%, transparent)" stroke="var(--hue-f1)" strokeWidth={8 * scale} rx={10 * scale} />
        </svg>
      )}
      {onExpand && (
        <button type="button" onClick={onExpand} className="absolute top-0 right-0 icon-btn" aria-label="Enlarge the map" title="Enlarge the map">
          <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5 9 7M2.5 13.5 7 9" />
          </svg>
        </button>
      )}
    </div>
  );
}

/** A choice the reader made on the map, remembered on this device. */
function useStoredChoice<T extends string>(key: string, initial: T, allowed: readonly T[]): [T, (v: T) => void] {
  const [v, setV] = useState<T>(initial);
  useEffect(() => {
    try {
      const kept = localStorage.getItem(key) as T | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (kept && allowed.includes(kept)) setV(kept);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return [
    v,
    (next: T) => {
      setV(next);
      try {
        localStorage.setItem(key, next);
      } catch {}
    },
  ];
}


/** A round map control, like a map app's. */
function MapButton({ on, onClick, label, children, disabled }: { on?: boolean; onClick: () => void; label: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={on}
      className={`w-8 h-8 grid place-items-center transition-colors disabled:opacity-30 ${on ? "text-[color:var(--paper)]" : "text-ink-soft hover:text-ink"}`}
      style={on ? { background: "var(--hue-f1)" } : undefined}
    >
      {children}
    </button>
  );
}

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div>
      <div className="font-label text-[9.5px] text-ink-faint mb-1.5">{label}</div>
      <div className="grid rounded-lg border hairline p-0.5 gap-0.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="radiogroup" aria-label={label}>
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={`h-7 rounded-md font-sans text-[11.5px] font-semibold transition-colors ${value === v ? "text-[color:var(--paper)]" : "text-ink-soft hover:text-ink"}`}
            style={value === v ? { background: "var(--ink)" } : undefined}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The map's controls. Top left, one Map options button: what labels the cars
 * and what colours them (with the tyre key when it's tyres). Bottom right, a
 * stack like any map app's: follow the chosen car, zoom in, zoom out, and
 * back to the whole circuit.
 */
function MapTools(p: {
  /** Basic or 3D (null: no 3D for this circuit). */
  view: "basic" | "3d" | null;
  onView: (v: "basic" | "3d") => void;
  codes: "all" | "yours" | "off";
  onCodes: (v: "all" | "yours" | "off") => void;
  paint: "team" | "tyre";
  onPaint: (v: "team" | "tyre") => void;
  follow: boolean;
  onFollow: (on: boolean) => void;
  canFollow: boolean;
  onRotate: (dir: 1 | -1) => void;
  zoom: number;
  onZoom: (factor: number) => void;
  onReset: () => void;
  tyres: readonly ("SOFT" | "MEDIUM" | "HARD" | "INTERMEDIATE" | "WET")[];
  layers: { corners: boolean; sectors: boolean; edges: boolean };
  onLayer: (k: "corners" | "sectors" | "edges", on: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <>
      <div ref={box} className="absolute left-0 top-0 z-10 flex items-start gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="glass border hairline rounded-full h-8 pl-2.5 pr-3 flex items-center gap-1.5 font-sans text-[11.5px] font-semibold text-ink-soft hover:text-ink"
        >
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M2.5 4.5h7M12.5 4.5h1M2.5 11.5h1M6.5 11.5h7" />
            <circle cx="11" cy="4.5" r="1.5" />
            <circle cx="5" cy="11.5" r="1.5" />
          </svg>
          Map options
        </button>
        {p.tyres.length > 0 && !open && (
          <span className="glass border hairline rounded-full h-8 px-3 flex items-center gap-2.5 font-mono text-[10.5px] text-ink-soft">
            {p.tyres.map((t) => (
              <span key={t} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: TYRE[t].colour }} />
                {TYRE[t].name}
              </span>
            ))}
          </span>
        )}
        {open && (
          <div className="absolute left-0 top-10 w-60 rounded-2xl border hairline bg-[var(--surface)] shadow-xl p-3.5 space-y-3.5 animate-[fade-in_0.15s_ease]">
            {p.view && (
              <Choice
                label="View"
                value={p.view}
                onChange={p.onView}
                options={[
                  ["basic", "Basic"],
                  ["3d", "3D city"],
                ]}
              />
            )}
            <Choice
              label="Driver names on the map"
              value={p.codes}
              onChange={p.onCodes}
              options={[
                ["all", "Everyone"],
                ["yours", "Yours"],
                ["off", "None"],
              ]}
            />
            <Choice
              label="Colour the cars by"
              value={p.paint}
              onChange={p.onPaint}
              options={[
                ["team", "Team"],
                ["tyre", "Tyre"],
              ]}
            />
            <div>
              <div className="font-label text-[9.5px] text-ink-faint mb-1.5">On the map</div>
              <div className="space-y-1">
                {(
                  [
                    ["sectors", "Sector numbers"],
                    ["edges", "Edges coloured by sector"],
                    ["corners", "Corner numbers"],
                  ] as const
                ).map(([k, text]) => (
                  <button
                    key={k}
                    type="button"
                    role="switch"
                    aria-checked={p.layers[k]}
                    onClick={() => p.onLayer(k, !p.layers[k])}
                    className="w-full flex items-center justify-between gap-3 h-8 px-1 rounded-md font-sans text-[12px] text-ink-soft hover:text-ink"
                  >
                    {text}
                    <span className="relative w-8 h-[18px] rounded-full transition-colors shrink-0" style={{ background: p.layers[k] ? "var(--hue-f1)" : "var(--rule)" }}>
                      <span className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-[left]" style={{ left: p.layers[k] ? "16px" : "2px" }} />
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <p className="font-mono text-[10.5px] text-ink-faint leading-relaxed">The followed driver always keeps their name. {p.view === "3d" ? "Drag to move; right-drag or two fingers to tilt and turn." : <>Drag to look around once zoomed{" "}in.</>}</p>
          </div>
        )}
      </div>
      <div className="absolute right-0 bottom-0 z-10 glass border hairline rounded-2xl overflow-hidden flex flex-col divide-y divide-[var(--rule)]">
        {p.view && (
          <MapButton on={p.view === "3d"} onClick={() => p.onView(p.view === "3d" ? "basic" : "3d")} label={p.view === "3d" ? "Back to the basic map" : "Show the circuit in 3D"}>
            <span className="font-sans text-[10.5px] font-extrabold tracking-tight">3D</span>
          </MapButton>
        )}
        <MapButton on={p.follow} onClick={() => p.onFollow(!p.follow)} disabled={!p.canFollow} label={p.follow ? "Stop following the car" : "Follow the chosen car"}>
          <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <circle cx="8" cy="8" r="4" />
            <circle cx="8" cy="8" r="1.2" fill="currentColor" />
            <path d="M8 1.5V4M8 12v2.5M1.5 8H4M12 8h2.5" />
          </svg>
        </MapButton>
        <MapButton onClick={() => p.onRotate(-1)} label="Turn the map anticlockwise">
          <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3.5 8a4.5 4.5 0 1 0 1.4-3.3" />
            <path d="M3.2 2.6v2.6h2.6" />
          </svg>
        </MapButton>
        <MapButton onClick={() => p.onRotate(1)} label="Turn the map clockwise">
          <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12.5 8a4.5 4.5 0 1 1-1.4-3.3" />
            <path d="M12.8 2.6v2.6h-2.6" />
          </svg>
        </MapButton>
        <MapButton onClick={() => p.onZoom(1.6)} disabled={p.zoom >= 8} label="Zoom in">
          <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M8 3.5v9M3.5 8h9" />
          </svg>
        </MapButton>
        <MapButton onClick={() => p.onZoom(1 / 1.6)} disabled={p.zoom <= 1} label="Zoom out">
          <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M3.5 8h9" />
          </svg>
        </MapButton>
        {p.zoom > 1 && (
          <MapButton onClick={p.onReset} label="Show the whole circuit">
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
            </svg>
          </MapButton>
        )}
      </div>
    </>
  );
}
