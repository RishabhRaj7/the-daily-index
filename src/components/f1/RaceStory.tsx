"use client";

import type { LiveSnapshot } from "@/lib/f1-live-types";

// The race, lap by lap: every driver's position at the end of each lap
// (F1's LapSeries). The reader's drivers and the one being followed are drawn
// in their team colour and labelled at the end; the rest of the field stays
// faint behind them. Lines draw in from the start.

const W = 1000;
const ROW = 22;
const PAD = { l: 34, r: 56, t: 10, b: 26 };

export default function RaceStory({ data, highlight }: { data: NonNullable<LiveSnapshot["lapPositions"]>; highlight: Set<string> }) {
  const laps = Math.max(...data.map((d) => d.positions.length));
  const field = Math.max(...data.flatMap((d) => d.positions), data.length);
  if (laps < 2) return null;
  const H = PAD.t + PAD.b + (field - 1) * ROW;
  const x = (lap: number) => PAD.l + (lap / (laps - 1)) * (W - PAD.l - PAD.r);
  const y = (pos: number) => PAD.t + (pos - 1) * ROW;
  const ordered = [...data].sort((a, b) => Number(highlight.has(a.code)) - Number(highlight.has(b.code)));
  const ticks = Array.from({ length: laps }, (_, i) => i).filter((i) => i === 0 || (i + 1) % 10 === 0 || i === laps - 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto" role="img" aria-label="Positions lap by lap">
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
      {ordered.map((d, k) => {
        const on = highlight.has(d.code);
        const pts = d.positions.map((p, i) => `${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(" ");
        const end = d.positions.length - 1;
        return (
          <g key={d.code}>
            <polyline
              points={pts}
              pathLength={1}
              fill="none"
              stroke={d.colour}
              strokeWidth={on ? 3 : 1.4}
              strokeOpacity={on ? 1 : 0.28}
              strokeLinejoin="round"
              strokeLinecap="round"
              className="story-line"
              style={{ animationDelay: `${on ? 300 : k * 18}ms` }}
            />
            {on && (
              <>
                <circle cx={x(end)} cy={y(d.positions[end])} r="4.5" fill={d.colour} />
                <text x={x(end) + 9} y={y(d.positions[end])} dy="0.35em" fontSize="13" fontWeight="700" fontFamily="var(--font-sans)" fill="var(--ink)">
                  {d.code}
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
