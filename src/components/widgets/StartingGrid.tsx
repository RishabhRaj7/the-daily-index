"use client";

import { useEffect, useMemo, useState } from "react";
import type { F1GridResult, F1LiveResult, F1Race, F1LastRace } from "@/lib/types";
import { CIRCUIT_FACTS } from "@/lib/config/circuit-facts";

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

export default function StartingGrid({
  nextRace,
  upcoming,
  lastRace = null,
  qualifyingGrid = [],
  liveResults = [],
  currentRace = null,
  racePhase = "last-race",
  accentColor,
  calendarStatus = "ready",
  onRetryCalendar,
  sessionStatus = "ready",
  sessionStale = false,
  onRetrySession,
}: {
  nextRace: F1Race;
  upcoming: F1Race[];
  lastRace?: F1LastRace | null;
  qualifyingGrid?: F1GridResult[];
  liveResults?: F1LiveResult[];
  currentRace?: F1Race | null;
  racePhase?: "last-race" | "qualifying" | "race";
  accentColor?: string;
  /** Status of the calendar part feeding the fixture table at the bottom. */
  calendarStatus?: "loading" | "ready" | "failed";
  onRetryCalendar?: () => void;
  /** Status of the slower "results" part feeding the timing table — the map
   *  above renders immediately; this region fills in behind it and offers a
   *  scoped retry when the timing screens genuinely fail. */
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
  const displayedRace = racePhase === "race" && currentRace ? currentRace : nextRace;

  const resultRows = racePhase === "race"
    ? liveResults.length > 0 ? liveResults : qualifyingGrid
    : racePhase === "qualifying"
      ? qualifyingGrid
      : lastRace?.results ?? [];
  const visibleRows = showAll ? resultRows : resultRows.slice(0, 5);
  const tableTitle = racePhase === "race"
    ? liveResults.length > 0
      ? `Live race — ${displayedRace.name}`
      : `Starting grid — ${displayedRace.name}`
    : racePhase === "qualifying"
      ? `Race grid — ${nextRace.name}`
      : `Last race — ${lastRace?.name ?? ""}`;

  return (
    <div className="module" data-reveal>
      <div className="font-label text-[10px] text-ink-soft mb-1">
        {racePhase === "race" ? "Live now" : "Next up"} · Round {displayedRace.round}
      </div>
      <div className="font-headline text-xl leading-tight">
        {displayedRace.name}
      </div>
      {racePhase !== "race" && nextRace.circuitImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={nextRace.circuitImageUrl}
          alt={`${nextRace.circuit} track layout`}
          className="w-full max-h-36 object-contain my-3 invert-evening"
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      )}
      {racePhase !== "race" && (
        <>
          <Countdown target={nextRace.date} />
          <div className="font-mono text-[10px] text-ink-soft mt-2">
            until lights out at {nextRace.circuit}
          </div>
        </>
      )}

      {/* Random track fact */}
      {racePhase !== "race" && trackFact && (
        <div className="mt-3 pt-3 border-t hairline">
          <div className="font-label text-[10px] text-ink-soft mb-1">Track Fact</div>
          <p className="text-[11px] text-ink-soft italic leading-relaxed">{trackFact}</p>
        </div>
      )}

      {/* Results / grid table — the slower "session" part. The schedule above
          prints immediately; this region streams in behind it. */}
      {(resultRows.length > 0 || sessionStatus !== "ready") && (
        <div className="mt-3 pt-3 border-t hairline">
          {/* No refresh button here by design: the single section-scoped
              control lives in the sidebar's pit-wall header so the two can
              never race each other. Genuine failures get a retry below. */}
          <div className="font-label text-[10px] text-ink-soft mb-1">
            {sessionStatus === "ready" ? tableTitle : "Timing screens"}
          </div>

          {sessionStatus === "loading" && resultRows.length === 0 && (
            <>
              <TimingRowsSkeleton />
              <p className="text-[11px] text-ink-soft italic mt-2">
                Waiting on the timing screens…
              </p>
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
              <table className="w-full text-xs">
                <tbody>
                  {visibleRows.map((r) => (
                    <tr key={`${r.position ?? "dnf"}-${r.code}`} className="border-t hairline first:border-t-0">
                      <td className="py-1 font-mono w-5 text-ink-soft">{r.position ?? "—"}</td>
                      <td className="py-1.5 font-semibold font-sans">{r.driver}</td>
                      <td className="py-1 text-ink-soft truncate max-w-[80px]">{r.team}</td>
                      <td className="py-1 text-right font-mono text-ink-soft">
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
                  {showAll ? "Show top 5" : `Show all ${resultRows.length} drivers`}
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

      {/* Race calendar */}
      {upcoming.length > 0 ? (
        <table className="w-full mt-4 text-xs">
          <thead>
            <tr className="text-left text-ink-soft font-label text-[10px]">
              <th className="font-normal pb-1">Round</th>
              <th className="font-normal pb-1">Grand Prix</th>
              <th className="font-normal pb-1 text-right">Date</th>
            </tr>
          </thead>
          <tbody>
            {upcoming.map((race) => (
              <tr key={race.round} className="border-t hairline">
                <td className="py-1.5 font-mono">{race.round}</td>
                <td className="py-1.5">{race.name}</td>
                <td className="py-1.5 text-right font-mono">
                  {new Date(race.date).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : calendarStatus === "loading" ? (
        <div className="mt-4">
          <div className="font-label text-[10px] text-ink-soft mb-1">Race calendar</div>
          <TimingRowsSkeleton rows={4} />
        </div>
      ) : calendarStatus === "failed" ? (
        <div className="mt-4">
          <div className="font-label text-[10px] text-ink-soft mb-1">Race calendar</div>
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
    </div>
  );
}
