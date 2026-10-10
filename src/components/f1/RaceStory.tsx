"use client";

import { useRef, useState } from "react";
import type { LiveSnapshot } from "@/lib/f1-live-types";

// The race, lap by lap: every driver's position at the end of each lap
// (F1's LapSeries). The reader's drivers and the one being followed are drawn
// in their team colour; the rest of the field stays faint behind them, and
// every line carries its driver's code at the end. Point at (or touch) any
// line and it lifts out of the field — the others fade, a guide marks the
// lap, and a card says who it is, where they were that lap and what they'd
// gained or lost since the start. Lines draw in from the start.

const W = 1000;
const ROW = 22;
const PAD = { l: 34, r: 56, t: 10, b: 26 };

type Story = NonNullable<LiveSnapshot["lapPositions"]>;

export default function RaceStory({ data, highlight, names }: { data: Story; highlight: Set<string>; names?: Record<string, string> }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ code: string; lap: number } | null>(null);
  const laps = Math.max(...data.map((d) => d.positions.length));
  const field = Math.max(...data.flatMap((d) => d.positions), data.length);
  if (laps < 2) return null;
  const H = PAD.t + PAD.b + (field - 1) * ROW;
  const x = (lap: number) => PAD.l + (lap / (laps - 1)) * (W - PAD.l - PAD.r);
  const y = (pos: number) => PAD.t + (pos - 1) * ROW;
  const lifted = hover?.code ?? null;
  // The drawing order never changes with the pointer (re-ordering would
  // restart the lines' draw-in); the lifted line is drawn again on top.
  const ordered = [...data].sort((a, b) => Number(highlight.has(a.code)) - Number(highlight.has(b.code)));
  const liftedData = lifted ? data.find((d) => d.code === lifted) : undefined;
  const ticks = Array.from({ length: laps }, (_, i) => i).filter((i) => i === 0 || (i + 1) % 10 === 0 || i === laps - 1);

  // The pointer's lap, and the driver whose line is nearest it there.
  const pointAt = (e: React.PointerEvent) => {
    const el = svgRef.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const vx = ((e.clientX - box.left) / box.width) * W;
    const vy = ((e.clientY - box.top) / box.height) * H;
    const lap = Math.min(laps - 1, Math.max(0, Math.round(((vx - PAD.l) / (W - PAD.l - PAD.r)) * (laps - 1))));
    let best: string | null = null;
    let gap = Infinity;
    for (const d of data) {
      const p = d.positions[Math.min(lap, d.positions.length - 1)];
      if (p === undefined) continue;
      const dist = Math.abs(y(p) - vy);
      if (dist < gap) {
        gap = dist;
        best = d.code;
      }
    }
    if (best && gap < ROW * 1.2) setHover({ code: best, lap });
    else setHover(null);
  };

  const card = (() => {
    if (!hover) return null;
    const d = data.find((s) => s.code === hover.code);
    if (!d) return null;
    const lap = Math.min(hover.lap, d.positions.length - 1);
    const pos = d.positions[lap];
    const startPos = d.positions[0];
    const delta = startPos - pos;
    return { d, lap, pos, startPos, delta, left: (x(lap) / W) * 100, top: (y(pos) / H) * 100 };
  })();

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full h-auto touch-pan-y select-none"
        role="img"
        aria-label="Positions lap by lap"
        onPointerMove={pointAt}
        onPointerDown={pointAt}
        onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
      >
        {[1, 5, 10, 15, 20].filter((p) => p <= field).map((p) => (
          <g key={p}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(p)} y2={y(p)} stroke="var(--rule)" strokeDasharray={p === 1 ? undefined : "2 6"} />
            <text x={PAD.l - 10} y={y(p)} dy="0.35em" textAnchor="end" fontSize="11" fontFamily="var(--font-mono)" fill="var(--ink-faint)">
              P{p}
            </text>
          </g>
        ))}
        {ticks.map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fontFamily="var(--font-mono)" fill="var(--ink-faint)">
            {i === 0 ? "Start" : `L${i}`}
          </text>
        ))}
        {card && <line x1={x(card.lap)} x2={x(card.lap)} y1={PAD.t - 6} y2={H - PAD.b + 6} stroke="var(--ink-faint)" strokeDasharray="3 4" />}
        {ordered.map((d, k) => {
          const on = highlight.has(d.code);
          const up = d.code === lifted;
          const pts = d.positions.map((p, i) => `${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(" ");
          const end = d.positions.length - 1;
          const opacity = lifted ? (up ? 1 : on ? 0.35 : 0.1) : on ? 1 : 0.28;
          return (
            <g key={d.code} style={{ transition: "opacity 0.2s ease" }}>
              <polyline
                points={pts}
                pathLength={1}
                fill="none"
                stroke={d.colour}
                strokeWidth={on ? 3 : 1.4}
                strokeOpacity={opacity}
                strokeLinejoin="round"
                strokeLinecap="round"
                className="story-line"
                style={{ animationDelay: `${on ? 300 : k * 18}ms`, transition: "stroke-opacity 0.2s ease, stroke-width 0.2s ease" }}
              />
              <circle cx={x(end)} cy={y(d.positions[end])} r={on || up ? 4.5 : 2.5} fill={d.colour} fillOpacity={lifted && !up ? 0.3 : on || up ? 1 : 0.6} />
              <text
                x={x(end) + 9}
                y={y(d.positions[end])}
                dy="0.35em"
                fontSize={on || up ? 13 : 11}
                fontWeight={on || up ? 700 : 500}
                fontFamily="var(--font-sans)"
                fill={on || up ? "var(--ink)" : "var(--ink-faint)"}
                fillOpacity={lifted && !up ? 0.45 : 1}
                style={{ cursor: "pointer" }}
                onPointerEnter={() => setHover({ code: d.code, lap: end })}
              >
                {d.code}
              </text>
            </g>
          );
        })}
        {liftedData && (
          <polyline
            points={liftedData.positions.map((p, i) => `${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(" ")}
            fill="none"
            stroke={liftedData.colour}
            strokeWidth={3.6}
            strokeLinejoin="round"
            strokeLinecap="round"
            pointerEvents="none"
          />
        )}
        {card && <circle cx={x(card.lap)} cy={y(card.pos)} r="6" fill={card.d.colour} stroke="var(--paper)" strokeWidth="2.5" />}
      </svg>
      {card && (
        <div
          className="pointer-events-none absolute z-10 rounded-xl border hairline bg-[var(--surface)] shadow-[0_18px_40px_-20px_rgba(0,0,0,0.55)] px-3 py-2 min-w-[9.5rem] animate-[fade-in_0.15s_ease]"
          style={{
            left: `${card.left}%`,
            top: `${card.top}%`,
            transform: `translate(${card.left > 62 ? "calc(-100% - 14px)" : "14px"}, ${card.top > 60 ? "calc(-100% + 8px)" : "-8px"})`,
          }}
        >
          <div className="flex items-center gap-2">
            <span className="w-[3px] h-4 rounded-full" style={{ background: card.d.colour }} />
            <span className="font-sans font-bold text-[13px]">{names?.[card.d.code] ?? card.d.code}</span>
          </div>
          <div className="mt-1 font-mono text-[11px] tabular-nums text-ink-soft">
            {card.lap === 0 ? "Grid" : `Lap ${card.lap}`} · <span className="text-ink font-semibold">P{card.pos}</span>
          </div>
          {card.lap > 0 && (
            <div className="font-mono text-[10.5px] tabular-nums" style={{ color: card.delta > 0 ? "var(--up)" : card.delta < 0 ? "var(--down)" : "var(--ink-faint)" }}>
              {card.delta > 0 ? `▲ ${card.delta} from P${card.startPos}` : card.delta < 0 ? `▼ ${-card.delta} from P${card.startPos}` : `Held P${card.startPos}`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
