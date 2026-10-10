"use client";

import { useEffect, useState } from "react";
import type { Leader, Season as SeasonData, SeasonCell, SeasonDriver, SeasonStats } from "@/lib/live/f1-season";
import { driverPhotoByCode } from "@/lib/f1-assets";
import { TeamGlyph, useF1Favourites } from "./LiveTiming";

// The season so far, under the session on /f1/live:
//   records   eight cards — most wins, podiums and poles (driver beside
//             constructor), best average finish, most places gained, the
//             largest and closest winning margins, the biggest climb — for
//             Grands Prix, sprints or both
//   the grid  every driver's points (or finishing place) round by round,
//             each cell coloured by the place: gold, silver, bronze, blues for
//             the points, grey beyond, red for a retirement; the rounds to
//             come stay empty. Point at a cell for the race behind it.

type Mode = "race" | "sprint" | "combined";
type Races = "all" | "gp" | "sprint";
type Show = "points" | "position";

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-label text-[8.5px] text-ink-faint">{label}</span>
      <div className="flex rounded-full border hairline p-0.5" role="radiogroup" aria-label={label}>
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={`rounded-full px-2.5 h-6 font-sans text-[11.5px] font-semibold transition-colors ${value === v ? "text-[color:var(--paper)]" : "text-ink-soft hover:text-ink"}`}
            style={value === v ? { background: "var(--ink)" } : undefined}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- records ------------------------------------------------------------------

function Who({ l, team }: { l: Leader; team?: boolean }) {
  const photo = !team && l.code ? driverPhotoByCode(l.code, l.team, 96) : null;
  return (
    <span className="flex items-center gap-1.5 min-w-0">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className="w-6 h-6 rounded-full object-cover object-top bg-[var(--rule)] shrink-0" loading="lazy" />
      ) : (
        <TeamGlyph team={l.team} colour="var(--ink-faint)" size={15} />
      )}
      <span className="font-sans text-[12px] font-semibold truncate">{l.who}</span>
    </span>
  );
}

function Figure({ value, unit }: { value: string; unit?: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="font-display font-extrabold text-[2rem] leading-none tabular-nums">{value}</span>
      {unit && <span className="font-mono text-[10.5px] text-ink-faint">{unit}</span>}
    </span>
  );
}

function Split({ title, unit, pair }: { title: string; unit: string; pair: { driver: Leader | null; team: Leader | null } }) {
  return (
    <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] overflow-hidden">
      <div className="px-4 pt-3.5 pb-2 font-sans text-[13px] font-bold">{title}</div>
      <div className="grid grid-cols-2 border-t hairline">
        {(["driver", "team"] as const).map((k) => {
          const l = pair[k];
          return (
            <div key={k} className={`px-4 py-3.5 min-w-0 ${k === "team" ? "border-l hairline" : ""}`}>
              <div className="font-label text-[8.5px] text-ink-faint">{k === "driver" ? "Driver" : "Constructor"}</div>
              {l ? (
                <>
                  <div className="mt-2">
                    <Figure value={String(l.value)} unit={unit} />
                  </div>
                  <div className="mt-2">
                    <Who l={l} team={k === "team"} />
                  </div>
                </>
              ) : (
                <div className="mt-2 font-mono text-[11px] text-ink-faint">—</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Single({ title, l, value, unit, icon }: { title: string; l: Leader | null; value: (l: Leader) => string; unit?: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] px-4 py-3.5 flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <span className="font-sans text-[13px] font-bold">{title}</span>
        <span className="w-7 h-7 rounded-lg border hairline grid place-items-center text-ink-soft shrink-0" aria-hidden="true">
          {icon}
        </span>
      </div>
      {l ? (
        <div className="mt-auto pt-3">
          <Figure value={value(l)} unit={unit} />
          <div className="mt-2 flex items-center gap-2 min-w-0">
            <Who l={l} />
            {l.detail && <span className="font-mono text-[10px] text-ink-faint truncate">{l.detail}</span>}
          </div>
        </div>
      ) : (
        <div className="mt-auto pt-3 font-mono text-[11px] text-ink-faint">Not yet</div>
      )}
    </div>
  );
}

const I = {
  target: (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  ),
  up: (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 11.5 6.5 7.5l2.5 2.5 4.5-5M10 5h3.5v3.5" />
    </svg>
  ),
  wide: (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5 9 7M2.5 13.5 7 9" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.5 2.5 9.5 6.5M9.5 3v3.5H13M2.5 13.5l4-4M3 9.5h3.5V13" />
    </svg>
  ),
  rocket: (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 13.5V3M4 7l4-4 4 4" />
    </svg>
  ),
};

function Records({ stats }: { stats: SeasonStats }) {
  return (
    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
      <Split title="Most wins" unit="wins" pair={stats.wins} />
      <Split title="Most podiums" unit="podiums" pair={stats.podiums} />
      <Split title="Most poles" unit="poles" pair={stats.poles} />
      <Single title="Best average finish" l={stats.bestAverage} value={(l) => l.value.toFixed(1)} unit="average" icon={I.target} />
      <Single title="Most places gained" l={stats.placesGained} value={(l) => String(l.value)} unit="places, net" icon={I.up} />
      <Single title="Largest winning margin" l={stats.largestMargin} value={(l) => `+${l.value.toFixed(3)}`} unit="seconds" icon={I.wide} />
      <Single title="Closest winning margin" l={stats.closestMargin} value={(l) => `+${l.value.toFixed(3)}`} unit="seconds" icon={I.close} />
      <Single title="Biggest climb" l={stats.biggestClimb} value={(l) => `+${l.value}`} unit="places" icon={I.rocket} />
    </div>
  );
}

// ---- the grid -------------------------------------------------------------------

/** A finishing place's colour: podium metals, blues for the points, grey beyond, red for a retirement. */
function tone(c: SeasonCell | null): { bg: string; fg: string } {
  if (!c) return { bg: "transparent", fg: "var(--ink-faint)" };
  if (!/^\d+$/.test(c.text)) return { bg: "color-mix(in srgb, var(--down) 22%, transparent)", fg: "var(--ink)" };
  const p = c.pos ?? 99;
  if (p === 1) return { bg: "#E9B10E", fg: "#1a1400" };
  if (p === 2) return { bg: "#AEB6C2", fg: "#14171c" };
  if (p === 3) return { bg: "#C9792E", fg: "#1c0f03" };
  if (p <= 6) return { bg: "#2F6FE8", fg: "#fff" };
  if (p <= 10) return { bg: "color-mix(in srgb, #2F6FE8 55%, var(--paper))", fg: "var(--ink)" };
  return { bg: "color-mix(in srgb, var(--ink) 9%, transparent)", fg: "var(--ink-soft)" };
}

function Grid({ data }: { data: SeasonData }) {
  const [races, setRaces] = useState<Races>("all");
  const [show, setShow] = useState<Show>("points");
  const fav = useF1Favourites().codes;
  const cols = data.rounds.map((r, i) => ({ r, i })).filter(({ r }) => races !== "sprint" || r.sprint);

  const pick = (d: SeasonDriver, i: number): { cell: SeasonCell | null; points: number | null } => {
    const gp = d.gp[i];
    const sp = d.sprint[i];
    if (races === "gp") return { cell: gp, points: gp ? gp.points : null };
    if (races === "sprint") return { cell: sp, points: sp ? sp.points : null };
    return { cell: gp ?? sp, points: gp || sp ? (gp?.points ?? 0) + (sp?.points ?? 0) : null };
  };
  const total = (d: SeasonDriver) => cols.reduce((sum, { i }) => sum + (pick(d, i).points ?? 0), 0);
  const rows = [...data.drivers].map((d) => ({ d, total: total(d) })).sort((a, b) => b.total - a.total);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="font-sans text-[15px] font-bold">Points and places, round by round</h3>
        <div className="flex flex-wrap items-center gap-4">
          <Seg label="Races" value={races} onChange={setRaces} options={[["all", "All"], ["gp", "Grand Prix"], ["sprint", "Sprint"]]} />
          <Seg label="Show" value={show} onChange={setShow} options={[["points", "Points"], ["position", "Place"]]} />
        </div>
      </div>
      <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5 [scrollbar-width:thin]">
        <table className="border-separate border-spacing-[3px] text-[11.5px] tabular-nums min-w-full">
          <thead>
            <tr className="font-label text-[8.5px] text-ink-faint">
              <th className="sticky left-0 z-10 bg-[var(--surface)] text-left font-normal px-1 w-7">Pos</th>
              <th className="sticky left-7 z-10 bg-[var(--surface)] text-left font-normal px-1 min-w-[8.5rem]">Driver</th>
              <th className="text-right font-normal px-2">Pts</th>
              {cols.map(({ r }) => (
                <th key={r.round} className="font-normal px-0 min-w-[2.6rem]" title={`${r.name} · ${new Date(r.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}>
                  <div>R{r.round}</div>
                  <div className="font-mono normal-case tracking-normal text-[8.5px] truncate max-w-[2.6rem] mx-auto opacity-80">{r.name.slice(0, 3).toUpperCase()}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ d, total: pts }, k) => {
              const mine = fav.has(d.code);
              return (
                <tr key={d.code} className="group">
                  <td className="sticky left-0 z-10 bg-[var(--surface)] font-mono text-[11px] text-ink-soft px-1">{k + 1}</td>
                  <td className="sticky left-7 z-10 bg-[var(--surface)] px-1">
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      <span className="w-[3px] h-3.5 rounded-full" style={{ background: d.colour }} />
                      <TeamGlyph team={d.team} colour={d.colour} size={13} />
                      <span className={`font-sans text-[12px] ${mine ? "font-bold" : "font-semibold"} group-hover:text-[color:var(--hue-f1)] transition-colors`}>{d.name}</span>
                    </span>
                  </td>
                  <td className="text-right font-mono font-semibold px-2">{pts}</td>
                  {cols.map(({ r, i }) => {
                    if (!r.done && !d.gp[i] && !d.sprint[i]) return <td key={r.round} className="text-center text-ink-faint">–</td>;
                    const { cell, points } = pick(d, i);
                    if (!cell) return <td key={r.round} className="text-center text-ink-faint">–</td>;
                    const t = tone(cell);
                    const gp = d.gp[i];
                    const sp = d.sprint[i];
                    const tip = [
                      `${d.name} · R${r.round} ${r.name}`,
                      gp ? `Grand Prix: ${/^\d+$/.test(gp.text) ? `P${gp.text}` : gp.text}${gp.grid ? ` from P${gp.grid}` : ""} · ${gp.points} pts` : null,
                      sp ? `Sprint: ${/^\d+$/.test(sp.text) ? `P${sp.text}` : sp.text} · ${sp.points} pts` : null,
                    ]
                      .filter(Boolean)
                      .join("\n");
                    return (
                      <td key={r.round} className="p-0">
                        <span
                          className="block rounded-md h-7 leading-7 text-center font-mono font-semibold text-[11px] transition-transform hover:scale-110 hover:relative hover:z-[1] cursor-default"
                          style={{ background: t.bg, color: t.fg, boxShadow: mine ? "inset 0 0 0 1px var(--ink-faint)" : undefined }}
                          title={tip}
                        >
                          {show === "points" ? points : cell.text}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-4 font-mono text-[10px] text-ink-faint">
        {[
          ["#E9B10E", "P1"],
          ["#AEB6C2", "P2"],
          ["#C9792E", "P3"],
          ["#2F6FE8", "P4–P6"],
          ["color-mix(in srgb, #2F6FE8 55%, var(--paper))", "P7–P10"],
          ["color-mix(in srgb, var(--ink) 9%, transparent)", "P11+"],
          ["color-mix(in srgb, var(--down) 22%, transparent)", "DNF · DNS · DSQ · NC"],
        ].map(([c, l]) => (
          <span key={l} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} />
            {l}
          </span>
        ))}
        <span>{races === "all" ? "· All: Grand Prix and sprint points together, coloured by the Grand Prix" : ""}</span>
      </div>
    </>
  );
}

export default function Season() {
  const [data, setData] = useState<SeasonData | null>(null);
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<Mode>("race");
  useEffect(() => {
    fetch("/api/f1/season")
      .then((r) => (r.ok ? (r.json() as Promise<SeasonData>) : Promise.reject()))
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  if (failed) return null;
  return (
    <section id="season" className="scroll-mt-32">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-label text-[10px] text-ink-soft">The season so far</div>
          <h2 className="font-display font-extrabold uppercase text-[clamp(2rem,5vw,3.2rem)] leading-[0.9] mt-2">{data ? `${data.year} season` : "Season"}</h2>
        </div>
        <Seg label="Records from" value={mode} onChange={setMode} options={[["race", "Grands Prix"], ["sprint", "Sprints"], ["combined", "Both"]]} />
      </div>
      {!data ? (
        <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] mt-6 h-64 animate-pulse" />
      ) : (
        <>
          <div className="mt-6">
            <Records stats={data.stats[mode]} />
          </div>
          <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4 sm:p-5 mt-6">
            <Grid data={data} />
          </div>
          <p className="font-mono text-[9.5px] text-ink-faint mt-3">From Jolpica (the Ergast archive) · results land there a few hours after each race.</p>
        </>
      )}
    </section>
  );
}
