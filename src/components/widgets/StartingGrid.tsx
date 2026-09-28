"use client";

import { useEffect, useMemo, useState } from "react";
import type { F1GridResult, F1LiveResult, F1Race, F1LastRace } from "@/lib/types";
import { CIRCUIT_FACTS } from "@/lib/config/circuit-facts";
import { teamColor } from "@/lib/personalization";
import RaceWeekend from "./RaceWeekend";

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
    <div className="grid grid-cols-4 gap-1.5 mt-3" aria-label={ms === null ? undefined : formatCountdown(ms)}>
      {(parts ?? [{ label: "days" }, { label: "hrs" }, { label: "min" }, { label: "sec" }]).map((p) => (
        <div key={p.label} className="rounded-lg bg-card-bg border hairline px-2 pt-2 pb-1.5 text-center overflow-hidden">
          <div className="font-display font-extrabold text-[2rem] leading-none tabular-nums h-8 overflow-hidden">
            {"value" in p ? (
              <span key={p.value} className="block animate-[tick-in_0.45s_var(--ease-out)]">
                {String(p.value).padStart(2, "0")}
              </span>
            ) : (
              "—"
            )}
          </div>
          <div className="font-label text-[8px] text-ink-soft mt-1">{p.label}</div>
        </div>
      ))}
    </div>
  );
}

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
//   3. Timing     — last race's podium and field (or the grid / live order)
//   4. Coming up  — the next rounds of the calendar
// During a race the first card turns into a "live now" header and the
// timing card carries the running order.
//
// `part` splits the cards between the two places the F1 section has: the
// "desk" beside the stories (next race, its weekend — and the live order
// during a race) and the full-width "archive" row under them (last race and
// the calendar), so the column beside the stories never outgrows them.

type Row = F1GridResult | F1LiveResult | F1LastRace["results"][number];

function Podium({ rows }: { rows: Row[] }) {
  // P2 · P1 · P3, with P1 raised — a real podium, read left to right.
  const byPos = (n: number) => rows.find((r) => r.position === n);
  const order = [byPos(2), byPos(1), byPos(3)];
  if (order.some((r) => !r)) return null;
  const heights = ["h-14", "h-20", "h-10"];
  return (
    <div className="grid grid-cols-3 items-end gap-2 mt-2 mb-4">
      {order.map((r, i) => {
        const color = teamColor(r!.team);
        return (
          <div key={r!.code} className="flex flex-col items-center text-center min-w-0">
            <span className="font-sans font-semibold text-[12px] leading-tight truncate max-w-full">{r!.driver}</span>
            <span className="font-mono text-[9px] text-ink-soft truncate max-w-full mb-1.5">{r!.team}</span>
            <span
              className={`w-full ${heights[i]} rounded-t-md flex items-start justify-center pt-1.5 font-display font-extrabold text-[1.3rem] leading-none bar-grow-y`}
              style={{ background: `color-mix(in srgb, ${color} 75%, var(--paper))`, color: "var(--paper)", ["--bar-i" as string]: i }}
            >
              {r!.position}
            </span>
          </div>
        );
      })}
    </div>
  );
}

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
}: {
  part?: "desk" | "archive";
  nextRace: F1Race;
  upcoming: F1Race[];
  lastRace?: F1LastRace | null;
  qualifyingGrid?: F1GridResult[];
  liveResults?: F1LiveResult[];
  currentRace?: F1Race | null;
  racePhase?: "last-race" | "qualifying" | "race";
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
  const [showAll, setShowAll] = useState(false);
  const live = racePhase === "race" && currentRace !== null;
  const displayedRace = live && currentRace ? currentRace : nextRace;

  const resultRows: Row[] = racePhase === "race"
    ? liveResults.length > 0 ? liveResults : qualifyingGrid
    : racePhase === "qualifying"
      ? qualifyingGrid
      : lastRace?.results ?? [];
  const showPodium = racePhase === "last-race" && resultRows.length >= 3;
  const tableRows = showPodium ? resultRows.filter((r) => (r.position ?? 99) > 3) : resultRows;
  const visibleRows = showAll ? tableRows : tableRows.slice(0, showPodium ? 4 : 5);
  const timingTitle = racePhase === "race"
    ? liveResults.length > 0 ? "Live race" : "Starting grid"
    : racePhase === "qualifying"
      ? "Race grid"
      : "Last race";
  const timingRace = racePhase === "last-race" ? (lastRace?.name ?? "") : displayedRace.name;
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
            className="rounded-full px-2.5 py-0.5 font-label text-[9px]"
            style={{ background: "var(--section-hue)", color: "var(--paper)" }}
          >
            {live ? "Live now" : "Next up"} · Round {displayedRace.round}
          </span>
          <span className="font-label text-[9px] text-ink-soft truncate">{displayedRace.country}</span>
        </div>
        <div className="font-display font-extrabold uppercase text-[1.9rem] leading-[0.9] mt-3">{displayedRace.name}</div>
        <div className="font-mono text-[10px] text-ink-soft mt-1">{displayedRace.circuit}</div>

        {!live && nextRace.circuitImageUrl && (
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
            <div className="flex justify-between gap-2 font-mono text-[10px] text-ink-soft mt-2">
              <span>until lights out</span>
              <span suppressHydrationWarning>
                {lightsOut.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} ·{" "}
                {lightsOut.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          </>
        )}
        {!live && trackFact && (
          <p className="text-[11px] text-ink-soft italic leading-relaxed mt-4 pt-3 border-t hairline">
            <span className="font-label not-italic text-[9px] mr-1.5">Track fact</span>
            {trackFact}
          </p>
        )}
      </div>

      {/* 2. The weekend, session by session. */}
      {!live && nextRace.sessions && nextRace.sessions.length > 0 && <RaceWeekend sessions={nextRace.sessions} />}
      </>
      )}

      {/* 3. Timing — the slower "session" part streams in behind the rest. No
          refresh here by design: the single control lives in the pit-wall
          header, so the two can never race each other. */}
      {timingHere && (resultRows.length > 0 || sessionStatus !== "ready") && (
        <div className="module self-stretch" data-reveal>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-label text-[10px] text-ink-soft">
              {sessionStatus === "ready" ? timingTitle : "Timing screens"}
            </span>
            {racePhase === "race" && liveResults.length > 0 && (
              <span className="font-mono text-[10px] text-down">● live</span>
            )}
          </div>
          {sessionStatus === "ready" && timingRace && (
            <div className="font-headline text-[15px] leading-tight mt-1">{timingRace}</div>
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
                  className="font-label text-[10px] text-accent underline not-italic ml-1"
                >
                  Try again
                </button>
              )}
            </p>
          )}

          {resultRows.length > 0 && (
            <>
              {showPodium && <Podium rows={resultRows} />}
              <table className="w-full text-xs mt-2">
                <tbody>
                  {visibleRows.map((r) => (
                    <tr key={`${r.position ?? "dnf"}-${r.code}`} className="border-t hairline first:border-t-0">
                      <td className="py-1.5 font-mono w-6 text-ink-soft">{r.position ?? "—"}</td>
                      <td className="py-1.5">
                        <span className="inline-block w-[3px] h-3 rounded-full mr-2 align-middle" style={{ background: teamColor(r.team) }} />
                        <span className="font-semibold font-sans">{r.driver}</span>
                      </td>
                      <td className="py-1.5 text-ink-soft truncate max-w-[80px]">{r.team}</td>
                      <td className="py-1.5 text-right font-mono text-ink-soft">
                        {"interval" in r ? r.interval : r.time}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {resultRows.length > 5 && (
                <button
                  type="button"
                  onClick={() => setShowAll((value) => !value)}
                  className="font-sans text-[12px] font-semibold text-ink-soft hover:text-ink mt-3"
                >
                  {showAll ? "Show fewer" : `Show all ${resultRows.length} drivers`}
                </button>
              )}
              {sessionStale && (
                <p className="text-[10px] text-ink-soft italic mt-2">
                  Showing the last timing we have.{" "}
                  {onRetrySession && (
                    <button
                      type="button"
                      onClick={onRetrySession}
                      className="font-label text-[10px] text-accent underline not-italic"
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

      {/* 4. Coming up — the calendar after this weekend. */}
      {part !== "archive" ? null : upcoming.length > 1 ? (
        <div className="module self-stretch" data-reveal>
          <div className="font-label text-[10px] text-ink-soft mb-2">Coming up</div>
          <ol>
            {upcoming.slice(1).map((race) => (
              <li key={race.round} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-baseline gap-2 border-t hairline first:border-t-0 py-2">
                <span className="font-mono text-[11px] text-ink-faint">R{race.round}</span>
                <span className="text-[13px] truncate">{race.name}</span>
                <span className="font-mono text-[11px] text-ink-soft">
                  {new Date(race.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : calendarStatus === "loading" ? (
        <div className="module">
          <div className="font-label text-[10px] text-ink-soft mb-1">Coming up</div>
          <TimingRowsSkeleton rows={4} />
        </div>
      ) : calendarStatus === "failed" ? (
        <div className="module">
          <div className="font-label text-[10px] text-ink-soft mb-1">Coming up</div>
          <p className="text-[11px] text-ink-soft italic">
            The race calendar didn&rsquo;t answer.{" "}
            {onRetryCalendar && (
              <button
                type="button"
                onClick={onRetryCalendar}
                className="font-label text-[10px] text-accent underline not-italic ml-1"
              >
                Try again
              </button>
            )}
          </p>
        </div>
      ) : null}
    </>
  );
}
