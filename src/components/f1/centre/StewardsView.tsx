"use client";

import { CaretRightIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import type { LiveSnapshot } from "@/lib/f1-live-types";
import { stewardsTally, type DriverTally } from "@/lib/f1-race-control";
import { stewardsByCode, type IncidentState, type Stewards } from "@/lib/f1-stewards";
import { TeamGlyph } from "../LiveTiming";
import { Empty, Panel } from "./ui";
import { StewardIcon, StewardDetails } from "./StewardsTable";

// The stewards, per driver, in words: who race control has had something to
// say about this session (every session, practice to race), and where each
// stands. A driver is listed once anything about them comes from race
// control; everyone else is clean. Four columns:
//
//   Track limits            strikes towards the black and white flag (the
//                           third brings it), and laps deleted for anything else
//   With the stewards       each open incident and its state; "cleared" once
//                           everything was settled with no further action
//   Penalties & warnings    open penalties (+5s, drive-through…), served ones
//                           faint, reprimands, warnings, the black and white flag
//
// Open penalties first, then open investigations, then the rest. A tap opens
// every message about that driver. Read up to the current lap, so it follows
// a replay as it plays.

const STATE: Record<IncidentState, { text: string; colour: string }> = {
  investigating: { text: "Under investigation", colour: "#60a5fa" },
  after: { text: "After the race", colour: "#60a5fa" },
  noted: { text: "Noted", colour: "var(--ink-soft)" },
};

const STRIKES = 4;

/** "5 second time penalty" → "+5s"; "Drive through penalty" → "Drive-through". */
function shortPenalty(what: string): string {
  const t = /(\d+) second/i.exec(what);
  if (t) return `+${t[1]}s`;
  if (/drive/i.test(what)) return "Drive-through";
  if (/stop/i.test(what)) return "Stop-go";
  if (/grid/i.test(what)) return "Grid drop";
  if (/disqualif/i.test(what)) return "Disqualified";
  return what;
}

function Chip({ children, colour, faint = false, title }: { children: React.ReactNode; colour: string; faint?: boolean; title?: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 h-[20px] font-mono text-[10.5px] whitespace-nowrap"
      style={{ borderColor: faint ? "var(--rule)" : colour, color: faint ? "var(--ink-faint)" : colour }}
      title={title}
    >
      {children}
    </span>
  );
}

const None = () => <span className="text-ink-faint">—</span>;

function Limits({ t }: { t: DriverTally }) {
  const n = t.counts.limits;
  const other = t.counts.deleted;
  if (!n && !other) return <None />;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {n > 0 && (
        <span className="flex items-center gap-1" aria-label={`${n} for track limits`}>
          {Array.from({ length: STRIKES }, (_, i) => (
            <span
              key={i}
              className="w-[9px] h-[9px] rounded-full"
              style={i < n ? { background: i >= 2 ? "var(--down)" : "#fbbf24" } : { boxShadow: "inset 0 0 0 1.5px var(--rule)" }}
            />
          ))}
          <b className="font-display font-extrabold text-[14px] tabular-nums ml-1">{n}</b>
        </span>
      )}
      {other > 0 && <span className="font-mono text-[10.5px] text-ink-faint">+{other} other deleted</span>}
    </span>
  );
}

function WithStewards({ st, t }: { st: Stewards | undefined; t: DriverTally }) {
  const open = st?.incidents ?? [];
  if (open.length)
    return (
      <span className="flex flex-col gap-1 min-w-0">
        {open.map((inc, i) => (
          <span key={i} className="text-[12px] leading-snug min-w-0">
            <b className="font-semibold" style={{ color: STATE[inc.state].colour }}>
              {STATE[inc.state].text}
            </b>
            <span className="text-ink-soft">: {inc.why.toLowerCase()}</span>
          </span>
        ))}
      </span>
    );
  if (t.counts.noted || t.counts.investigated || t.counts.cleared)
    return <span className="text-[12px] text-ink-faint">{t.counts.cleared ? "Cleared, no further action" : "Settled"}</span>;
  return <None />;
}

function Sanctions({ st, t }: { st: Stewards | undefined; t: DriverTally }) {
  const open = st?.penalties ?? [];
  const served = t.penalties.filter((p) => p.served);
  const chips = [
    ...open.map((p, i) => (
      <Chip key={`o${i}`} colour="var(--down)" title={p.why}>
        {p.label === "DT" ? "Drive-through" : p.label === "SG" ? "Stop-go" : p.label}
      </Chip>
    )),
    ...served.map((p, i) => (
      <Chip key={`s${i}`} colour="var(--down)" faint title={p.what}>
        {shortPenalty(p.what)} served
      </Chip>
    )),
    ...(t.counts.reprimands ? [<Chip key="r" colour="#fb923c">{t.counts.reprimands > 1 ? `${t.counts.reprimands} reprimands` : "Reprimand"}</Chip>] : []),
    ...(t.counts.warnings ? [<Chip key="w" colour="#facc15">{t.counts.warnings > 1 ? `${t.counts.warnings} warnings` : "Warning"}</Chip>] : []),
    ...(t.counts.blackWhite ? [<Chip key="b" colour="var(--ink)">Black &amp; white flag</Chip>] : []),
  ];
  return chips.length ? <span className="flex flex-wrap gap-1.5">{chips}</span> : <None />;
}

const COLS = "md:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1.1fr)]";

function Head({ k, children }: { k: "limits" | "investigated" | "penalties"; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <StewardIcon k={k} size={13} />
      {children}
    </span>
  );
}

export default function StewardsView({ snap, className = "" }: { snap: LiveSnapshot; className?: string }) {
  const rc = snap.raceControl;
  const upTo = snap.type === "Race" ? (snap.lap?.current ?? null) : null;
  const tally = useMemo(() => stewardsTally(rc ?? [], upTo), [rc, upTo]);
  const now = useMemo(() => stewardsByCode(rc ?? [], upTo), [rc, upTo]);
  const teams = useMemo(() => new Map(snap.rows.map((r) => [r.code, r])), [snap.rows]);
  const [open, setOpen] = useState<string | null>(null);

  // Open penalties first, then open investigations, then noted, then the rest.
  const rows = useMemo(() => {
    const rank = (t: DriverTally) => {
      const st = now.get(t.code);
      if (st?.penalties.length) return 0;
      if (st?.incidents.some((i) => i.state !== "noted")) return 1;
      if (st?.incidents.length) return 2;
      return 3;
    };
    return [...tally].sort((a, b) => rank(a) - rank(b) || b.counts.limits - a.counts.limits || b.total - a.total);
  }, [tally, now]);

  const corners = useMemo(() => {
    const by = new Map<string, number>();
    for (const t of tally) for (const e of t.events) if (e.key === "limits") {
      const turn = /turn (\d+)/.exec(e.text)?.[1];
      if (turn) by.set(turn, (by.get(turn) ?? 0) + 1);
    }
    return [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [tally]);

  const field = snap.rows.length;
  return (
    <Panel
      id="stewards"
      label="Stewards"
      className={className}
      meta={tally.length ? `${tally.length} driver${tally.length === 1 ? "" : "s"} involved${field > tally.length ? ` · the other ${field - tally.length} clean` : ""}` : snap.session}
    >
      {tally.length === 0 ? (
        <Empty>Nothing from the stewards yet this session: everyone&rsquo;s clean.</Empty>
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
          {/* the column heads, on a wide screen; a phone labels each line instead */}
          <div className={`hidden md:grid ${COLS} gap-x-4 pb-2 font-label text-[9.5px] text-ink-faint`}>
            <span>Driver</span>
            <Head k="limits">Track limits</Head>
            <Head k="investigated">With the stewards</Head>
            <Head k="penalties">Penalties &amp; warnings</Head>
          </div>
          <ol>
            {rows.map((t) => {
              const row = teams.get(t.code);
              const st = now.get(t.code);
              const isOpen = open === t.code;
              return (
                <li key={t.code} className="border-t hairline">
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : t.code)}
                    aria-expanded={isOpen}
                    className={`w-full text-left grid grid-cols-[6.5rem_minmax(0,1fr)] ${COLS} gap-x-4 gap-y-1.5 py-2.5 items-start hover:bg-[color:color-mix(in_srgb,var(--ink)_4%,transparent)] rounded-md`}
                  >
                    <span className="flex items-center gap-2 whitespace-nowrap row-span-3 md:row-span-1">
                      <TeamGlyph team={row?.team ?? ""} colour={row?.colour ?? "var(--ink-faint)"} size={14} />
                      <b className="font-sans text-[13px]">{t.code}</b>
                      <span className={`text-ink-faint text-[10px] transition-transform ${isOpen ? "rotate-90" : ""}`} aria-hidden="true">
                        <CaretRightIcon size={12} weight="bold" className="inline align-[-2px]" aria-hidden="true" />
                      </span>
                    </span>
                    <span className="min-w-0">
                      <span className="md:hidden block font-label text-[9px] text-ink-faint mb-0.5">Track limits</span>
                      <Limits t={t} />
                    </span>
                    <span className="min-w-0 col-start-2 md:col-start-auto">
                      <span className="md:hidden block font-label text-[9px] text-ink-faint mb-0.5">With the stewards</span>
                      <WithStewards st={st} t={t} />
                    </span>
                    <span className="min-w-0 col-start-2 md:col-start-auto">
                      <span className="md:hidden block font-label text-[9px] text-ink-faint mb-0.5">Penalties &amp; warnings</span>
                      <Sanctions st={st} t={t} />
                    </span>
                  </button>
                  {isOpen && <StewardDetails t={t} />}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </Panel>
  );
}
