"use client";


import type { LiveSnapshot } from "@/lib/f1-live-types";
import type { DriverTally, TallyKey } from "@/lib/f1-race-control";
import { TeamGlyph } from "../LiveTiming";
import { clock } from "./ui";

// The stewards, per driver: everything race control has said about each one
// this session, counted (lib/f1-race-control.ts, stewardsTally), for every
// session, practice to race. A tap on a row lists the messages behind it. Read
// up to the current lap, so it follows a replay as it plays.

const COLUMNS: { key: TallyKey; label: string; tip: string; colour: string }[] = [
  { key: "limits", label: "Track limits", tip: "Laps or times deleted for track limits", colour: "#fbbf24" },
  { key: "deleted", label: "Other deletions", tip: "Laps or times deleted for anything else (yellow flags, red flags)", colour: "var(--ink)" },
  { key: "blackWhite", label: "Black and white flag", tip: "Shown the black and white flag: a warning on track", colour: "var(--ink)" },
  { key: "warnings", label: "Warnings", tip: "Warnings from the stewards", colour: "#facc15" },
  { key: "noted", label: "Noted", tip: "Incidents race control noted", colour: "var(--ink)" },
  { key: "investigated", label: "Investigated", tip: "Incidents taken under investigation, now or after the session", colour: "#60a5fa" },
  { key: "cleared", label: "No further action", tip: "Incidents closed with no further action", colour: "var(--up)" },
  { key: "reprimands", label: "Reprimands", tip: "Reprimands: on the record, three in a season brings a grid penalty", colour: "#fb923c" },
  { key: "penalties", label: "Penalties", tip: "Time, drive-through, stop-and-go and grid penalties", colour: "var(--down)" },
];
const COLOUR = Object.fromEntries(COLUMNS.map((c) => [c.key, c.colour])) as Record<TallyKey, string>;
const LABEL = Object.fromEntries(COLUMNS.map((c) => [c.key, c.label])) as Record<TallyKey, string>;

/** One mark per column, drawn alike: a 16-unit grid, 1.5 strokes, round ends, currentColor. */
export function StewardIcon({ k, size = 15, className = "" }: { k: TallyKey; size?: number; className?: string }) {
  const p = { stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  const draw: Record<TallyKey, React.ReactNode> = {
    // beyond the white line: a dashed kerb and a car outside it
    limits: (
      <>
        <path d="M2.5 13.5C2.5 7.5 7.5 2.5 13.5 2.5" {...p} strokeWidth={1.8} strokeDasharray="2.4 2" />
        <circle cx="11.2" cy="10.2" r="2.4" fill="currentColor" />
      </>
    ),
    // a lap time struck out
    deleted: (
      <>
        <circle cx="8" cy="9" r="5" {...p} />
        <path d="M8 2.2v1.8M6.6 2.2h2.8M8 9V6.6" {...p} />
        <path d="M3 14 13 4" {...p} />
      </>
    ),
    // the flag, half black and half white
    blackWhite: (
      <>
        <path d="M3.5 14V2.5" {...p} />
        <path d="M3.5 3h9.2l-1.7 3 1.7 3H3.5z" {...p} />
        <path d="M3.5 3h9.2L3.5 9z" fill="currentColor" />
      </>
    ),
    // a warning triangle
    warnings: (
      <>
        <path d="M8 2.6 14 13H2z" {...p} />
        <path d="M8 6.6v2.8" {...p} />
        <circle cx="8" cy="11.3" r="0.85" fill="currentColor" />
      </>
    ),
    // seen and noted
    noted: (
      <>
        <path d="M1.8 8s2.3-4.2 6.2-4.2S14.2 8 14.2 8 11.9 12.2 8 12.2 1.8 8 1.8 8z" {...p} />
        <circle cx="8" cy="8" r="1.8" {...p} />
      </>
    ),
    // looked into
    investigated: (
      <>
        <circle cx="7" cy="7" r="4.2" {...p} />
        <path d="m10.2 10.2 3.5 3.5" {...p} />
      </>
    ),
    // closed, nothing more
    cleared: (
      <>
        <circle cx="8" cy="8" r="5.8" {...p} />
        <path d="m5.4 8.2 1.8 1.8 3.4-3.7" {...p} />
      </>
    ),
    // a word from the stewards, on the record
    reprimands: (
      <>
        <path d="M2.8 3.2h10.4v7H7.6l-3 2.6v-2.6H2.8z" {...p} />
        <path d="M8 5.2v2.1" {...p} />
        <circle cx="8" cy="8.9" r="0.8" fill="currentColor" />
      </>
    ),
    // the gavel
    penalties: (
      <>
        <rect x="6.6" y="1.6" width="6.6" height="3.4" rx="0.9" transform="rotate(45 9.9 3.3)" {...p} />
        <path d="m7.9 7.4-4.9 4.9" {...p} />
        <path d="M8.6 14h5" {...p} />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} className={className} aria-hidden="true">
      {draw[k]}
    </svg>
  );
}

/** Every message race control sent about one driver, newest first, with the penalties as given. */
export function StewardDetails({ t }: { t: DriverTally }) {
  return (
    <div className="py-2.5 pl-1 pr-2">
      {t.penalties.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {t.penalties.map((p, i) => (
            <span key={i} className="font-mono text-[10.5px] rounded-full border px-2 py-[2px]" style={{ borderColor: "var(--down)", color: p.served ? "var(--ink-soft)" : "var(--down)" }}>
              {p.what}
              {p.served ? " · served" : ""}
            </span>
          ))}
        </div>
      )}
      <ol className="space-y-1.5">
        {t.events.map((e, i) => (
          <li key={i} className="grid grid-cols-[1rem_3.4rem_minmax(0,1fr)] items-start gap-2 text-[12px]">
            <span className="pt-[1px]" style={{ color: COLOUR[e.key] }} title={LABEL[e.key]}>
              <StewardIcon k={e.key} size={13} />
            </span>
            <span className="font-mono text-[10.5px] text-ink-faint pt-[2px]">
              {clock(e.utc)}
              {e.lap ? ` L${e.lap}` : ""}
            </span>
            <span className="font-sans text-ink-soft">{e.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
