"use client";

import { useId } from "react";
import { moonPhase, type SkyClock } from "@/lib/sky";

// Where the sun — or after sunset, the moon — is in the sky, drawn as an arc.
// By day the arc runs sunrise → sunset; by night it runs sunset → sunrise,
// with stars and the moon in tonight's phase. The travelled part draws in
// and the body rolls up to its place when the module scrolls in.

// Fixed star field (x, y, r) above the horizon line.
const STARS: Array<[number, number, number]> = [
  [18, 22, 0.9], [34, 48, 0.6], [52, 14, 0.7], [66, 38, 0.5], [84, 8, 0.8], [96, 52, 0.5],
  [118, 12, 0.6], [132, 40, 0.9], [146, 20, 0.5], [162, 50, 0.7], [176, 16, 0.6], [190, 36, 0.8],
  [44, 76, 0.5], [158, 78, 0.5], [110, 70, 0.4], [74, 64, 0.4],
];

function hm(minutes: number): string {
  const m = Math.round(minutes);
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export default function SunArc({
  sunrise,
  sunset,
  clock,
}: {
  sunrise: string;
  sunset: string;
  /** Null while server rendering: the sun waits at noon. */
  clock: SkyClock | null;
}) {
  const maskId = useId();
  const night = clock ? !clock.isDay : false;
  const progress = clock ? clock.progress : 0.5;
  // 0 = the left horizon, 180 = the right one.
  const angle = -90 + progress * 180;
  const moon = moonPhase();
  // The shadow disc slides across the lit one: centred at new moon, gone at full.
  const waxing = moon.phase < 0.5;
  const shadowDx = (waxing ? -1 : 1) * 16.8 * moon.illumination;

  return (
    <div>
      <svg
        viewBox="0 0 200 110"
        className="w-full overflow-visible"
        role="img"
        aria-label={
          night
            ? `Night: sunset ${sunset}, sunrise ${sunrise}, ${moon.name}`
            : `Sunrise ${sunrise}, sunset ${sunset}`
        }
      >
        {night && (
          <g className="stars" aria-hidden>
            {STARS.map(([x, y, r], i) => (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={r}
                fill="var(--ink)"
                className="star"
                style={{ animationDelay: `${(i * 0.37) % 3}s` }}
              />
            ))}
          </g>
        )}
        <line x1="4" y1="100" x2="196" y2="100" stroke="var(--rule)" strokeWidth="1" />
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="var(--rule)" strokeWidth="1.5" strokeDasharray="2 4" />
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="var(--section-hue, var(--accent))"
          strokeWidth="2.5"
          strokeLinecap="round"
          pathLength={1}
          className="stroke-draw"
          style={{ ["--len" as string]: 1, strokeDasharray: `${progress} 2` }}
        />
        <g className="sun-orbit" style={{ ["--sun" as string]: `${angle}deg` }}>
          {night ? (
            <>
              <defs>
                <mask id={maskId}>
                  <circle cx="100" cy="20" r="8" fill="white" />
                  <circle cx={100 + shadowDx} cy="20" r="8.4" fill="black" />
                </mask>
              </defs>
              <circle cx="100" cy="20" r="15" fill="var(--section-hue, var(--accent))" opacity="0.14" />
              {/* The dark side, faintly, then the lit part on top. */}
              <circle cx="100" cy="20" r="8" fill="var(--ink-faint)" opacity="0.35" />
              <circle cx="100" cy="20" r="8" fill="var(--section-hue, var(--accent))" mask={`url(#${maskId})`} />
            </>
          ) : (
            <>
              <circle cx="100" cy="20" r="14" fill="var(--section-hue, var(--accent))" opacity="0.18" />
              <circle cx="100" cy="20" r="7" fill="var(--section-hue, var(--accent))" />
            </>
          )}
        </g>
      </svg>
      <div className="flex justify-between gap-2 font-mono text-[11px] text-ink-soft -mt-1">
        {night ? (
          <>
            <span>↓ {sunset}</span>
            <span className="text-ink-faint text-center">
              {clock ? `${hm(clock.span * (1 - clock.progress))} to sunrise · ` : ""}{moon.name}
            </span>
            <span>{sunrise} ↑</span>
          </>
        ) : (
          <>
            <span>↑ {sunrise}</span>
            <span className="text-ink-faint">{clock ? `${hm(clock.span * (1 - clock.progress))} to sunset` : ""}</span>
            <span>{sunset} ↓</span>
          </>
        )}
      </div>
    </div>
  );
}
