"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LiveSnapshot, SegmentMark, TrackModel } from "@/lib/f1-live-types";
import { estimateCars, headingAt, pointAt, sectorEnds, segmentBounds, segmentMarks } from "@/lib/f1-track-progress";

// The circuit as a vector: it draws itself when it comes into view, with the
// start/finish line (chequered), the direction of travel (an arrow off the
// line, chevrons round the lap) and the three sectors marked. During a
// session it carries the field — each car's place estimated from the timing
// loops (lib/f1-track-progress.ts) — and lights the followed driver's
// mini-sectors purple, green or yellow along the track.
//
// Car motion: each car is driven forward at its own lap pace, and every new
// estimate only changes how fast it goes (a quarter to just over double its
// pace) until it has caught up — so cars never run backwards or jump; only a
// big disagreement (a pit stop, a first sighting) places a car outright.

const cache = new Map<number, Promise<TrackModel | null>>();

export function useTrack(circuitKey: number | null | undefined): TrackModel | null {
  const [model, setModel] = useState<{ key: number; model: TrackModel | null } | null>(null);
  useEffect(() => {
    if (!circuitKey) return;
    let live = true;
    let p = cache.get(circuitKey);
    if (!p) {
      p = fetch(`/api/f1/track?key=${circuitKey}`)
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
function stretch(model: TrackModel, from: number, to: number): string {
  const pts: [number, number][] = [pointAt(model, from)];
  for (let i = 0; i < model.points.length; i++) {
    const f = model.fraction[i];
    if (f > from && f < to) pts.push(model.points[i]);
  }
  pts.push(pointAt(model, to));
  return pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
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
  className = "",
  label,
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
  /** The enlarged map: finer labels. */
  big?: boolean;
  className?: string;
  label?: string;
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
  const cars = useMemo(() => (snap?.running ? estimateCars(snap) : []), [snap]);
  const focusRow = snap?.rows.find((r) => r.code === focus);
  const bounds = useMemo(() => (snap ? segmentBounds(snap) : []), [snap]);
  // Mini-sectors light only while the session runs (afterwards they'd show
  // whatever lap each car was on when it came in).
  const marks = snap?.running ? segmentMarks(focusRow) : [];

  // ---- the field: driven forward, steered towards each estimate ------------
  const carRefs = useRef(new Map<string, SVGGElement>());
  const motion = useRef(new Map<string, number>());
  const carsRef = useRef(cars);
  const readAt = snap?.localAt ?? (snap ? Date.parse(snap.at) : 0);
  const readRef = useRef(readAt);
  useEffect(() => {
    carsRef.current = cars;
    readRef.current = readAt;
  }, [cars, readAt]);

  const hasSnap = !!snap;
  useEffect(() => {
    if (!hasSnap) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      const since = Math.max(0, (Date.now() - readRef.current) / 1000);
      for (const c of carsRef.current) {
        const el = carRefs.current.get(c.code);
        if (!el) continue;
        // Where the estimate says the car is by now, carried on at its pace.
        const target = c.distance + since / c.pace;
        let at = motion.current.get(c.code);
        if (at === undefined || reduced || Math.abs(target - at) > 0.3) at = target;
        else at += (dt / c.pace) * Math.min(2.2, Math.max(0.25, 1 + (target - at) * 14));
        motion.current.set(c.code, at);
        const [x, y] = pointAt(model, at);
        el.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      }
      if (!reduced) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [hasSnap, model]);

  const r = (big ? 10 : 13) * scale;
  const start = across(model, 0, 30 * scale);
  const startArrow = (() => {
    const [x, y] = pointAt(model, 0.035);
    return { x, y, a: (headingAt(model, 0.035) * 180) / Math.PI };
  })();
  const chevrons = [0.2, 0.4, 0.6, 0.8].map((f) => {
    const [x, y] = pointAt(model, f);
    return { f, x, y, a: (headingAt(model, f) * 180) / Math.PI };
  });
  const out = (x: number, y: number, d: number) => {
    const dx = x - cx;
    const dy = y - cy;
    const n = Math.hypot(dx, dy) || 1;
    return [x + (dx / n) * d, y + (dy / n) * d] as const;
  };
  const startLabel = out(start.x, start.y, 60 * scale);

  return (
    <div className={`relative ${className}`}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${model.width} ${model.height}`}
        className={`block w-full h-auto ${drawn ? "track-drawn" : "track-undrawn"}`}
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

        {/* the tarmac, then the line that draws itself */}
        <path d={model.path} fill="none" stroke="var(--rule)" strokeWidth={30 * scale} strokeLinejoin="round" strokeLinecap="round" />
        <path className="track-line" d={model.path} pathLength={1} fill="none" stroke="var(--ink-soft)" strokeWidth={7 * scale} strokeLinejoin="round" strokeLinecap="round" />

        {/* the followed driver's mini-sectors, lit as the timing screens light them */}
        {snap &&
          bounds.map((b, i) =>
            marks[i] && marks[i] !== "none" ? (
              <polyline key={i} points={stretch(model, b.from, b.to)} fill="none" stroke={MARK[marks[i]]} strokeWidth={9 * scale} strokeLinecap="round" strokeLinejoin="round" className="segment-in" />
            ) : null,
          )}

        <g className="track-corner">
          {/* direction of travel round the lap */}
          {chevrons.map((c) => (
            <path
              key={c.f}
              d={`M${-6 * scale},${-6 * scale} L${2 * scale},0 L${-6 * scale},${6 * scale}`}
              transform={`translate(${c.x} ${c.y}) rotate(${c.a})`}
              fill="none"
              stroke="var(--paper)"
              strokeWidth={3 * scale}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {/* where sectors 2 and 3 begin */}
          {ends &&
            [
              { f: ends[0], label: "S2" },
              { f: ends[1], label: "S3" },
            ].map((t) => {
              const a = across(model, t.f, 22 * scale);
              const [lx, ly] = out(a.x, a.y, 48 * scale);
              return (
                <g key={t.label}>
                  <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke="var(--ink)" strokeOpacity={0.55} strokeWidth={3.5 * scale} strokeLinecap="round" />
                  <text x={lx} y={ly} dy="0.35em" textAnchor="middle" fontSize={(big ? 15 : 19) * scale} fontWeight={700} fontFamily="var(--font-mono)" fill="var(--ink-soft)">
                    {t.label}
                  </text>
                </g>
              );
            })}

          {corners &&
            model.corners.map((c) => {
              const [x, y] = out(c.x, c.y, 34 * scale);
              return (
                <text key={c.number} x={x} y={y} dy="0.35em" textAnchor="middle" fontSize={(big ? 14 : 19) * scale} fontFamily="var(--font-mono)" fill="var(--ink-faint)">
                  {c.number}
                </text>
              );
            })}

          <text x={startLabel[0]} y={startLabel[1]} dy="0.35em" textAnchor="middle" fontSize={(big ? 14 : 18) * scale} fontWeight={700} fontFamily="var(--font-mono)" fill="var(--ink)">
            {ends ? "START · S1" : "START"}
          </text>
        </g>

        {/* start / finish: chequered across the track, an arrow off the line */}
        <line x1={start.x1} y1={start.y1} x2={start.x2} y2={start.y2} stroke={`url(#chequer-${model.circuitKey})`} strokeWidth={10 * scale} />
        <path
          d={`M${-12 * scale},${-11 * scale} L${8 * scale},0 L${-12 * scale},${11 * scale} Z`}
          transform={`translate(${startArrow.x} ${startArrow.y}) rotate(${startArrow.a})`}
          fill="var(--hue-f1)"
          stroke="var(--paper)"
          strokeWidth={2.5 * scale}
          strokeLinejoin="round"
        />

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
                {mine && <circle r={r * 1.9} fill={c.colour} opacity={0.22} className="car-pulse" />}
                <circle r={mine ? r * 1.25 : r} fill={c.colour} stroke="var(--paper)" strokeWidth={3.5 * scale} />
                <text
                  x={r * 1.5}
                  y={-r * 1.2}
                  fontSize={(mine ? (big ? 19 : 24) : big ? 14 : 19) * scale}
                  fontWeight={700}
                  fontFamily="var(--font-sans)"
                  fill="var(--ink)"
                  stroke="var(--paper)"
                  strokeWidth={5 * scale}
                  paintOrder="stroke"
                >
                  {c.code}
                </text>
              </g>
            );
          })}
      </svg>
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
