"use client";

import { useMemo } from "react";
import type { LiveSnapshot } from "@/lib/f1-live-types";
import { deletedLaps, type Deleted } from "@/lib/f1-race-control";
import { TeamGlyph } from "../LiveTiming";
import { Empty, Panel } from "./ui";

// Track limits, counted: every driver who has had a lap deleted, their strikes
// against the black and white flag (the third for track limits brings it, the
// next a penalty), and the corners that are catching people out. Read from
// race control's "TIME … DELETED - TRACK LIMITS AT TURN n LAP m" messages, so
// it follows a replay as it plays. Deletions for anything else (a yellow,
// a red) are listed but don't count as strikes.

/** Beyond the white line: a dashed kerb and a car outside it. */
export function LimitsMark({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} className={className} aria-hidden="true" fill="none">
      <path d="M2.5 13.5C2.5 7.5 7.5 2.5 13.5 2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="2.6 2" />
      <circle cx="11.2" cy="10.2" r="2.6" fill="currentColor" />
    </svg>
  );
}

const STRIKES = 4;

/** One strike's look: warnings in amber, the third the flag itself, the fourth the penalty. */
function Strike({ n, on }: { n: number; on: boolean }) {
  if (!on) return <LimitsMark size={14} className="text-[color:var(--rule)]" />;
  if (n === 2)
    return (
      <span
        className="inline-block w-[14px] h-[14px] rounded-[3px] border border-[var(--ink-soft)]"
        style={{ background: "linear-gradient(135deg, #fff 0 50%, #111 50% 100%)" }}
        title="Black and white flag"
      />
    );
  return <LimitsMark size={14} className={n >= 3 ? "text-[color:var(--down)]" : "text-[#fb923c]"} />;
}

function Row({ d, team, colour }: { d: Deleted; team: string; colour: string }) {
  const last = d.entries.at(-1);
  const others = d.entries.length - d.limits;
  return (
    <li
      className="grid grid-cols-[1rem_2.6rem_auto_1.6rem_minmax(0,1fr)] items-center gap-x-2.5 py-2 border-t hairline"
      title={d.laps.join("\n")}
    >
      <span className="flex justify-center"><TeamGlyph team={team} colour={colour} size={15} /></span>
      <b className="font-sans text-[13px]">{d.code}</b>
      <span className="flex gap-1" aria-label={`${d.limits} of ${STRIKES} for track limits`}>
        {Array.from({ length: STRIKES }, (_, i) => (
          <Strike key={i} n={i} on={i < d.limits} />
        ))}
      </span>
      <span className="font-display font-extrabold text-[15px] tabular-nums text-right">{d.limits}</span>
      <span className="font-mono text-[10.5px] text-ink-faint truncate">
        {last ? `T${last.turn} · L${last.lap}` : ""}
        {others > 0 ? ` · +${others} other` : ""}
      </span>
    </li>
  );
}

export default function TrackLimits({ snap, className = "" }: { snap: LiveSnapshot; className?: string }) {
  const rc = snap.raceControl;
  const deleted = useMemo(() => deletedLaps(rc ?? []), [rc]);
  const teams = useMemo(() => new Map(snap.rows.map((r) => [r.code, r])), [snap.rows]);
  const total = deleted.reduce((n, d) => n + d.limits, 0);
  // The corners catching most people out.
  const corners = useMemo(() => {
    const by = new Map<number, number>();
    for (const d of deleted) for (const e of d.entries) if (e.limits) by.set(e.turn, (by.get(e.turn) ?? 0) + 1);
    return [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [deleted]);

  return (
    <Panel
      id="limits"
      label="Track limits"
      className={className}
      action={
        <span className="flex items-center gap-2 font-mono text-[10px] text-ink-faint">
          <LimitsMark size={13} className="text-[#fb923c]" />
          {total} for track limits · 3rd: black and white flag
        </span>
      }
    >
      {deleted.length === 0 ? (
        <Empty>No laps deleted yet.</Empty>
      ) : (
        <>
          {corners.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {corners.map(([turn, n]) => (
                <span key={turn} className="font-mono text-[10.5px] rounded-full border hairline px-2 py-[2px] text-ink-soft">
                  Turn {turn} <b className="text-ink">{n}</b>
                </span>
              ))}
            </div>
          )}
          <ol className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6 [&>li:nth-child(-n+1)]:border-t-0 sm:[&>li:nth-child(-n+2)]:border-t-0 xl:[&>li:nth-child(-n+3)]:border-t-0">
            {deleted.map((d) => (
              <Row key={d.code} d={d} team={teams.get(d.code)?.team ?? ""} colour={teams.get(d.code)?.colour ?? "var(--ink-faint)"} />
            ))}
          </ol>
        </>
      )}
    </Panel>
  );
}
