"use client";

import { useEffect, useMemo, useState } from "react";
import type { LiveSnapshot, LiveStats, LiveStints } from "@/lib/f1-live-types";
import { deletedLaps, stewardsCases, type StewardsCase } from "@/lib/f1-race-control";
import TyreIcon, { TYRE } from "../TyreIcon";
import RaceStory from "../RaceStory";
import { LapAxis, StintLine } from "../Stints";
import { TeamGlyph } from "../LiveTiming";
import { Empty, Panel, Seg, clock } from "./ui";

// The session taken apart, one question at a time:
//   Tyres     every car's stints to scale, and the pit stops ranked
//   Laps      positions lap by lap (races)
//   Pace      speed traps; each driver's best sectors and the lap they add
//             up to (the ideal lap) against the lap they did; the circuit's
//             reference laps
//   Stewards  open and decided cases, penalties, and the laps each driver
//             has had deleted (three for track limits: black and white flag)

export type Sub = "tyres" | "laps" | "pace" | "stewards";

const secs = (t?: string | null) => {
  const m = /^(?:(\d+):)?(\d+\.\d+)$/.exec(t ?? "");
  return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : null;
};
const lapText = (s: number) => {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return m ? `${m}:${r.toFixed(3).padStart(6, "0")}` : r.toFixed(3);
};

// ---- tyres -------------------------------------------------------------------

function Strategy({ stints, total, highlight, running }: { stints: LiveStints[]; total: number; highlight: Set<string>; running: boolean }) {
  const scale = Math.max(total, ...stints.map((d) => d.stints.reduce((n, s) => n + s.laps, 0)), 1);
  return (
    <>
      <div className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-3">
        <span />
        <LapAxis total={scale} />
      </div>
      <div className="space-y-1.5 mt-2">
        {stints.map((d, row) => (
          <div key={d.code} className={`grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-3 pt-2 ${highlight.size && !highlight.has(d.code) ? "opacity-80" : ""}`}>
            <span className="flex items-center gap-1.5 font-sans font-bold text-[11.5px]">
              <span className="w-[3px] h-3 rounded-full" style={{ background: d.colour }} />
              {d.code}
            </span>
            <span className="pr-3">
              <StintLine stints={d.stints} total={scale} running={running} delay={row * 22} />
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 pt-4 mt-4 border-t hairline font-mono text-[10px] text-ink-soft">
        {(["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"] as const).map((c) => (
          <span key={c} className="flex items-center gap-1.5">
            <TyreIcon compound={c} size={13} /> {TYRE[c].name}
          </span>
        ))}
        <span className="text-ink-faint">Dashed: a used set · the number along a stint: its laps · the dot: laps on the set now</span>
      </div>
    </>
  );
}

function Stops({ snap }: { snap: LiveSnapshot }) {
  const stops = (snap.pitStops ?? []).filter((p) => p.stationary !== null && p.stationary > 1 && p.stationary < 15).sort((a, b) => a.stationary! - b.stationary!);
  if (stops.length === 0) return <Empty>No pit stops timed yet.</Empty>;
  const team = new Map(snap.rows.map((r) => [r.code, r.team]));
  const best = stops[0].stationary!;
  return (
    <ol>
      {stops.slice(0, 12).map((p, i) => (
        <li key={`${p.code}-${p.lap}`} className="grid grid-cols-[1.4rem_minmax(0,1fr)_auto] items-center gap-3 border-t hairline first:border-t-0 py-[7px] text-[12.5px]">
          <span className="font-mono text-[11px] text-ink-soft">{i + 1}</span>
          <span className="flex items-center gap-2 min-w-0">
            <span className="w-[3px] h-3.5 rounded-full shrink-0" style={{ background: p.colour }} />
            <TeamGlyph team={team.get(p.code) ?? ""} colour={p.colour} />
            <b className="font-sans">{p.code}</b>
            <span className="font-mono text-[10.5px] text-ink-faint">lap {p.lap}</span>
            <span className="flex-1 h-[6px] rounded-full bg-[var(--rule)] overflow-hidden min-w-[2rem] hidden sm:block">
              <span className="block h-full rounded-full" style={{ width: `${(best / p.stationary!) * 100}%`, background: i === 0 ? "var(--f1-fastest)" : p.colour }} />
            </span>
          </span>
          <span className="font-mono tabular-nums text-right">
            <b style={i === 0 ? { color: "var(--f1-fastest)" } : undefined}>{p.stationary!.toFixed(1)} s</b>
            {p.lane !== null && <span className="text-ink-faint text-[10.5px]"> · lane {p.lane.toFixed(1)}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

// ---- pace --------------------------------------------------------------------

type Trap = "st" | "fl" | "i1" | "i2";
const TRAPS: { value: Trap; label: string }[] = [
  { value: "st", label: "Speed trap" },
  { value: "fl", label: "Finish line" },
  { value: "i1", label: "Int. 1" },
  { value: "i2", label: "Int. 2" },
];

function Speeds({ stats, mine }: { stats: LiveStats[]; mine: Set<string> }) {
  const [trap, setTrap] = useState<Trap>("st");
  const list = stats.filter((s) => s.speeds[trap]).sort((a, b) => b.speeds[trap]! - a.speeds[trap]!);
  if (list.length === 0) return <Empty>No speeds yet.</Empty>;
  const top = list[0].speeds[trap]!;
  const floor = Math.floor((list.at(-1)!.speeds[trap]! - 5) / 5) * 5;
  return (
    <>
      <div className="mb-3">
        <Seg label="Trap" value={trap} onChange={setTrap} options={TRAPS} size="sm" />
      </div>
      <ol className="space-y-[3px]">
        {list.map((s, i) => (
          <li key={s.code} className={`grid grid-cols-[1.4rem_2.6rem_minmax(0,1fr)_3.6rem] items-center gap-2 text-[12px] ${mine.has(s.code) ? "font-bold" : ""}`}>
            <span className="font-mono text-[10.5px] text-ink-soft">{i + 1}</span>
            <span className="font-sans font-bold">{s.code}</span>
            <span className="h-[8px] rounded-full bg-[var(--rule)] overflow-hidden">
              <span className="block h-full rounded-full" style={{ width: `${Math.max(4, ((s.speeds[trap]! - floor) / (top - floor)) * 100)}%`, background: s.colour, opacity: mine.has(s.code) ? 1 : 0.75 }} />
            </span>
            <span className="font-mono tabular-nums text-right">{s.speeds[trap]} <span className="text-ink-faint text-[10.5px]">km/h</span></span>
          </li>
        ))}
      </ol>
      <p className="font-mono text-[10.5px] text-ink-faint mt-3">Each car&rsquo;s best this session. Bars start at {floor} km/h. Int. 1 and 2 are the intermediate traps in sectors 1 and 2.</p>
    </>
  );
}

function Ideal({ stats, mine }: { stats: LiveStats[]; mine: Set<string> }) {
  // Each sector's best of all, and each driver's best three added up.
  const bestOf = [0, 1, 2].map((i) => Math.min(...stats.map((s) => secs(s.bestSectors[i]) ?? Infinity)));
  const rows = stats
    .map((s) => {
      const parts = s.bestSectors.map(secs);
      const ideal = parts.every((x) => x !== null) ? (parts as number[]).reduce((a, b) => a + b, 0) : null;
      const best = secs(s.personalBest);
      return { s, parts, ideal, best, left: ideal !== null && best !== null ? best - ideal : null };
    })
    .filter((r) => r.ideal !== null)
    .sort((a, b) => a.ideal! - b.ideal!);
  if (rows.length === 0) return <Empty>No complete laps yet.</Empty>;
  const session = bestOf.every(Number.isFinite) ? bestOf.reduce((a, b) => a + b, 0) : null;
  return (
    <>
      {session !== null && (
        <p className="text-[12.5px] mb-3">
          The session&rsquo;s ideal lap, every sector at its quickest: <b className="font-mono" style={{ color: "var(--f1-fastest)" }}>{lapText(session)}</b>
        </p>
      )}
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-[12px] tabular-nums min-w-[26rem]">
          <thead>
            <tr className="font-label text-[9.5px] text-ink-faint text-right">
              <th className="text-left font-normal py-1">Driver</th>
              <th className="font-normal">S1</th>
              <th className="font-normal">S2</th>
              <th className="font-normal">S3</th>
              <th className="font-normal">Ideal</th>
              <th className="font-normal">Best</th>
              <th className="font-normal" title="Time left on the table: best lap minus ideal lap">Left</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s, parts, ideal, best, left }) => (
              <tr key={s.code} className={`border-t hairline text-right font-mono ${mine.has(s.code) ? "bg-[color-mix(in_srgb,var(--hue-f1)_8%,transparent)]" : ""}`}>
                <td className="text-left py-[5px] font-sans font-bold">
                  <span className="inline-block w-[3px] h-3 rounded-full mr-1.5 align-middle" style={{ background: s.colour }} />
                  {s.code}
                </td>
                {parts.map((p, i) => (
                  <td key={i} style={p !== null && p === bestOf[i] ? { color: "var(--f1-fastest)" } : undefined}>
                    {p?.toFixed(3) ?? "—"}
                  </td>
                ))}
                <td className="font-semibold">{ideal !== null ? lapText(ideal) : "—"}</td>
                <td className="text-ink-soft">{best !== null ? lapText(best) : "—"}</td>
                <td style={{ color: left !== null && left > 0.2 ? "var(--f1-slower)" : "var(--ink-faint)" }}>{left !== null ? `${left.toFixed(3)}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

interface Bench {
  label: string;
  time: string;
  who: string;
  team: string;
  year: number;
}

/** The session's best lap against the circuit's references: last year's pole (or fastest race lap) and the fastest race lap since 2022. */
export function Benchmarks({ snap }: { snap: LiveSnapshot }) {
  const year = Number(snap.path?.slice(0, 4)) || new Date().getFullYear();
  const [got, setGot] = useState<{ q: string; list: Bench[] } | null>(null);
  const q = `meeting=${encodeURIComponent(snap.meeting)}&type=${snap.type === "Race" ? "Race" : "Qualifying"}&year=${year}`;
  useEffect(() => {
    let live = true;
    fetch(`/api/f1/benchmarks?${q}`)
      .then((r) => (r.ok ? (r.json() as Promise<Bench[]>) : []))
      .then((l) => live && setGot({ q, list: l }))
      .catch(() => live && setGot({ q, list: [] }));
    return () => {
      live = false;
    };
  }, [q]);
  const list = got?.q === q ? got.list : null;
  const best = snap.rows.find((r) => r.bestFastest && r.best) ?? null;
  const mine = secs(best?.best);
  return (
    <div className="flex flex-col gap-2.5">
      <div className="rounded-xl px-3.5 py-3" style={{ background: "color-mix(in srgb, var(--f1-fastest) 13%, transparent)" }}>
        <div className="font-label text-[9.5px] text-ink-faint">{snap.type === "Race" ? "Fastest lap" : "Session best"}</div>
        <div className="flex items-end justify-between gap-3 mt-1">
          <span className="font-mono font-semibold text-[1.55rem] leading-none tabular-nums" style={{ color: "var(--f1-fastest)" }}>
            {best?.best ?? "—"}
          </span>
          {best && (
            <span className="flex items-center gap-1.5 font-sans text-[12px] font-bold">
              <TeamGlyph team={best.team} colour={best.colour} size={14} />
              {best.code}
            </span>
          )}
        </div>
      </div>
      {list === null ? (
        <div className="h-16 rounded-xl bg-[var(--rule)] animate-pulse opacity-40" />
      ) : list.length === 0 ? (
        <p className="font-mono text-[10.5px] text-ink-faint px-1">No reference laps: these cars haven&rsquo;t raced here before.</p>
      ) : (
        list.map((b) => {
          const ref = secs(b.time);
          const gap = mine !== null && ref !== null ? mine - ref : null;
          return (
            <div key={b.label} className="rounded-xl border hairline px-3.5 py-2.5">
              <div className="font-label text-[9.5px] text-ink-faint">{b.label}</div>
              <div className="flex items-baseline justify-between gap-3 mt-1">
                <span className="font-mono font-semibold text-[1.05rem] tabular-nums">{b.time}</span>
                {gap !== null && (
                  <span
                    className="font-mono text-[10.5px] font-semibold tabular-nums rounded-md px-1.5 py-0.5"
                    style={{ color: gap <= 0 ? "var(--f1-personal)" : "var(--down)", background: `color-mix(in srgb, ${gap <= 0 ? "var(--f1-personal)" : "var(--down)"} 13%, transparent)` }}
                    title={gap <= 0 ? "This session is quicker" : "This session is slower"}
                  >
                    {gap <= 0 ? "−" : "+"}
                    {Math.abs(gap).toFixed(3)}s
                  </span>
                )}
              </div>
              <div className="font-sans text-[11px] text-ink-soft mt-0.5">
                {b.who} · {b.year}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ---- stewards ------------------------------------------------------------------

function CaseRow({ c }: { c: StewardsCase }) {
  return (
    <li className="border-t hairline first:border-t-0 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-sans font-bold text-[13px]">{c.drivers.join(" · ")}</span>
        <span className="font-mono text-[10.5px] text-ink-faint">{clock(c.utc)}</span>
      </div>
      <div className="text-[12.5px] text-ink-soft">
        {c.where ? `${c.where}: ` : ""}
        {c.reason}
      </div>
      <div className="mt-1 font-label text-[9.5px]" style={{ color: c.penalty ? "var(--down)" : c.decided ? "var(--f1-personal)" : "#c084fc" }}>
        {c.status}
      </div>
    </li>
    );
}

function Stewards({ snap }: { snap: LiveSnapshot }) {
  const rc = snap.raceControl;
  const cases = useMemo(() => stewardsCases(rc ?? []), [rc]);
  const deleted = useMemo(() => deletedLaps(rc ?? []), [rc]);
  const open = cases.filter((c) => !c.decided);
  const decided = cases.filter((c) => c.decided);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      <div className="space-y-6">
        <Panel label="Open cases" meta={`${open.length}`}>
          {open.length ? <ol>{open.map((c, i) => <CaseRow key={i} c={c} />)}</ol> : <Empty>Nothing open with the stewards.</Empty>}
        </Panel>
        <Panel label="Decided" meta={`${decided.length}`}>
          {decided.length ? <ol>{decided.map((c, i) => <CaseRow key={i} c={c} />)}</ol> : <Empty>No decisions yet.</Empty>}
        </Panel>
      </div>
      <Panel label="Laps deleted" meta="Third for track limits: black and white flag">
        {deleted.length === 0 ? (
          <Empty>No laps deleted.</Empty>
        ) : (
          <ol>
            {deleted.map((d) => (
              <li key={d.code} className="border-t hairline first:border-t-0 py-2.5">
                <div className="flex items-center gap-3">
                  <b className="font-sans text-[13px] w-10">{d.code}</b>
                  <span className="flex gap-1" aria-label={`${d.limits} for track limits`}>
                    {[0, 1, 2, 3].map((i) => (
                      <span key={i} className="w-5 h-2 rounded-full" style={{ background: i < d.limits ? (i >= 3 ? "var(--down)" : i === 2 ? "var(--ink)" : "#fb923c") : "var(--rule)" }} />
                    ))}
                  </span>
                  {d.blackAndWhite && <span className="font-label text-[9px] rounded px-1 py-[1px] border hairline">B/W flag</span>}
                  <span className="ml-auto font-mono text-[11px] text-ink-soft">{d.laps.length}</span>
                </div>
                <div className="font-mono text-[10px] text-ink-faint mt-1 leading-relaxed">{d.laps.join(" · ")}</div>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}

// ---- the view ------------------------------------------------------------------

export default function Analysis({ snap, sub, onSub, highlight, mine }: { snap: LiveSnapshot; sub: Sub; onSub: (s: Sub) => void; highlight: Set<string>; mine: Set<string> }) {
  const race = snap.type === "Race";
  const hasLaps = (snap.lapPositions?.length ?? 0) > 0;
  const subs: { value: Sub; label: string }[] = [
    { value: "tyres", label: "Tyres" },
    ...(hasLaps ? [{ value: "laps" as Sub, label: "Lap chart" }] : []),
    { value: "pace", label: "Pace" },
    { value: "stewards", label: "Stewards" },
  ];
  const cur = subs.some((s) => s.value === sub) ? sub : "tyres";
  return (
    <div>
      <div className="mb-5">
        <Seg label="Analysis" value={cur} onChange={onSub} options={subs} />
      </div>
      {cur === "tyres" && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] gap-6 items-start">
          <Panel label="Tyre strategy" meta={race && snap.lap ? `${snap.lap.total} laps` : "Laps on each set"}>
            {snap.stints?.some((d) => d.stints.length) ? <Strategy stints={snap.stints} total={race ? (snap.lap?.total ?? 0) : 0} highlight={highlight} running={snap.running} /> : <Empty>No stints yet.</Empty>}
          </Panel>
          <Panel label="Quickest stops" meta="Time standing still">
            <Stops snap={snap} />
          </Panel>
        </div>
      )}
      {cur === "laps" && snap.lapPositions && (
        <Panel label="The race, lap by lap" meta="Point at a line to see whose it is">
          <RaceStory data={snap.lapPositions} highlight={highlight} names={Object.fromEntries(snap.rows.map((r) => [r.code, r.name]))} />
        </Panel>
      )}
      {cur === "pace" && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 items-start">
          <Panel label="Speed traps">{snap.stats?.length ? <Speeds stats={snap.stats} mine={mine} /> : <Empty>No speeds yet.</Empty>}</Panel>
          <div className="space-y-6 min-w-0">
            <Panel label="Lap benchmarks" meta={snap.meeting.replace(/ Grand Prix$/, "")}>
              <Benchmarks snap={snap} />
            </Panel>
          </div>
          <Panel label="Best sectors and the ideal lap" meta="Purple: quickest of all" className="lg:col-span-2">
            {snap.stats?.length ? <Ideal stats={snap.stats} mine={mine} /> : <Empty>No sectors yet.</Empty>}
          </Panel>
        </div>
      )}
      {cur === "stewards" && <Stewards snap={snap} />}
    </div>
  );
}
