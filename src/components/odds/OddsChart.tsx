"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Straw Poll's chart: each contender's chance over time as its own line
// (the leader in the section's colour, the rest in quieter ones), a
// legend that doubles as today's reading, a crosshair that reads every
// line at once, and numbered pins where a headline lines up with a jump.

export interface ChartSeries {
  name: string;
  points: Array<[number, number]>;
}
export interface ChartPin {
  t: number;
  n: number;
  title: string;
}

export const SERIES_COLORS = ["var(--section-hue)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];

const PAD = { top: 10, right: 42, bottom: 22, left: 30 };

function niceStep(span: number): number {
  return span > 60 ? 25 : span > 30 ? 10 : span > 12 ? 5 : 2;
}

export default function OddsChart({
  series,
  height = 220,
  pins = [],
  range = "1w",
  colors = SERIES_COLORS,
}: {
  series: ChartSeries[];
  height?: number;
  pins?: ChartPin[];
  range?: "1d" | "1w" | "1m" | "all";
  colors?: string[];
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { x, y, t0, t1, ticks, lo, hi } = useMemo(() => {
    const all = series.flatMap((s) => s.points);
    const t0 = Math.min(...all.map((p) => p[0]));
    const t1 = Math.max(...all.map((p) => p[0]));
    let lo = Math.min(...all.map((p) => p[1]));
    let hi = Math.max(...all.map((p) => p[1]));
    const pad = Math.max(4, (hi - lo) * 0.12);
    lo = Math.max(0, lo - pad);
    hi = Math.min(100, hi + pad);
    if (hi - lo < 12) {
      const mid = (hi + lo) / 2;
      lo = Math.max(0, mid - 6);
      hi = Math.min(100, mid + 6);
    }
    const step = niceStep(hi - lo);
    const ticks: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
    const x = (t: number) => PAD.left + ((t - t0) / Math.max(1, t1 - t0)) * (width - PAD.left - PAD.right);
    const y = (p: number) => PAD.top + (1 - (p - lo) / Math.max(1, hi - lo)) * (height - PAD.top - PAD.bottom);
    return { x, y, t0, t1, ticks, lo, hi };
  }, [series, width, height]);

  if (series.length === 0) return null;

  const fmtT = (t: number) =>
    range === "1d"
      ? new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })
      : new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(range === "all" ? { year: "2-digit" } : {}), timeZone: "Asia/Kolkata" });
  const xTicks = [0, 1 / 3, 2 / 3, 1].map((f) => t0 + f * (t1 - t0));
  const lead = series[0];
  const at = (s: ChartSeries, t: number) => s.points.reduce((b, p) => (Math.abs(p[0] - t) < Math.abs(b[0] - t) ? p : b), s.points[0]);
  const hoverT = hover != null ? at(lead, hover)[0] : null;

  // Today's reading at each line's end, nudged apart so they don't collide.
  const ends = series
    .map((s, i) => ({ i, p: s.points[s.points.length - 1][1], y: y(s.points[s.points.length - 1][1]) }))
    .sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 13) ends[k].y = ends[k - 1].y + 13;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const f = Math.min(1, Math.max(0, (px - PAD.left) / (width - PAD.left - PAD.right)));
    setHover(t0 + f * (t1 - t0));
  };

  return (
    <div ref={box} className="relative select-none">
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 font-sans text-[12px]">
        {series.map((s, i) => {
          const v = hoverT != null ? at(s, hoverT)[1] : s.points[s.points.length - 1][1];
          return (
            <span key={s.name} className="inline-flex items-center gap-1.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colors[i] }} />
              <span className={`truncate max-w-[12rem] ${i === 0 ? "font-semibold" : "text-ink-soft"}`}>{s.name}</span>
              <span className="font-mono tabular-nums">{Math.round(v)}%</span>
            </span>
          );
        })}
        {hoverT != null && <span className="font-mono text-[11px] text-ink-faint ml-auto">{new Date(hoverT).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })} IST</span>}
      </div>
      <svg
        width={width}
        height={height}
        className="block touch-none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`${lead.name}: ${Math.round(lead.points[lead.points.length - 1][1])}% now, between ${Math.round(lo)} and ${Math.round(hi)}% over the period`}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--rule)" strokeDasharray={v === 50 ? "0" : "2 4"} />
            <text x={PAD.left - 6} y={y(v) + 3} textAnchor="end" className="fill-[color:var(--ink-faint)] font-mono" fontSize={9}>
              {v}%
            </text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text key={i} x={x(t)} y={height - 6} textAnchor={i === 0 ? "start" : i === 3 ? "end" : "middle"} className="fill-[color:var(--ink-faint)] font-mono" fontSize={9}>
            {fmtT(t)}
          </text>
        ))}
        {[...series].reverse().map((s, ri) => {
          const i = series.length - 1 - ri;
          const d = s.points.map((p, k) => `${k ? "L" : "M"}${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(" ");
          return <path key={s.name} d={d} fill="none" stroke={colors[i]} strokeWidth={i === 0 ? 2.2 : 1.5} strokeLinejoin="round" opacity={i === 0 ? 1 : 0.85} />;
        })}
        {ends.map((e) => (
          <g key={e.i}>
            <circle cx={x(series[e.i].points[series[e.i].points.length - 1][0])} cy={y(e.p)} r={3} fill={colors[e.i]} />
            <text x={width - PAD.right + 6} y={e.y + 3} className="font-mono" fontSize={10} fontWeight={e.i === 0 ? 700 : 400} fill={colors[e.i]}>
              {Math.round(e.p)}%
            </text>
          </g>
        ))}
        {pins.map((p) => {
          const pt = at(lead, p.t);
          return (
            <g key={p.n}>
              <line x1={x(pt[0])} x2={x(pt[0])} y1={PAD.top} y2={height - PAD.bottom} stroke="var(--ink-faint)" strokeDasharray="1 3" />
              <circle cx={x(pt[0])} cy={y(pt[1])} r={8} fill="var(--surface)" stroke="var(--ink)" strokeWidth={1.2} />
              <text x={x(pt[0])} y={y(pt[1]) + 3.5} textAnchor="middle" fontSize={10} fontWeight={700} className="fill-[color:var(--ink)] font-mono">
                {p.n}
              </text>
              <title>{p.title}</title>
            </g>
          );
        })}
        {hoverT != null && (
          <g pointerEvents="none">
            <line x1={x(hoverT)} x2={x(hoverT)} y1={PAD.top} y2={height - PAD.bottom} stroke="var(--ink-soft)" strokeWidth={1} />
            {series.map((s, i) => (
              <circle key={s.name} cx={x(hoverT)} cy={y(at(s, hoverT)[1])} r={3.5} fill="var(--surface)" stroke={colors[i]} strokeWidth={2} />
            ))}
          </g>
        )}
      </svg>
    </div>
  );
}

/**
 * Headlines that line up with a jump: for each story, the leader's move
 * from just before it to twelve hours after; the two biggest (3+ points,
 * half a day apart) become numbered pins.
 */
export function pinsFor(lead: ChartSeries | undefined, items: Array<{ title: string; at: string }>): Array<ChartPin & { move: number }> {
  if (!lead || lead.points.length < 4) return [];
  const pts = lead.points;
  const near = (t: number) => pts.reduce((b, p) => (Math.abs(p[0] - t) < Math.abs(b[0] - t) ? p : b), pts[0]);
  const t0 = pts[0][0];
  const t1 = pts[pts.length - 1][0];
  const scored = items
    .map((n) => ({ t: Date.parse(n.at), title: n.title }))
    .filter((n) => n.t >= t0 && n.t <= t1)
    .map((n) => ({ ...n, move: near(n.t + 12 * 3_600_000)[1] - near(n.t - 3_600_000)[1] }))
    .filter((n) => Math.abs(n.move) >= 3)
    .sort((a, b) => Math.abs(b.move) - Math.abs(a.move));
  const out: Array<ChartPin & { move: number }> = [];
  for (const n of scored) {
    if (out.length >= 2) break;
    if (out.some((o) => Math.abs(o.t - n.t) < 12 * 3_600_000)) continue;
    out.push({ t: n.t, n: out.length + 1, title: n.title, move: n.move });
  }
  return out.sort((a, b) => a.t - b.t).map((p, i) => ({ ...p, n: i + 1 }));
}
