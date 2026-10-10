"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LiveSnapshot, SegmentMark, TrackModel } from "@/lib/f1-live-types";
import { estimateCars, pointAt, segmentBounds, segmentMarks } from "@/lib/f1-track-progress";

// The circuit as a vector: it draws itself when it comes into view; during a
// session it carries the field (each car's place estimated from the timing
// loops — lib/f1-track-progress.ts) and lights the focused driver's
// mini-sectors purple, green or yellow along the track.

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

export default function TrackMap({
  model,
  snap = null,
  focus = null,
  onFocus,
  corners = true,
  className = "",
  label,
}: {
  model: TrackModel;
  snap?: LiveSnapshot | null;
  /** The driver whose mini-sectors colour the track. */
  focus?: string | null;
  onFocus?: (code: string) => void;
  corners?: boolean;
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
  const [p0, p1] = [model.points[0], model.points[Math.min(3, model.points.length - 1)]];
  const dir = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
  const normal = [Math.cos(dir + Math.PI / 2), Math.sin(dir + Math.PI / 2)];
  const cx = model.width / 2;
  const cy = model.height / 2;

  const cars = useMemo(() => (snap ? estimateCars(snap, model) : []), [snap, model]);
  const focusRow = snap?.rows.find((r) => r.code === focus);
  const bounds = useMemo(() => (snap ? segmentBounds(snap) : []), [snap]);
  // Mini-sectors light only while the session runs (afterwards they'd show
  // whatever lap each car was on when it came in).
  const marks = snap?.running ? segmentMarks(focusRow) : [];

  // Cars: carried on between reads at lap pace, eased towards their
  // estimate, moved by transform (no re-render per frame).
  const carRefs = useRef(new Map<string, SVGGElement>());
  const shown = useRef(new Map<string, number>());
  useEffect(() => {
    if (!snap || cars.length === 0) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const readAt = Date.parse(snap.at);
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const elapsed = Math.max(0, (Date.now() - readAt) / 1000);
      for (const c of cars) {
        const el = carRefs.current.get(c.code);
        if (!el) continue;
        const target = c.progress + Math.min(c.room * 0.92, elapsed / c.pace);
        let cur = shown.current.get(c.code);
        if (cur === undefined || reduced) cur = target;
        else {
          const delta = ((target - cur + 1.5) % 1) - 0.5;
          cur += delta * Math.min(1, dt * 3);
        }
        shown.current.set(c.code, cur);
        const [x, y] = pointAt(model, cur);
        el.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      }
      if (!reduced) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [snap, cars, model]);

  const r = 13 * scale;
  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${model.width} ${model.height}`}
      className={`block w-full h-auto ${drawn ? "track-drawn" : "track-undrawn"} ${className}`}
      role="img"
      aria-label={label ?? `${model.name} circuit map`}
    >
      {/* the tarmac, then the line that draws itself */}
      <path d={model.path} fill="none" stroke="var(--rule)" strokeWidth={30 * scale} strokeLinejoin="round" strokeLinecap="round" />
      <path className="track-line" d={model.path} pathLength={1} fill="none" stroke="var(--ink-soft)" strokeWidth={7 * scale} strokeLinejoin="round" strokeLinecap="round" />

      {/* the focused driver's mini-sectors, lit as the timing screens light them */}
      {snap &&
        bounds.map((b, i) =>
          marks[i] && marks[i] !== "none" ? (
            <polyline key={i} points={stretch(model, b.from, b.to)} fill="none" stroke={MARK[marks[i]]} strokeWidth={9 * scale} strokeLinecap="round" strokeLinejoin="round" className="segment-in" />
          ) : null,
        )}

      {/* start/finish line */}
      <line
        x1={p0[0] - normal[0] * 26 * scale}
        y1={p0[1] - normal[1] * 26 * scale}
        x2={p0[0] + normal[0] * 26 * scale}
        y2={p0[1] + normal[1] * 26 * scale}
        stroke="var(--ink)"
        strokeWidth={6 * scale}
        strokeLinecap="round"
      />

      {corners &&
        model.corners.map((c) => {
          const dx = c.x - cx;
          const dy = c.y - cy;
          const d = Math.hypot(dx, dy) || 1;
          return (
            <text
              key={c.number}
              x={c.x + (dx / d) * 34 * scale}
              y={c.y + (dy / d) * 34 * scale}
              dy="0.35em"
              textAnchor="middle"
              fontSize={21 * scale}
              fontFamily="var(--font-mono)"
              fill="var(--ink-faint)"
              className="track-corner"
            >
              {c.number}
            </text>
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
                // Placed once on arrival; the animation loop moves it after.
                if (!el.getAttribute("transform")) {
                  const [x, y] = pointAt(model, c.progress);
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
                fontSize={(mine ? 24 : 19) * scale}
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
  );
}
