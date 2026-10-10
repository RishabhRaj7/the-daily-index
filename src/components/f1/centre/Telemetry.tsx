"use client";

import { useEffect, useState } from "react";
import type { CarNow, LapTrace, LiveSnapshot } from "@/lib/f1-live-types";
import { Empty } from "./ui";

// The followed driver's telemetry, beside the map: speed, gear, revs,
// throttle, brake and DRS now, and the lap drawn out — speed as a line, the
// throttle as a band beneath it, braking marked in red.
//
//   replay    the lap in progress at the replay's moment (F1's archive,
//             /api/f1/telemetry), redrawn as it plays
//   finished  their fastest lap of the session
//   live      F1's latest reading with each 5-second read, and the last few
//             minutes of those readings as the line

type Sample = number[]; // [s, km/h, throttle %, brake 0/1, gear, rpm, drs 0/1]

function useTrace(path: string | null, code: string | null, t: number | null): LapTrace | null {
  const [trace, setTrace] = useState<{ key: string; trace: LapTrace | null } | null>(null);
  // A replay asks again every couple of seconds of session time.
  const step = t === null ? null : Math.floor(t / 2) * 2;
  const key = `${path}|${code}|${step}`;
  useEffect(() => {
    if (!path || !code) return;
    let live = true;
    const q = new URLSearchParams({ session: path, code, ...(step !== null ? { t: String(step) } : {}) });
    fetch(`/api/f1/telemetry?${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { trace: LapTrace | null } | null) => live && setTrace({ key, trace: d?.trace ?? null }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [path, code, step, key]);
  // Keep the last trace on screen while the next is on its way (same driver).
  return trace && trace.key.split("|")[1] === code ? trace.trace : null;
}

/** Live: each read's reading for the driver, kept for the last few minutes. */
function useLiveHistory(snap: LiveSnapshot, code: string | null): Sample[] {
  const [hist, setHist] = useState<{ at: number; cars: Record<string, { at: number; r: CarNow }[]> }>({ at: 0, cars: {} });
  const at = Date.parse(snap.at);
  // A new read: add its readings (worked out while rendering, not in an effect).
  if (snap.telemetry && at !== hist.at) {
    const cars: Record<string, { at: number; r: CarNow }[]> = {};
    for (const [c, r] of Object.entries(snap.telemetry)) cars[c] = [...(hist.cars[c] ?? []), { at, r }].filter((x) => at - x.at < 4 * 60_000);
    setHist({ at, cars });
  }
  const list = (code && hist.cars[code]) || [];
  const start = list[0]?.at ?? at;
  return list.map((x) => [(x.at - start) / 1000, x.r.speed, x.r.throttle, x.r.brake ? 1 : 0, x.r.gear, x.r.rpm, x.r.drs === "open" ? 1 : 0]);
}

function Gauge({ label, value, unit, children }: { label: string; value: React.ReactNode; unit?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border hairline px-3 py-2 min-w-0">
      <div className="font-label text-[8px] text-ink-faint">{label}</div>
      <div className="font-display font-extrabold text-[1.45rem] leading-none mt-1 tabular-nums">
        {value}
        {unit && <span className="font-mono font-normal text-[9.5px] text-ink-soft ml-1">{unit}</span>}
      </div>
      {children}
    </div>
  );
}

function Bar({ value, colour }: { value: number; colour: string }) {
  return (
    <span className="block h-[5px] rounded-full mt-1.5 bg-[var(--rule)] overflow-hidden">
      <span className="block h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: colour }} />
    </span>
  );
}

function Readout({ now, colour }: { now: CarNow; colour: string }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-2 gap-2">
      <Gauge label="Speed" value={now.speed} unit="km/h" />
      <Gauge label="Gear" value={now.gear || "N"} />
      <Gauge label="Revs" value={(now.rpm / 1000).toFixed(1)} unit="k rpm">
        <Bar value={(now.rpm / 13000) * 100} colour={colour} />
      </Gauge>
      <Gauge label="Throttle" value={now.throttle} unit="%">
        <Bar value={now.throttle} colour="var(--f1-personal)" />
      </Gauge>
      <Gauge label="Brake" value={<span style={{ color: now.brake ? "var(--down)" : "var(--ink-faint)" }}>{now.brake ? "On" : "Off"}</span>} />
      <Gauge label="DRS" value={<span style={{ color: now.drs === "open" ? "var(--f1-personal)" : now.drs === "eligible" ? "var(--f1-slower)" : "var(--ink-faint)" }}>{now.drs === "open" ? "Open" : now.drs === "eligible" ? "Ready" : "Shut"}</span>} />
    </div>
  );
}

function Chart({ samples, colour, axis, hover, setHover }: { samples: Sample[]; colour: string; axis: string; hover: number | null; setHover: (i: number | null) => void }) {
  const W = 720;
  const H = 210;
  const pad = { l: 34, r: 8, t: 8, b: 22 };
  const band = 16; // the throttle band and the brake marks, under the speed
  const end = Math.max(1, samples.at(-1)?.[0] ?? 1);
  const top = Math.max(320, ...samples.map((s) => s[1]));
  const x = (s: number) => pad.l + (s / end) * (W - pad.l - pad.r);
  const speedH = H - pad.t - pad.b - band * 2 - 8;
  const y = (v: number) => pad.t + speedH - (v / top) * speedH;
  const line = samples.map((s, i) => `${i ? "L" : "M"}${x(s[0]).toFixed(1)},${y(s[1]).toFixed(1)}`).join("");
  const throttleY = pad.t + speedH + 6;
  const brakeY = throttleY + band + 2;
  const h = hover !== null ? (samples[hover] ?? null) : null;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block w-full h-auto select-none"
      role="img"
      aria-label="Speed, throttle and braking through the lap"
      onPointerMove={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        const s = ((e.clientX - box.left) / box.width) * W;
        const at = ((s - pad.l) / (W - pad.l - pad.r)) * end;
        let best = 0;
        samples.forEach((p, i) => {
          if (Math.abs(p[0] - at) < Math.abs(samples[best][0] - at)) best = i;
        });
        setHover(best);
      }}
      onPointerLeave={() => setHover(null)}
    >
      {[100, 200, 300].map((v) =>
        v <= top ? (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--rule)" strokeDasharray="2 6" />
            <text x={pad.l - 6} y={y(v)} dy="0.35em" textAnchor="end" fontSize="10" fontFamily="var(--font-mono)" fill="var(--ink-faint)">
              {v}
            </text>
          </g>
        ) : null,
      )}
      <path d={line} fill="none" stroke={colour} strokeWidth="2.2" strokeLinejoin="round" />
      {/* throttle: a band that fills with the pedal */}
      <text x={pad.l - 6} y={throttleY + band / 2} dy="0.35em" textAnchor="end" fontSize="9" fontFamily="var(--font-mono)" fill="var(--ink-faint)">
        THR
      </text>
      {samples.map((s, i) => {
        const next = samples[i + 1]?.[0] ?? s[0];
        const w = Math.max(0.8, x(next) - x(s[0]));
        return (
          <g key={i}>
            <rect x={x(s[0])} y={throttleY + band * (1 - s[2] / 100)} width={w} height={(band * s[2]) / 100} fill="var(--f1-personal)" opacity="0.75" />
            {s[3] ? <rect x={x(s[0])} y={brakeY} width={w} height={band * 0.6} fill="var(--down)" /> : null}
          </g>
        );
      })}
      <text x={pad.l - 6} y={brakeY + band * 0.3} dy="0.35em" textAnchor="end" fontSize="9" fontFamily="var(--font-mono)" fill="var(--ink-faint)">
        BRK
      </text>
      <text x={W - pad.r} y={H - 4} textAnchor="end" fontSize="10" fontFamily="var(--font-mono)" fill="var(--ink-faint)">
        {axis}
      </text>
      {h && (
        <g pointerEvents="none">
          <line x1={x(h[0])} x2={x(h[0])} y1={pad.t} y2={brakeY + band} stroke="var(--ink)" strokeOpacity="0.4" />
          <circle cx={x(h[0])} cy={y(h[1])} r="4" fill={colour} stroke="var(--paper)" strokeWidth="2" />
          <text
            x={Math.min(W - 150, x(h[0]) + 8)}
            y={pad.t + 12}
            fontSize="11"
            fontFamily="var(--font-mono)"
            fill="var(--ink)"
            stroke="var(--paper)"
            strokeWidth="4"
            paintOrder="stroke"
          >
            {`${h[0].toFixed(1)} s`}
          </text>
        </g>
      )}
    </svg>
  );
}

export default function Telemetry({ snap, code, live, replayT }: { snap: LiveSnapshot; code: string | null; live: boolean; replayT: number | null }) {
  const row = snap.rows.find((r) => r.code === code);
  const colour = row?.colour ?? "var(--ink)";
  const archived = !live && !!snap.path;
  const trace = useTrace(archived ? snap.path : null, code, archived ? replayT : null);
  const history = useLiveHistory(snap, live ? code : null);
  const [hover, setHover] = useState<number | null>(null);
  if (!code || !row) return <Empty>Pick a driver in the order to see their telemetry.</Empty>;

  const samples: Sample[] = live ? history : (trace?.samples ?? []);
  // Pointing at the lap shows that moment in the readout; otherwise, the latest.
  const at = hover !== null ? samples[hover] : null;
  const latest: CarNow | null = live ? (snap.telemetry?.[code] ?? null) : (trace?.now ?? null);
  const now: CarNow | null = at ? { speed: at[1], throttle: at[2], brake: !!at[3], gear: at[4], rpm: at[5], drs: at[6] ? "open" : "off" } : latest;
  const axis = live ? "seconds, the last few minutes (a reading every 5 s)" : `seconds into the lap${trace?.lapTime ? ` · ${trace.lapTime}` : ""}`;

  if (!now && samples.length < 2) return <Empty>{live ? "F1 isn't sending car data for this session yet." : "Reading the car data…"}</Empty>;
  return (
    <div className="grid lg:grid-cols-[15rem_minmax(0,1fr)] gap-4 items-start">
      {now && <Readout now={now} colour={colour} />}
      {samples.length >= 2 ? <Chart samples={samples} colour={colour} axis={axis} hover={hover} setHover={setHover} /> : <Empty>The lap draws as readings come in.</Empty>}
    </div>
  );
}

/** What the panel's header says about where the numbers come from. */
export function telemetryMeta(live: boolean, replay: boolean, code: string | null): string {
  if (!code) return "";
  return live ? `${code} · live, every 5 s` : replay ? `${code} · the lap in progress` : `${code} · fastest lap of the session`;
}
