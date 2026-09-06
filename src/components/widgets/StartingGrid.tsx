"use client";

import { useEffect, useMemo, useState } from "react";
import type { F1GridResult, F1LiveResult, F1Race, F1LastRace } from "@/lib/types";
import { CIRCUIT_FACTS } from "@/lib/config/circuit-facts";
import LiveBadge from "./LiveBadge";

function formatCountdown(ms: number) {
  if (ms <= 0) return "Lights out";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
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
  live = false,
}: {
  nextRace: F1Race;
  upcoming: F1Race[];
  lastRace?: F1LastRace | null;
  qualifyingGrid?: F1GridResult[];
  liveResults?: F1LiveResult[];
  currentRace?: F1Race | null;
  racePhase?: "last-race" | "qualifying" | "race";
  accentColor?: string;
  live?: boolean;
}) {
  const [remaining, setRemaining] = useState<string | null>(null);
  const trackFact = useMemo(() => {
    const facts = CIRCUIT_FACTS[nextRace.circuit];
    return facts && facts.length > 0 ? facts[0] : null;
  }, [nextRace.circuit]);
  const [showAll, setShowAll] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const target = new Date(nextRace.date).getTime();
    const tick = () => setRemaining(formatCountdown(target - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextRace.date]);

  const refreshLiveRace = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await fetch("/api/refresh", { method: "POST" });
      window.location.reload();
    } finally {
      setRefreshing(false);
    }
  };

  const resultRows = racePhase === "race"
    ? liveResults
    : racePhase === "qualifying"
      ? qualifyingGrid
      : lastRace?.results ?? [];
  const visibleRows = showAll ? resultRows : resultRows.slice(0, 5);
  const tableTitle = racePhase === "race"
    ? `Live race — ${currentRace?.name ?? nextRace.name}`
    : racePhase === "qualifying"
      ? `Race grid — ${nextRace.name}`
      : `Last race — ${lastRace?.flag ?? ""} ${lastRace?.name ?? ""}`;

  return (
    <div
      className="paper-box pl-5"
    >
      <div className="flex items-center justify-between mb-1">
        <div className="font-label text-[10px] text-ink-soft">Starting Grid</div>
        {live && <LiveBadge />}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl">{nextRace.flag}</span>
        <span className="font-headline text-lg font-semibold">{nextRace.name}</span>
      </div>
      {nextRace.circuitImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={nextRace.circuitImageUrl}
          alt={`${nextRace.circuit} track layout`}
          className="w-full max-h-32 object-contain my-2 bg-paper rounded-sm"
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      )}
      <div className="font-mono text-2xl mt-2 tabular-nums" suppressHydrationWarning>
        {remaining ?? "—"}
      </div>
      <div className="font-label text-[10px] text-ink-soft mt-0.5">
        until lights out at {nextRace.circuit}
      </div>

      {/* Random track fact */}
      {trackFact && (
        <div className="mt-3 pt-3 border-t hairline">
          <div className="font-label text-[10px] text-ink-soft mb-1">Track Fact</div>
          <p className="text-[11px] text-ink-soft italic leading-relaxed">{trackFact}</p>
        </div>
      )}

      {resultRows.length > 0 && (
        <div className="mt-3 pt-3 border-t hairline">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="font-label text-[10px] text-ink-soft">{tableTitle}</div>
            {racePhase === "race" && (
              <button
                type="button"
                onClick={refreshLiveRace}
                disabled={refreshing}
                className="font-label text-[10px] text-masthead-red underline disabled:opacity-40"
              >
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
            )}
          </div>
          <table className="w-full text-xs">
            <tbody>
              {visibleRows.map((r) => (
                <tr key={r.position} className="border-t hairline first:border-t-0">
                  <td className="py-1 font-mono w-5 text-ink-soft">{r.position}</td>
                  <td className="py-1 font-semibold">{r.driver}</td>
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
              className="font-label text-[10px] text-masthead-red underline mt-2"
            >
              {showAll ? "Show top 5" : `Show all ${resultRows.length} drivers`}
            </button>
          )}
        </div>
      )}

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
              <td className="py-1.5">
                <span className="mr-1">{race.flag}</span>
                {race.name}
              </td>
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
    </div>
  );
}
