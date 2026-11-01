"use client";

import { Fragment, useMemo, useState } from "react";
import type { LiveSnapshot } from "@/lib/f1-live-types";
import { stewardsTally, type DriverTally, type TallyKey } from "@/lib/f1-race-control";
import { TeamGlyph } from "../LiveTiming";
import { clock, Empty, Panel } from "./ui";

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

function Count({ k, n }: { k: TallyKey; n: number }) {
  if (!n) return <span className="text-[color:var(--rule)]">·</span>;
  return (
    <span className="font-display font-extrabold text-[15px] tabular-nums" style={{ color: COLOUR[k] }}>
      {n}
    </span>
  );
}

function Details({ t }: { t: DriverTally }) {
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

export default function StewardsTable({ snap, className = "" }: { snap: LiveSnapshot; className?: string }) {
  const rc = snap.raceControl;
  const upTo = snap.type === "Race" ? (snap.lap?.current ?? null) : null;
  const tally = useMemo(() => stewardsTally(rc ?? [], upTo), [rc, upTo]);
  const teams = useMemo(() => new Map(snap.rows.map((r) => [r.code, r])), [snap.rows]);
  const [open, setOpen] = useState<string | null>(null);
  const sum = (k: TallyKey) => tally.reduce((n, t) => n + t.counts[k], 0);
  // The corners catching people out.
  const corners = useMemo(() => {
    const by = new Map<string, number>();
    for (const t of tally) for (const e of t.events) if (e.key === "limits") {
      const turn = /turn (\d+)/.exec(e.text)?.[1];
      if (turn) by.set(turn, (by.get(turn) ?? 0) + 1);
    }
    return [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [tally]);

  return (
    <Panel
      id="stewards"
      label="Stewards"
      className={className}
      meta={tally.length ? `${sum("limits")} track limits · ${sum("investigated")} investigated · ${sum("penalties")} penalties` : snap.session}
    >
      {tally.length === 0 ? (
        <Empty>Nothing from the stewards yet this session.</Empty>
      ) : (
        <>
          {corners.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              <span className="font-label text-[9.5px] text-ink-faint mr-1">Track limits at</span>
              {corners.map(([turn, n]) => (
                <span key={turn} className="font-mono text-[10.5px] rounded-full border hairline px-2 py-[2px] text-ink-soft">
                  Turn {turn} <b className="text-ink">{n}</b>
                </span>
              ))}
            </div>
          )}
          <div className="overflow-x-auto -mx-1 px-1 [scrollbar-width:thin]">
            <table className="w-full min-w-[34rem] border-collapse text-[12px]">
              <thead>
                <tr className="text-ink-soft">
                  <th className="text-left font-label font-normal text-[9.5px] text-ink-faint py-2 pr-2 sticky left-0 bg-[var(--card-bg)]">Driver</th>
                  {COLUMNS.map((c) => (
                    <th key={c.key} className="font-normal py-2 px-1 w-[2.6rem]" title={c.tip}>
                      <span className="inline-flex justify-center">
                        <StewardIcon k={c.key} size={16} />
                      </span>
                      <span className="sr-only">{c.label}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tally.map((t) => {
                  const row = teams.get(t.code);
                  const isOpen = open === t.code;
                  return (
                    <Fragment key={t.code}>
                      <tr
                        className="border-t hairline cursor-pointer hover:bg-[color:color-mix(in_srgb,var(--ink)_4%,transparent)]"
                        onClick={() => setOpen(isOpen ? null : t.code)}
                        aria-expanded={isOpen}
                      >
                        <td className="py-2 pr-2 sticky left-0 bg-[var(--card-bg)]">
                          <span className="flex items-center gap-2 whitespace-nowrap">
                            <TeamGlyph team={row?.team ?? ""} colour={row?.colour ?? "var(--ink-faint)"} size={14} />
                            <b className="font-sans text-[13px]">{t.code}</b>
                            <span className={`text-ink-faint text-[10px] transition-transform ${isOpen ? "rotate-90" : ""}`} aria-hidden="true">
                              ›
                            </span>
                          </span>
                        </td>
                        {COLUMNS.map((c) => (
                          <td key={c.key} className="text-center py-2 px-1">
                            <Count k={c.key} n={t.counts[c.key]} />
                          </td>
                        ))}
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={COLUMNS.length + 1} className="pb-1">
                            <Details t={t} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* the key: every mark named once */}
          <ul className="mt-3 pt-3 border-t hairline flex flex-wrap gap-x-4 gap-y-1.5 font-mono text-[10px] text-ink-faint">
            {COLUMNS.map((c) => (
              <li key={c.key} className="flex items-center gap-1.5" title={c.tip}>
                <span style={{ color: c.colour }}>
                  <StewardIcon k={c.key} size={12} />
                </span>
                {c.label}
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}
