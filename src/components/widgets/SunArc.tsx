"use client";

import { useSyncExternalStore } from "react";

// Where the sun is between today's sunrise and sunset, drawn as an arc.
// The travelled part of the arc draws in and the sun rolls up to its place
// when the module scrolls in. After dark the sun sits below the horizon.

function parseClock(label: string): number | null {
  const m = label.trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)?$/i);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (!m[3]) h = Number(m[1]);
  else if (m[3].toUpperCase() === "PM") h += 12;
  return h * 60 + Number(m[2]);
}

// Minutes since midnight, refreshed each minute; null on the server.
function subscribe(cb: () => void) {
  const id = window.setInterval(cb, 60_000);
  return () => window.clearInterval(id);
}
const nowMinutes = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

export default function SunArc({ sunrise, sunset }: { sunrise: string; sunset: string }) {
  const now = useSyncExternalStore(subscribe, nowMinutes, () => null);
  const rise = parseClock(sunrise);
  const set = parseClock(sunset);
  if (rise === null || set === null || set <= rise) return null;

  const f = now === null ? 0.5 : (now - rise) / (set - rise);
  const up = f >= 0 && f <= 1;
  const clamped = Math.min(1, Math.max(0, f));
  // 0 = sunrise (pointing left), 180 = sunset (pointing right).
  const angle = -90 + clamped * 180;
  const daylight = set - rise;

  return (
    <div>
      <svg viewBox="0 0 200 110" className="w-full overflow-visible" role="img" aria-label={`Sunrise ${sunrise}, sunset ${sunset}`}>
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
          style={{ ["--len" as string]: 1, strokeDasharray: `${clamped} 2` }}
        />
        <g className="sun-orbit" style={{ ["--sun" as string]: `${angle}deg` }}>
          <circle cx="100" cy="20" r="14" fill="var(--section-hue, var(--accent))" opacity="0.18" />
          <circle cx="100" cy="20" r="7" fill={up ? "var(--section-hue, var(--accent))" : "var(--ink-faint)"} />
        </g>
      </svg>
      <div className="flex justify-between font-mono text-[11px] text-ink-soft -mt-1">
        <span>↑ {sunrise}</span>
        <span className="text-ink-faint">
          {Math.floor(daylight / 60)}h {daylight % 60}m of light
        </span>
        <span>{sunset} ↓</span>
      </div>
    </div>
  );
}
