"use client";

import { f1Place, istClock, istDay, localTime } from "@/lib/event-time";
import { ArrowLeftIcon, ArrowRightIcon, CalendarDotsIcon, ClockCounterClockwiseIcon, CloudRainIcon, FlagCheckeredIcon, FlagIcon, LightningIcon, PathIcon, TableIcon, ThermometerHotIcon, ThermometerSimpleIcon, TrophyIcon, WatchIcon, WrenchIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import type { F1Race } from "@/lib/types";
import type { LiveSnapshot } from "@/lib/f1-live-types";
import type { WeekendData, WeekendSession } from "@/lib/live/f1-weekend";
import type { Season } from "@/lib/live/f1-season";
import TrackMap, { useTrack } from "../TrackMap";
import { TeamGlyph } from "../LiveTiming";
import { tone } from "../Season";
import { useSeasonData } from "../DriverSheet";
import { openDriver } from "../DriverLink";
import { Benchmarks } from "./Analysis";
import { Panel } from "./ui";
import { SessionRecapCard, useInsights } from "./Insights";

// The race weekend around the session on show, read top to bottom:
//   the round     where, when, the circuit's numbers and its map
//   sessions      a card for each: the top three with times, the fastest
//                 lap, the weather; open any one here (the one on show is
//                 marked); the ones to come with a countdown
//   the recap     the session on show, written up, once it's over
//   the form      every driver's place in every session so far, in one grid
//                 (tap a driver for their season); a driver a row, or from
//                 2400px a driver a column across the full width, with the
//                 three panels below sharing the row under it
//   history       who won, took pole and set the fastest lap here lately,
//                 and the most wins here ever
//   then the lap references and the rounds after this one.

const SHORT: Record<string, string> = {
  "Practice 1": "FP1",
  "Practice 2": "FP2",
  "Practice 3": "FP3",
  "Sprint Qualifying": "SQ",
  Sprint: "Sprint",
  Qualifying: "Quali",
  Race: "Race",
};
const day = (iso: string) => istDay(iso, { weekday: "short" });

function useWeekend(meeting: string, year: number): WeekendData | null | undefined {
  const [w, setW] = useState<{ k: string; d: WeekendData | null } | null>(null);
  const k = `${year}:${meeting}`;
  useEffect(() => {
    let live = true;
    fetch(`/api/f1/weekend?meeting=${encodeURIComponent(meeting)}&year=${year}`)
      .then((r) => (r.ok ? (r.json() as Promise<WeekendData | null>) : null))
      .then((d) => live && setW({ k, d }))
      .catch(() => live && setW({ k, d: null }));
    return () => {
      live = false;
    };
  }, [meeting, year, k]);
  return w?.k === k ? w.d : undefined;
}

function Countdown({ at }: { at: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const ms = Date.parse(at) - now;
  if (ms <= 0) return <span style={{ color: "var(--hue-f1)" }}>Starting</span>;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return <span>in {h >= 24 ? `${Math.floor(h / 24)} d ${h % 24} h` : h ? `${h} h ${m} min` : `${m} min`}</span>;
}

function SessionCard({ s, on, onOpen }: { s: WeekendSession; on: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`text-left rounded-2xl border p-4 flex flex-col gap-3 transition-colors min-w-0 ${on ? "" : "border-[var(--card-border)] bg-[var(--card-bg)] hover:border-[color:var(--ink-faint)]"}`}
      style={on ? { borderColor: "var(--hue-f1)", background: "color-mix(in srgb, var(--hue-f1) 9%, var(--card-bg))" } : undefined}
      aria-current={on || undefined}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-sans font-bold text-[14px]">{s.name}</span>
        <span className="font-mono text-[11px] text-ink-faint">{day(s.end)}</span>
      </div>
      <ol className="space-y-1.5">
        {s.rows.slice(0, 3).map((r) => (
          <li key={r.code} className="grid grid-cols-[1.1rem_minmax(0,1fr)_auto] items-center gap-2 text-[12px]">
            <span className="font-mono text-[11px]" style={{ color: ["#c99a06", "var(--ink-soft)", "#C9792E"][r.pos - 1] }}>
              {r.pos}
            </span>
            <span className="flex items-center gap-1.5 min-w-0">
              <TeamGlyph team={r.team} colour={r.colour} size={13} />
              <span className="font-sans font-semibold truncate">{r.name}</span>
            </span>
            <span className="font-mono text-[11px] text-ink-soft tabular-nums">{r.time}</span>
          </li>
        ))}
      </ol>
      <div className="mt-auto pt-2 border-t hairline flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-ink-faint">
        {s.fastest && (
          <span>
            <span style={{ color: "var(--f1-fastest)" }}>■</span> {s.fastest.code} {s.fastest.time}
          </span>
        )}
        {s.air !== null && (
          <span>
            {s.rain && <><CloudRainIcon size={13} className="inline align-[-2px]" role="img" aria-label="Wet" />{" "}</>}
            <ThermometerSimpleIcon size={13} className="inline align-[-2px]" role="img" aria-label="Air" /> {s.air.toFixed(0)}° <ThermometerHotIcon size={13} className="inline align-[-2px] ml-1" role="img" aria-label="Track" /> {s.track?.toFixed(0)}°
          </span>
        )}
        <span className="ml-auto font-label text-[11px]" style={{ color: on ? "var(--hue-f1)" : undefined }}>
          {on ? "On show" : <>Open <ArrowRightIcon size={13} weight="bold" className="inline align-[-2px]" aria-hidden="true" /></>}
        </span>
      </div>
    </button>
  );
}

/** A driver's place in a session, coloured like the season's grid. */
function Place({ s, code, name }: { s: WeekendSession; code: string; name: string }) {
  const r = s.rows.find((x) => x.code === code);
  if (!r) return <td className="text-center text-ink-faint">–</td>;
  const out = r.out && s.type === "Race";
  const t = tone({ pos: r.pos, text: out ? "DNF" : String(r.pos), points: 0, grid: null, status: "", laps: null, fastestLap: null, fastestOfAll: false });
  return (
    <td className="p-0">
      <span className="block rounded-md h-7 leading-7 text-center font-mono font-semibold text-[11px]" style={{ background: t.bg, color: t.fg }} title={`${name} · ${s.name}: P${r.pos}${r.time ? ` · ${r.time}` : ""}`}>
        {out ? "DNF" : r.pos}
      </span>
    </td>
  );
}

/** Every driver's place in every session so far: a driver a row, or from 2400px a driver a column. */
function Form({ sessions, onDriver }: { sessions: WeekendSession[]; onDriver: (code: string) => void }) {
  const latest = sessions.at(-1);
  if (!latest) return null;
  const order = latest.rows.map((r) => r.code);
  const all = new Map(sessions.flatMap((s) => s.rows.map((r) => [r.code, r] as const)));
  return (
    <>
    <div className="week-form-across hidden">
      <table className="data-table matrix w-full table-fixed border-separate border-spacing-[3px] text-[11.5px] tabular-nums">
        <colgroup>
          <col style={{ width: "3.6rem" }} />
          {order.map((code) => (
            <col key={code} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th aria-label="Session" />
            {order.map((code) => {
              const d = all.get(code)!;
              return (
                <th key={code} className="font-normal pb-1.5">
                  <button type="button" onClick={() => onDriver(code)} aria-label={d.name} title={d.name} className="group w-full flex flex-col items-center gap-1">
                    <span className="w-5 h-[3px] rounded-full" style={{ background: d.colour }} />
                    <TeamGlyph team={d.team} colour={d.colour} size={14} />
                    <span className="font-sans font-semibold group-hover:text-[color:var(--hue-f1)] transition-colors">{code}</span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.path}>
              <th scope="row" className="font-label font-normal text-[11px] text-ink-faint text-left px-1">
                {SHORT[s.name] ?? s.name}
              </th>
              {order.map((code) => (
                <Place key={code} s={s} code={code} name={all.get(code)!.name} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <div className="week-form overflow-x-auto -mx-1 px-1">
      <table className="data-table matrix border-separate border-spacing-[3px] text-[11.5px] tabular-nums">
        {/* The driver a fixed width; every session the same width beside it. */}
        <colgroup>
          <col style={{ width: "9rem" }} />
          {sessions.map((s) => (
            <col key={s.path} style={{ width: "3.4rem" }} />
          ))}
        </colgroup>
        <thead>
          <tr className="font-label text-[11px] text-ink-faint">
            <th className="text-left font-normal px-1">Driver</th>
            {sessions.map((s) => (
              <th key={s.path} className="font-normal mid">
                {SHORT[s.name] ?? s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {order.map((code) => {
            const d = all.get(code)!;
            return (
              <tr key={code} className="group">
                <td className="px-1">
                  <button type="button" onClick={() => onDriver(code)} className="flex items-center gap-1.5 whitespace-nowrap text-left">
                    <span className="w-[3px] h-3.5 rounded-full" style={{ background: d.colour }} />
                    <TeamGlyph team={d.team} colour={d.colour} size={13} />
                    <span className="font-sans font-semibold group-hover:text-[color:var(--hue-f1)] transition-colors">{d.name}</span>
                  </button>
                </td>
                {sessions.map((s) => (
                  <Place key={s.path} s={s} code={code} name={d.name} />
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}

export default function Weekend({ snap, race, current, onPick }: { snap: LiveSnapshot; race: F1Race | null; current: string | null; onPick: (path: string | null) => void }) {
  const year = Number(snap.path?.slice(0, 4)) || new Date().getFullYear();
  const data = useWeekend(snap.meeting, year);
  const track = useTrack(snap.circuitKey);
  const season: Season | null = useSeasonData();
  const [now] = useState(() => Date.now());
  const { recap } = useInsights(snap);

  const done = data?.sessions ?? [];
  const sameWeekend = race && (race.name === snap.meeting || race.circuitKey === snap.circuitKey);
  const upcoming = sameWeekend ? (race.sessions ?? []).filter((s) => !done.some((d) => d.name === s.name) && Date.parse(s.end || s.start) > now - 3 * 3_600_000) : [];
  const place = f1Place(race?.circuit, race?.name, race?.country);
  const names = [...done.map((d) => d.name), ...upcoming.map((u) => u.name)];
  const sprint = names.includes("Sprint");
  const shown = current ?? snap.path;
  const h = data?.history;
  const first = done[0]?.end ?? upcoming[0]?.start;
  const last = upcoming.at(-1)?.start ?? done.at(-1)?.end;
  // The rounds after the one on show; with no round known, those beyond this weekend.
  // Facts that fill out the circuit's tiles, from the race and the session on show.
  const raceLaps = (snap.type === "Race" ? snap.lap?.total : undefined) ?? done.find((s) => s.type === "Race")?.rows[0]?.laps;
  const stops = (snap.pitStops ?? []).filter((p) => p.stationary !== null && p.stationary > 1 && p.stationary < 15);
  const quickest = stops.length ? stops.reduce((a, b) => (b.stationary! < a.stationary! ? b : a)) : null;
  const after = season?.rounds.filter((r) => (data?.round ? r.round > data.round : !r.done && new Date(r.date).getTime() > now + 2 * 86_400_000)).slice(0, 3) ?? [];

  return (
    <div className="space-y-6">
      {/* the round */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] gap-6">
        <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4 sm:p-6 flex flex-col">
          <div className="font-label text-[11px] text-ink-soft">
            {data?.round ? `Round ${data.round} · ` : ""}
            {first && last ? `${new Date(first).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${new Date(last).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
            {sprint ? " · sprint weekend" : ""}
          </div>
          <h2 className="font-display font-extrabold uppercase text-[clamp(1.8rem,4.5vw,3rem)] leading-[0.9] mt-2">{h?.circuit ?? track?.name ?? snap.location}</h2>
          <div className="font-sans text-[13px] text-ink-soft mt-1">{h ? `${h.locality}, ${h.country}` : snap.location}</div>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-auto pt-5">
            {[
              { Glyph: PathIcon, k: "Corners", v: track?.corners.length ? String(track.corners.length) : "—", sub: raceLaps ? `${raceLaps} race laps` : undefined },
              { Glyph: WrenchIcon, k: "A pit stop costs", v: track?.pitLoss ? `~${Math.round(track.pitLoss)} s` : "—", sub: quickest ? `Quickest ${quickest.stationary!.toFixed(1)} s · ${quickest.code}` : undefined },
              { Glyph: FlagCheckeredIcon, k: "Grands Prix here", v: h ? String(h.races) : "—", sub: h?.firstYear ? `Since ${h.firstYear}` : undefined },
              { Glyph: TrophyIcon, k: "Most wins here", v: h?.mostWins ? String(h.mostWins.wins) : "—", sub: h?.mostWins?.name },
            ].map((x) => (
              <div key={x.k} className="rounded-xl border hairline px-3 py-2.5 min-w-0">
                <dt className="font-label text-[11px] leading-tight text-ink-faint flex items-start gap-1 min-w-0">
                  <x.Glyph size={13} className="shrink-0" aria-hidden="true" />
                  <span>{x.k}</span>
                </dt>
                <dd className="font-display font-extrabold text-[1.45rem] leading-none mt-1.5">{x.v}</dd>
                {x.sub && <dd className="font-mono text-[11px] text-ink-faint mt-1 truncate">{x.sub}</dd>}
              </div>
            ))}
          </dl>
        </section>
        <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4 grid place-items-center min-h-[14rem]">
          {track ? <TrackMap model={track} /> : <div className="w-full aspect-[4/3] rounded-xl bg-[var(--rule)] animate-pulse opacity-40" />}
        </section>
      </div>

      {/* the sessions */}
      <div>
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h3 className="font-label text-[11px] tracking-[0.12em] flex items-center gap-1.5"><FlagIcon size={15} style={{ color: "var(--hue-f1)" }} aria-hidden="true" />Sessions</h3>
          {current && (
            <button type="button" onClick={() => onPick(null)} className="font-sans text-[12px] font-semibold text-ink-soft hover:text-ink">
              <ArrowLeftIcon size={13} weight="bold" className="inline align-[-2px]" aria-hidden="true" /> Back to the latest
            </button>
          )}
        </div>
        {data === undefined ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-44 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {done.map((s) => (
              <SessionCard key={s.path} s={s} on={s.path === shown} onOpen={() => onPick(s.path)} />
            ))}
            {upcoming.map((s) => (
              <div key={s.name} className="rounded-2xl border border-dashed hairline p-4 flex flex-col gap-2 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-sans font-bold text-[14px] text-ink-soft">{s.name}</span>
                  <span className="font-mono text-[11px] text-ink-faint">{day(s.start)}</span>
                </div>
                <div className="mt-1">
                  <div className="font-display font-extrabold text-[1.6rem] leading-none">
                    {istClock(s.start)} <span className="font-mono font-normal text-[11px] text-ink-soft">IST</span>
                  </div>
                  {localTime(s.start, place) && <div className="font-mono text-[11px] text-ink-soft mt-1">({localTime(s.start, place)})</div>}
                </div>
                <div className="font-mono text-[11px] text-ink-soft mt-auto">
                  <Countdown at={s.start} />
                </div>
              </div>
            ))}
            {done.length === 0 && upcoming.length === 0 && <p className="font-mono text-[11px] text-ink-faint">No sessions found for this weekend.</p>}
          </div>
        )}
      </div>

      {recap && <SessionRecapCard recap={recap} />}

      {/* The weekend's form (five or six sessions: a narrow table) beside the
          circuit's history, the lap benchmarks and the rounds after this one. */}
      {/* Both columns end level: the shorter one's last panel stretches to the other's foot.
          From 2400px the form runs the full width and the other three share a row under it. */}
      <div className={`week-lower grid grid-cols-1 gap-6 items-stretch ${done.length > 1 ? "lg:grid-cols-[auto_minmax(0,1fr)]" : ""}`}>
        {done.length > 1 && (
          <Panel icon={TableIcon} label="Across the weekend" meta="Tap a name for their season" className="week-across lg:w-max">
            <Form sessions={done} onDriver={openDriver} />
          </Panel>
        )}
        <div className="week-rest flex flex-col gap-6 min-w-0 [&>*:last-child]:flex-1">
          <Panel icon={ClockCounterClockwiseIcon} className="week-recent" label="Recent years here" meta={h ? `${h.races} Grands Prix since ${h.firstYear}` : undefined}>
            {!h ? (
              <p className="font-mono text-[11px] text-ink-faint">{data === undefined ? "Reading…" : "No history: a new venue."}</p>
            ) : (
              <div className="week-recent-body overflow-x-auto -mx-1 px-1">
                <table className="data-table text-[12px] min-w-[28rem]">
                  <colgroup>
                    <col style={{ width: "3.5rem" }} />
                    <col />
                    <col />
                    <col />
                  </colgroup>
                  <thead>
                    <tr className="font-label text-[11px] text-ink-faint text-left">
                      <th className="font-normal py-1.5">Year</th>
                      <th className="font-normal"><TrophyIcon size={13} className="inline align-[-2px] mr-1" aria-hidden="true" />Winner</th>
                      <th className="font-normal"><FlagIcon size={13} className="inline align-[-2px] mr-1" aria-hidden="true" />Pole</th>
                      <th className="font-normal"><LightningIcon size={13} className="inline align-[-2px] mr-1" aria-hidden="true" />Fastest lap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {h.recent.map((r) => (
                      <tr key={r.year} className="border-t hairline">
                        <td className="font-mono py-2">{r.year}</td>
                        <td>
                          {r.winner && (
                            <span className="flex items-center gap-1.5">
                              <TeamGlyph team={r.winner.team} colour="var(--ink-faint)" size={13} />
                              <b className="font-sans">{r.winner.name}</b>
                              {r.winner.grid && r.winner.grid > 1 && <span className="font-mono text-[11px] text-ink-faint">from P{r.winner.grid}</span>}
                            </span>
                          )}
                        </td>
                        <td className="font-sans">
                          {r.pole?.name} <span className="font-mono text-[11px] text-ink-faint">{r.pole?.time}</span>
                        </td>
                        <td className="font-sans">
                          {r.fastest?.name} <span className="font-mono text-[11px] text-ink-faint">{r.fastest?.time}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          <Panel icon={WatchIcon} className="week-bench" label="Lap benchmarks">
            <Benchmarks snap={snap} />
          </Panel>
        {after.length > 0 && (
          <Panel icon={CalendarDotsIcon} className="week-after" label="After this">
            <ol className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {after.map((r) => (
                <li key={r.round} className="rounded-xl border hairline px-3.5 py-3">
                  <div className="font-label text-[11px] text-ink-faint">Round {r.round}</div>
                  <div className="font-display font-extrabold uppercase text-[1.25rem] leading-none mt-1.5">{r.name}</div>
                  <div className="font-mono text-[11px] text-ink-soft mt-1.5">
                    {new Date(r.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                    {r.sprint ? " · sprint" : ""}
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        )}
        </div>
      </div>
    </div>
  );
}
