"use client";

import { ArrowRightIcon, CalendarDotsIcon, CaretDownIcon, CaretRightIcon, CaretUpIcon, ChartBarHorizontalIcon, FlagCheckeredIcon } from "@phosphor-icons/react";
import Sheet from "@/components/extras/Sheet";
import { PHONE, useMedia } from "@/lib/use-media";
import { useRouter } from "next/navigation";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import type { F1GridResult, F1LiveResult, F1Race, F1LastRace, F1Phase, F1SessionResult, F1SessionTop } from "@/lib/types";
import { CIRCUIT_FACTS } from "@/lib/config/circuit-facts";
import { teamColor } from "@/lib/personalization";
import RacePodium from "./RacePodium";
import RaceRecapLine from "./RaceRecapLine";
import RaceWeekend from "./RaceWeekend";
import OddsSheet from "./OddsSheet";
import { RaceOddsContext } from "@/components/odds/odds-context";
import { compactMoney } from "@/lib/odds-pick";
import { F1_DRIVERS } from "@/lib/config/f1-drivers";
import type { OddsMarket } from "@/lib/types";
import type { LiveSnapshot } from "@/lib/f1-live-types";
import LiveCard from "@/components/f1/LiveCard";
import { TeamGlyph } from "@/components/f1/LiveTiming";
import TrackMap, { useTrack } from "@/components/f1/TrackMap";

type Row = F1GridResult | F1LiveResult | F1LastRace["results"][number];

function formatCountdown(ms: number) {
  if (ms <= 0) return "Lights out";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

// The per-second ticker lives in its own component so the countdown re-render
// doesn't drag the whole sidebar (tables, images, standings) along with it.
function Countdown({ target }: { target: string }) {
  const [ms, setMs] = useState<number | null>(null);
  useEffect(() => {
    const at = new Date(target).getTime();
    const tick = () => setMs(Math.max(0, at - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);
  const parts =
    ms === null
      ? null
      : [
          { label: "days", value: Math.floor(ms / 86_400_000) },
          { label: "hrs", value: Math.floor(ms / 3_600_000) % 24 },
          { label: "min", value: Math.floor(ms / 60_000) % 60 },
          { label: "sec", value: Math.floor(ms / 1000) % 60 },
        ];
  return (
    <div className="grid grid-cols-4 gap-1.5 mt-2" aria-label={ms === null ? undefined : formatCountdown(ms)}>
      {(parts ?? [{ label: "days" }, { label: "hrs" }, { label: "min" }, { label: "sec" }]).map((p) => (
        <div key={p.label} className="rounded-lg bg-card-bg border hairline px-2 pt-1.5 pb-1 text-center overflow-hidden">
          <div className="font-display font-extrabold text-[1.6rem] leading-none tabular-nums h-[1.6rem] overflow-hidden">
            {"value" in p ? (
              <span key={p.value} className="block animate-[tick-in_0.45s_var(--ease-out)]">
                {String(p.value).padStart(2, "0")}
              </span>
            ) : (
              "—"
            )}
          </div>
          <div className="font-label text-[11px] text-ink-soft mt-1">{p.label}</div>
        </div>
      ))}
    </div>
  );
}

/** A driver's team, from the season's roster, by surname ("Andrea Kimi Antonelli" → Mercedes). */
function teamOf(name: string): string {
  const last = name.trim().split(/\s+/).pop()?.toLowerCase() ?? "";
  return F1_DRIVERS.find((d) => d.lastName.toLowerCase() === last)?.teamName ?? "";
}

/** Who wins the next Grand Prix, by the traders' money: the leading drivers
 *  with bars in team colours; a tap opens the whole market. */
function RaceOdds({ market: m }: { market: OddsMarket }) {
  const [open, setOpen] = useState(false);
  const field = m.outcomes.slice(0, 5);
  const max = Math.max(...field.map((o) => o.prob), 1);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="module pit-wins block w-full text-left group" data-reveal>
        <div className="flex items-baseline justify-between gap-2 mb-2.5">
          <span className="font-label text-[11px] text-ink-soft inline-flex items-center gap-1.5">
            <ChartBarHorizontalIcon size={14} aria-hidden="true" />
            Who wins Sunday · traders&rsquo; odds
          </span>
          <span className="font-mono text-[11px] text-ink-faint group-hover:text-ink">chart <CaretRightIcon size={12} weight="bold" className="inline align-[-2px]" aria-hidden="true" /></span>
        </div>
        <ul className="space-y-1.5">
          {field.map((o) => {
            const team = teamOf(o.name);
            return (
              <li key={o.name} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_2.6rem] items-center gap-2">
                <span className="font-sans font-semibold text-[12.5px] truncate">{o.name}</span>
                <span className="h-2 rounded-full bg-[color:var(--rule)] overflow-hidden">
                  <span className="block h-full rounded-full" style={{ width: `${Math.max(2, (o.prob / max) * 100)}%`, background: team ? teamColor(team) : "var(--section-hue)" }} />
                </span>
                <span className="font-mono text-[12px] tabular-nums text-right">{Math.round(o.prob)}%</span>
              </li>
            );
          })}
        </ul>
        <div className="font-mono text-[11px] text-ink-faint mt-2.5">
          {m.source} · ${compactMoney(m.vol)} traded{m.also?.length ? ` · ${m.also.map((a) => `${a.source} ${Math.round(a.prob)}%`).join(" · ")}` : ""}
        </div>
      </button>
      {open && <OddsSheet market={m} why="The next Grand Prix" onClose={() => setOpen(false)} />}
    </>
  );
}

const SESSION_LABEL: Record<string, string> = {
  "Practice 1": "FP1",
  "Practice 2": "FP2",
  "Practice 3": "FP3",
  "Sprint Qualifying": "Sprint quali",
  "Sprint Shootout": "Sprint quali",
  Sprint: "Sprint",
};

// One timing row's height (py-1.5 around 12px text, plus its rule).
const ROW_H = 30;

// Pulsing hairline rows, styled like the table they stand in for.
function TimingRowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="animate-pulse" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-baseline justify-between border-t hairline first:border-t-0 py-1.5">
          <span className="inline-block w-4 h-2.5 bg-card-bg rounded-sm" />
          <span className="inline-block w-20 h-2.5 bg-card-bg rounded-sm" />
          <span className="inline-block w-12 h-2.5 bg-card-bg rounded-sm" />
        </div>
      ))}
    </div>
  );
}

// The pit wall's race desk, one job per card:
//   1. Next race  — round, name, circuit map and the countdown to lights out
//   2. Race weekend — every session in the reader's time (RaceWeekend)
//   3. Coming up  — the next rounds of the calendar
//   4. Timing     — last race's podium (RacePodium) and field, or the grid / live
//                   order, under a chequered head with the weekend as timing sectors
// During a race the first card turns into a "live now" header and the
// timing card carries the running order.
//
// `part` splits the cards between the places the F1 section has: the "desk"
// beside the stories (next race and its weekend, and the live order during a
// race) and the full-width row under them: "archive" (the last race, beside the
// reader's paddock) and, at the end of that row, "calendar" (who wins Sunday,
// coming up). So the column beside the stories never outgrows them.

export default function StartingGrid({
  nextRace,
  upcoming,
  lastRace = null,
  qualifyingGrid = [],
  liveResults = [],
  currentRace = null,
  racePhase = "last-race",
  calendarStatus = "ready",
  onRetryCalendar,
  sessionStatus = "ready",
  sessionStale = false,
  onRetrySession,
  part = "desk",
  session = null,
  weekendName = null,
  gridSetAt = null,
  tops = {},
  gridPending = false,
  sprint = false,
  liveSnap = null,
}: {
  /** A session running now (or just ended): the timing card goes live. */
  liveSnap?: LiveSnapshot | null;
  gridPending?: boolean;
  /** The weekend runs a sprint: the progress marker gains a Sprint step. */
  sprint?: boolean;
  session?: F1SessionResult | null;
  weekendName?: string | null;
  gridSetAt?: string | null;
  tops?: Record<string, F1SessionTop>;
  part?: "desk" | "archive" | "calendar";
  nextRace: F1Race;
  upcoming: F1Race[];
  lastRace?: F1LastRace | null;
  qualifyingGrid?: F1GridResult[];
  liveResults?: F1LiveResult[];
  currentRace?: F1Race | null;
  racePhase?: F1Phase;
  accentColor?: string;
  /** Status of the calendar part feeding the "Coming up" card. */
  calendarStatus?: "loading" | "ready" | "failed";
  onRetryCalendar?: () => void;
  /** Status of the slower "results" part feeding the timing card — the
   *  next-race card renders immediately; this one fills in behind it and
   *  offers a scoped retry when the timing screens genuinely fail. */
  sessionStatus?: "loading" | "ready" | "failed";
  /** True when rows are from an earlier pull and the last refresh failed. */
  sessionStale?: boolean;
  onRetrySession?: () => void;
}) {
  const trackFact = useMemo(() => {
    const facts = CIRCUIT_FACTS[nextRace.circuit];
    return facts && facts.length > 0 ? facts[0] : null;
  }, [nextRace.circuit]);
  const router = useRouter();
  const [wantAll, setShowAll] = useState(false);
  // On a phone the whole order slides up in a sheet; on anything bigger it opens in place.
  const phone = useMedia(PHONE);
  const showAll = wantAll && !phone;
  const raceOdds = useContext(RaceOddsContext);
  const track = useTrack(part === "desk" ? nextRace.circuitKey : null);
  const live = racePhase === "race" && currentRace !== null;
  const displayedRace = live && currentRace ? currentRace : nextRace;

  const resultRows: Row[] = racePhase === "race"
    ? liveResults.length > 0 ? liveResults : qualifyingGrid
    : racePhase === "qualifying"
      ? qualifyingGrid.length > 0 ? qualifyingGrid : session?.rows ?? []
      : racePhase === "practice"
        ? session?.rows ?? []
        : lastRace?.results ?? [];
  const showPodium = racePhase === "last-race" && resultRows.length >= 3;
  const tableRows = showPodium ? resultRows.filter((r) => (r.position ?? 99) > 3) : resultRows;
  // Folded, the table shows as many rows as fit the height its row of the
  // page gives it (set by Your paddock beside it), never fewer than the base.
  const baseRows = showPodium ? 4 : 5;
  const listRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(baseRows);
  useEffect(() => {
    const el = listRef.current;
    if (!el || showAll) return;
    const measure = () => {
      // A row's screen height carries the page's zoom (.page-scale); the box's own
      // height doesn't, so the zoom is taken back out, as in lib/use-fit-rows.ts.
      const zoom = el.offsetHeight > 0 ? el.getBoundingClientRect().height / el.offsetHeight || 1 : 1;
      const rowH = (el.querySelector("tr")?.getBoundingClientRect().height ?? 0) / zoom || ROW_H;
      setFit(Math.max(baseRows, Math.floor(el.clientHeight / rowH)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [showAll, baseRows, tableRows.length]);
  const visibleRows = showAll ? tableRows : tableRows.slice(0, fit);
  const sprintQuali = /^Sprint (Qualifying|Shootout)$/.test(session?.name ?? "");
  const timingTitle = racePhase === "race"
    ? liveResults.length > 0 ? "Live race" : "Starting grid"
    : racePhase === "qualifying"
      ? "Starting grid"
      : racePhase === "practice"
        ? sprintQuali
          ? "Sprint grid"
          : `${SESSION_LABEL[session?.name ?? ""] ?? session?.name ?? "Practice"} times`
        : "Race result";
  const timingRace =
    racePhase === "last-race"
      ? (lastRace?.name ?? "").replace(/ — Race$/, "")
      : racePhase === "practice"
        ? (session?.race ?? displayedRace.name)
        : (weekendName ?? displayedRace.name);
  // One line under the title on what the table is.
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const timingNote =
    racePhase === "practice" && session
      ? session.name === "Sprint"
        ? `Sprint result · ${day(session.end)}`
        : sprintQuali
          ? `Set in sprint qualifying · ${day(session.end)} · the sprint follows`
          : `Best laps · ${day(session.end)} · grid set in qualifying`
      : racePhase === "qualifying" && gridPending
        ? `Qualifying is over; the timing feed hasn't released the grid yet.${session ? ` ${SESSION_LABEL[session.name] ?? session.name} times until it does.` : ""}`
        : racePhase === "qualifying"
        ? `Set in qualifying${gridSetAt ? ` · ${day(gridSetAt)}` : ""} · the result follows the race`
        : racePhase === "last-race" && lastRace
          ? `Classified · ${day(lastRace.date)}`
          : null;
  // Where the weekend is: practice; on a sprint weekend the sprint's grid
  // (sprint qualifying) and the sprint; then the race's grid and result.
  const steps = [
    { key: "practice", label: "Practice" },
    ...(sprint ? [{ key: "sprint-grid", label: "Sprint grid" }, { key: "sprint", label: "Sprint" }] : []),
    { key: "qualifying", label: "Grid" },
    { key: "last-race", label: "Result" },
  ];
  const stepKey =
    racePhase === "race"
      ? "qualifying"
      : racePhase === "practice" && sprint && sprintQuali
        ? "sprint-grid"
        : racePhase === "practice" && sprint && session?.name === "Sprint"
          ? "sprint"
          : racePhase;
  const stepAt = steps.findIndex((s) => s.key === stepKey);
  const lightsOut = new Date(nextRace.date);
  // The timing card sits on the desk only while a race is running.
  const timingHere = live ? part === "desk" : part === "archive";

  return (
    <>
      {part === "desk" && (
      <>
      {/* 1. Next race: the round, the place, the track and the clock. */}
      <div
        className="module relative overflow-hidden"
        data-reveal
        style={{ background: "linear-gradient(160deg, color-mix(in srgb, var(--section-hue) 12%, var(--card-bg)) 0%, var(--card-bg) 55%)" }}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className="rounded-full px-2.5 py-0.5 font-label text-[11px]"
            style={{ background: "var(--section-hue)", color: "var(--paper)" }}
          >
            {live || liveSnap?.running ? "Live now" : "Next up"} · Round {displayedRace.round}
          </span>
          <span className="font-label text-[11px] text-ink-soft truncate">{displayedRace.country}</span>
        </div>
        <div className="font-display font-extrabold uppercase text-[1.9rem] leading-[0.9] mt-3">{displayedRace.name}</div>
        <div className="font-mono text-[11px] text-ink-soft mt-1">{displayedRace.circuit}</div>

        {!live && track && (
          // Just the circuit, turning slowly in 3D. Tilted back it reads about
          // two-thirds as tall as it is wide, so the box is that tall (the
          // map overflows it, unclipped) rather than the square it lays out as.
          <div className="my-2 h-36 flex items-center justify-center [perspective:900px]">
            <div className="track-turn w-full max-w-[13rem] shrink-0">
              <TrackMap model={track} minimal corners={false} label={`${nextRace.circuit} track layout`} />
            </div>
          </div>
        )}
        {!live && !track && nextRace.circuitImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={nextRace.circuitImageUrl}
            alt={`${nextRace.circuit} track layout`}
            className="w-full h-40 object-contain my-4 invert-evening"
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        )}
        {!live && (
          <>
            <Countdown target={nextRace.date} />
            <div className="flex justify-between gap-2 font-mono text-[11px] text-ink-soft mt-2">
              <span>Until lights out</span>
              <span suppressHydrationWarning>
                {lightsOut.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} ·{" "}
                {lightsOut.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          </>
        )}
        {!live && trackFact && (
          <p className="text-[11px] text-ink-soft italic leading-relaxed mt-4 pt-3 border-t hairline">
            <span className="font-label not-italic text-[11px] mr-1.5">Track fact</span>
            {trackFact}
          </p>
        )}
      </div>

      {/* 2. The weekend, session by session. */}
      {!live && nextRace.sessions && nextRace.sessions.length > 0 && <RaceWeekend sessions={nextRace.sessions} tops={tops} />}
      </>
      )}

      {part === "calendar" && !live && raceOdds && <RaceOdds market={raceOdds} />}

      {/* 3. Coming up — the calendar after this weekend. */}
      {part !== "calendar" ? null : upcoming.length > 1 ? (
        <div className="module pit-coming" data-reveal>
          <div className="font-label text-[11px] text-ink-soft mb-2 flex items-center gap-1.5">
            <CalendarDotsIcon size={14} aria-hidden="true" />
            Coming up
          </div>
          <ol>
            {upcoming.slice(1).map((race) => (
              <li key={race.round} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-baseline gap-2 border-t hairline first:border-t-0 py-2">
                <span className="font-mono text-[11px] text-ink-faint">R{race.round}</span>
                <span className="font-sans text-[13px] truncate">{race.name}</span>
                <span className="font-mono text-[11px] text-ink-soft">
                  {new Date(race.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : calendarStatus === "loading" ? (
        <div className="module pit-coming">
          <div className="font-label text-[11px] text-ink-soft mb-1">Coming up</div>
          <TimingRowsSkeleton rows={4} />
        </div>
      ) : calendarStatus === "failed" ? (
        <div className="module pit-coming">
          <div className="font-label text-[11px] text-ink-soft mb-1">Coming up</div>
          <p className="text-[11px] text-ink-soft italic">
            The race calendar didn&rsquo;t answer.{" "}
            {onRetryCalendar && (
              <button
                type="button"
                onClick={onRetryCalendar}
                className="font-label text-[11px] text-accent underline not-italic ml-1"
              >
                Try again
              </button>
            )}
          </p>
        </div>
      ) : null}

      {/* 4. Timing — the slower "session" part streams in behind the rest. No
          refresh here by design: the single control lives in the pit-wall
          header, so the two can never race each other. */}
      {timingHere && liveSnap && (
        <div className={part === "archive" ? "pit-result min-w-0 flex" : "min-w-0 flex"}>
          <LiveCard snap={liveSnap} />
        </div>
      )}
      {timingHere && !liveSnap && (resultRows.length > 0 || sessionStatus !== "ready" || gridPending) && (
        <div className={`module self-stretch flex flex-col ${part === "archive" ? "pit-result" : ""}`} data-reveal>
          {/* The card's head: a chequered band, what this is and when, the race's name,
              and where the weekend is, as a run of timing sectors. */}
          <div className="result-check" aria-hidden="true" />
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
            <span className="font-label text-[11px] text-ink-soft inline-flex items-center gap-1.5">
              <FlagCheckeredIcon size={14} aria-hidden="true" />
              {sessionStatus === "ready" ? timingTitle : "Timing screens"}
            </span>
            {racePhase === "race" && liveResults.length > 0 ? (
              <span className="font-mono text-[11px] text-down">● live</span>
            ) : (
              sessionStatus === "ready" && timingNote && <span className="font-mono text-[11px] text-ink-soft">{timingNote}</span>
            )}
          </div>
          {sessionStatus === "ready" && timingRace && (
            <div className="result-title">
              <span>{timingRace}</span>
            </div>
          )}
          {sessionStatus === "ready" && (
            <ol className="result-sectors" aria-label="Weekend progress">
              {steps.map((s, i) => (
                <li key={s.key} data-state={i === stepAt ? "now" : i < stepAt ? "done" : undefined} aria-current={i === stepAt ? "step" : undefined}>
                  <i aria-hidden="true" />
                  {s.label}
                </li>
              ))}
            </ol>
          )}

          {sessionStatus === "loading" && resultRows.length === 0 && (
            <>
              <TimingRowsSkeleton />
              <p className="text-[11px] text-ink-soft italic mt-2">Waiting on the timing screens…</p>
            </>
          )}

          {sessionStatus === "failed" && resultRows.length === 0 && (
            <p className="text-[11px] text-ink-soft italic mt-1">
              The timing screens didn&rsquo;t answer.{" "}
              {onRetrySession && (
                <button
                  type="button"
                  onClick={onRetrySession}
                  className="font-label text-[11px] text-accent underline not-italic ml-1"
                >
                  Try again
                </button>
              )}
            </p>
          )}

          {resultRows.length > 0 && (
            <>
              {showPodium && <RacePodium rows={resultRows} />}
              {showPodium && lastRace && <RaceRecapLine date={lastRace.date} />}
              {/* Folded, the table sits out of the flow so the card's height
                  comes from its neighbour; the rows then fill what it gives. */}
              <div
                ref={listRef}
                className={showAll ? "mt-2" : "relative flex-1 mt-2"}
                style={showAll ? undefined : { minHeight: Math.min(baseRows, tableRows.length) * ROW_H }}
              >
              {/* A tap on the order opens the live centre — unmarked, for those who know. */}
              <table className={`data-table text-xs ${showAll ? "" : "absolute inset-x-0 top-0"}`} onClick={() => router.push("/f1/live")}>
                <colgroup>
                  <col style={{ width: "1.75rem" }} />
                  <col />
                  <col style={{ width: "28%" }} />
                  <col style={{ width: "4.75rem" }} />
                </colgroup>
                <tbody>
                  {visibleRows.map((r) => (
                    <tr key={`${r.position ?? "dnf"}-${r.code}`} className="border-t hairline first:border-t-0">
                      <td className="py-1.5 font-mono text-ink-soft">{r.position ?? "—"}</td>
                      <td className="py-1.5">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="inline-block w-[3px] h-3 rounded-full shrink-0" style={{ background: teamColor(r.team) }} />
                          <TeamGlyph team={r.team} colour={teamColor(r.team) ?? "var(--ink-faint)"} />
                          <span className="font-semibold font-sans truncate">{r.driver}</span>
                        </span>
                      </td>
                      <td className="py-1.5 pl-2 font-sans text-ink-soft">{r.team}</td>
                      <td className="py-1.5 num font-mono text-ink-soft">
                        {"interval" in r ? r.interval : r.time}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              {tableRows.length > fit && (
                <button
                  type="button"
                  onClick={() => setShowAll((value) => !value)}
                  className="self-start inline-flex items-center gap-1 font-sans text-[12px] font-semibold text-ink-soft hover:text-ink mt-3"
                >
                  {showAll ? "Show fewer" : `Show all ${resultRows.length} drivers`}
                  {phone ? <ArrowRightIcon size={13} weight="bold" aria-hidden="true" /> : showAll ? <CaretUpIcon size={13} weight="bold" aria-hidden="true" /> : <CaretDownIcon size={13} weight="bold" aria-hidden="true" />}
                </button>
              )}
              {wantAll && phone && (
                <Sheet title={timingTitle} kicker={timingRace || undefined} onClose={() => setShowAll(false)} width={560}>
                  <table className="data-table text-xs">
                    <colgroup>
                      <col style={{ width: "1.75rem" }} />
                      <col />
                      <col style={{ width: "4.75rem" }} />
                    </colgroup>
                    <tbody>
                      {resultRows.map((r) => (
                        <tr key={`${r.position ?? "dnf"}-${r.code}`} className="border-t hairline first:border-t-0">
                          <td className="py-2 font-mono text-ink-soft">{r.position ?? "—"}</td>
                          <td className="py-2">
                            <span className="flex items-center gap-2 min-w-0">
                              <TeamGlyph team={r.team} colour={teamColor(r.team) ?? "var(--ink-faint)"} />
                              <span className="font-semibold font-sans truncate">{r.driver}</span>
                            </span>
                          </td>
                          <td className="py-2 num font-mono text-ink-soft">{"interval" in r ? r.interval : r.time}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Sheet>
              )}
              {sessionStale && (
                <p className="text-[11px] text-ink-soft italic mt-2">
                  Showing the last timing we have.{" "}
                  {onRetrySession && (
                    <button
                      type="button"
                      onClick={onRetrySession}
                      className="font-label text-[11px] text-accent underline not-italic"
                    >
                      Try again
                    </button>
                  )}
                </p>
              )}
            </>
          )}
        </div>
      )}

    </>
  );
}
