"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  F1ConstructorStanding,
  F1GridResult,
  F1LastRace,
  F1LiveResult,
  F1Race,
  F1RosterEntry,
  F1Standing,
} from "@/lib/types";
import type {
  F1CalendarData,
  F1ConstructorsData,
  F1DriverStandingsData,
  F1DriversData,
  F1MapData,
  F1PartResult,
  F1ResultsData,
} from "@/lib/live/f1";
import { teamColor, teamAbbrev, isLightTeamColor } from "@/lib/personalization";
import { isFresh, readF1Part, writeF1Part } from "@/lib/f1-cache";
import StartingGrid from "./StartingGrid";
import FavoriteDriverCard from "./FavoriteDriverCard";

// Progressive F1 sidebar.
//
// The section used to be one server-side waterfall of ~10 upstream calls: if
// any of them was slow the whole edition waited, and if one failed the
// sidebar printed a dead "unavailable" until the next full page load.
//
// Now each block owns its own data part, and the parts are walked in the
// order the reader watches the sidebar fill in:
//
//   1. map          — next race + circuit map
//   2. drivers      — driver details (static data: instant, no network)
//   3. calendar     — upcoming race calendar
//   4. constructors — constructors' championship
//   5. standings    — drivers' championship
//   6. results      — latest race result + starting grid
//
// Two rules make the section feel solid:
//
//   Cache-first — every part is cached in sessionStorage. Refresh re-reads
//   local data first and only goes to the network for parts that are missing
//   or stale, so clicking it can never cost a table that was already on
//   screen. (The masthead's "Refresh edition" still forces a cold re-pull.)
//
//   Never destructive — a failed or empty response never replaces data we
//   already hold. The block keeps its rows and notes that the refresh didn't
//   land; only a block with nothing at all shows a retry.

const PART_ORDER = [
  "map",
  "drivers",
  "calendar",
  "constructors",
  "standings",
  "results",
] as const;

type PartName = (typeof PART_ORDER)[number];

type Status = "loading" | "ready" | "failed";

interface PartState<T> {
  status: Status;
  data: T | null;
  /** True when the last attempt failed but we're still showing earlier data. */
  stale: boolean;
}

type PartSetter<T> = React.Dispatch<React.SetStateAction<PartState<T>>>;

function seeded<T>(seed: T | null): PartState<T> {
  return seed
    ? { status: "ready", data: seed, stale: false }
    : { status: "loading", data: null, stale: false };
}

// What counts as "nothing useful" per part — an ok-but-empty payload must not
// overwrite rows we already have on screen.
const IS_EMPTY: Record<PartName, (data: unknown) => boolean> = {
  map: (d) => !(d as F1MapData)?.nextRace,
  drivers: (d) => ((d as F1DriversData)?.drivers?.length ?? 0) === 0,
  calendar: (d) => ((d as F1CalendarData)?.upcoming?.length ?? 0) === 0,
  constructors: (d) =>
    ((d as F1ConstructorsData)?.constructorStandings?.length ?? 0) === 0,
  standings: (d) => ((d as F1DriverStandingsData)?.standings?.length ?? 0) === 0,
  // A finished season legitimately has no grid; lastRace alone is enough.
  results: (d) => {
    const r = d as F1ResultsData;
    return !r || (!r.lastRace && r.qualifyingGrid.length === 0 && r.liveResults.length === 0);
  },
};

// Square badge showing the team's abbreviation on their brand color.
function TeamBadge({ team, color }: { team: string; color: string }) {
  const abbr = teamAbbrev(team);
  const textColor = isLightTeamColor(color) ? "#111111" : "#ffffff";
  return (
    <div
      className="flex items-center justify-center rounded-sm font-mono font-black text-[11px] tracking-wider shrink-0"
      style={{ backgroundColor: color, color: textColor, width: 40, height: 40 }}
    >
      {abbr}
    </div>
  );
}

// Pulsing hairline rows styled like the standings tables they stand in for.
function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="animate-pulse" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-baseline justify-between border-t hairline first:border-t-0 py-1.5"
        >
          <span className="inline-block w-4 h-2.5 bg-card-bg rounded-sm" />
          <span
            className="inline-block h-2.5 bg-card-bg rounded-sm"
            style={{ width: `${52 + ((i * 13) % 30)}%` }}
          />
          <span className="inline-block w-8 h-2.5 bg-card-bg rounded-sm" />
        </div>
      ))}
    </div>
  );
}

// A block with no data at all names what happened and offers a scoped retry.
function PartFailure({ note, onRetry }: { note: string; onRetry: () => void }) {
  return (
    <p className="text-xs text-ink-soft italic">
      {note}{" "}
      <button
        type="button"
        onClick={onRetry}
        className="font-label text-[10px] text-masthead-red underline not-italic ml-1"
      >
        Try again
      </button>
    </p>
  );
}

// A block that still has rows but whose last refresh failed.
function StaleNote({ onRetry }: { onRetry: () => void }) {
  return (
    <p className="text-[10px] text-ink-soft italic mt-2">
      Showing the last figures we have.{" "}
      <button
        type="button"
        onClick={onRetry}
        className="font-label text-[10px] text-masthead-red underline not-italic"
      >
        Try again
      </button>
    </p>
  );
}

function SpinGlyph() {
  return (
    <svg
      className="animate-spin w-3 h-3 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

export default function F1Sidebar({
  nextRace = null,
  upcoming = [],
  standings: initialStandings = [],
  constructorStandings: initialConstructors = [],
  lastRace = null,
  qualifyingGrid = [],
  liveResults = [],
  currentRace = null,
  racePhase = "last-race",
  accentColor,
  favoriteF1Team = "",
  favoriteDriverIds = [],
}: {
  nextRace?: F1Race | null;
  upcoming?: F1Race[];
  standings?: F1Standing[];
  constructorStandings?: F1ConstructorStanding[];
  lastRace?: F1LastRace | null;
  qualifyingGrid?: F1GridResult[];
  liveResults?: F1LiveResult[];
  currentRace?: F1Race | null;
  racePhase?: "last-race" | "qualifying" | "race";
  accentColor?: string;
  favoriteF1Team?: string;
  favoriteDriverIds?: string[];
}) {
  // Seed from whatever the server already printed so the first paint is real
  // content, not a skeleton.
  const [map, setMap] = useState<PartState<F1MapData>>(() =>
    seeded(nextRace ? { nextRace } : null),
  );
  const [drivers, setDrivers] = useState<PartState<F1DriversData>>(() =>
    seeded<F1DriversData>(null),
  );
  const [calendar, setCalendar] = useState<PartState<F1CalendarData>>(() =>
    seeded(upcoming.length > 0 ? { upcoming } : null),
  );
  const [constructors, setConstructors] = useState<PartState<F1ConstructorsData>>(() =>
    seeded(
      initialConstructors.length > 0
        ? { constructorStandings: initialConstructors }
        : null,
    ),
  );
  const [standings, setStandings] = useState<PartState<F1DriverStandingsData>>(() =>
    seeded(initialStandings.length > 0 ? { standings: initialStandings } : null),
  );
  const [results, setResults] = useState<PartState<F1ResultsData>>(() =>
    seeded(
      lastRace || qualifyingGrid.length > 0 || liveResults.length > 0
        ? { lastRace, qualifyingGrid, liveResults, currentRace, racePhase }
        : null,
    ),
  );

  const [refreshing, setRefreshing] = useState(false);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const busyRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const setterFor = useCallback(
    (part: PartName): PartSetter<never> =>
      ({
        map: setMap,
        drivers: setDrivers,
        calendar: setCalendar,
        constructors: setConstructors,
        standings: setStandings,
        results: setResults,
      })[part] as unknown as PartSetter<never>,
    [],
  );

  // Apply a result without ever destroying good data: an empty or failed
  // answer leaves the existing rows alone and just flags the block as stale.
  const applyPart = useCallback(
    <T,>(part: PartName, set: PartSetter<T>, result: F1PartResult<T> | null) => {
      if (!mountedRef.current) return;
      const usable = result?.ok === true && !IS_EMPTY[part](result.data);
      if (usable && result?.ok) {
        writeF1Part(part, result.data);
        set({ status: "ready", data: result.data, stale: false });
        return;
      }
      set((prev) =>
        prev.data
          ? { status: "ready", data: prev.data, stale: true }
          : { status: "failed", data: null, stale: false },
      );
    },
    [],
  );

  // Fetch one part from the network and fold the answer in.
  const fetchPart = useCallback(
    async <T,>(part: PartName, set: PartSetter<T>) => {
      if (busyRef.current.has(part)) return;
      busyRef.current.add(part);
      set((prev) => (prev.data ? prev : { status: "loading", data: null, stale: false }));
      try {
        const res = await fetch(`/api/f1?part=${part}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`f1 ${part} ${res.status}`);
        applyPart(part, set, (await res.json()) as F1PartResult<T>);
      } catch {
        applyPart(part, set, null);
      } finally {
        busyRef.current.delete(part);
      }
    },
    [applyPart],
  );

  // Cache-first load of one part: fresh local copy wins outright, otherwise
  // go to the network. `force` skips the cache (used by per-block retries).
  const loadPart = useCallback(
    async <T,>(part: PartName, set: PartSetter<T>, force = false) => {
      if (!force) {
        const cached = readF1Part<T>(part);
        if (cached && isFresh(cached) && !IS_EMPTY[part](cached.data)) {
          if (mountedRef.current) {
            set({ status: "ready", data: cached.data, stale: false });
          }
          return;
        }
      }
      await fetchPart(part, set);
    },
    [fetchPart],
  );

  // Walk every part in display order. Sequential by design: the reader sees
  // the sidebar fill top-down, and cached parts resolve instantly so the
  // chain only actually waits on the parts that need the network.
  const runSequence = useCallback(
    async (opts: { force?: boolean } = {}) => {
      if (busyRef.current.has("sequence")) return;
      busyRef.current.add("sequence");
      setRefreshing(true);
      try {
        // Fresh cached parts apply instantly; everything else comes from
        // ONE streamed request that answers in PART_ORDER, so the sidebar
        // still fills top-down while the server works on all parts at once.
        const needed: PartName[] = [];
        for (const part of PART_ORDER) {
          const cached = opts.force ? null : readF1Part(part);
          if (cached && isFresh(cached) && !IS_EMPTY[part](cached.data)) {
            if (mountedRef.current) setterFor(part)({ status: "ready", data: cached.data as never, stale: false });
          } else {
            needed.push(part);
          }
        }

        const done = new Set<PartName>();
        if (needed.length > 0) {
          try {
            const res = await fetch(`/api/f1?parts=${needed.join(",")}`, { cache: "no-store" });
            if (!res.ok || !res.body) throw new Error(`f1 stream ${res.status}`);
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            for (;;) {
              const { value, done: finished } = await reader.read();
              buffer += decoder.decode(value, { stream: !finished });
              let newline: number;
              while ((newline = buffer.indexOf("\n")) >= 0) {
                const line = buffer.slice(0, newline).trim();
                buffer = buffer.slice(newline + 1);
                if (!line) continue;
                const { part, result } = JSON.parse(line) as { part: PartName; result: F1PartResult<unknown> };
                applyPart(part, setterFor(part), result as F1PartResult<never>);
                done.add(part);
              }
              if (finished) break;
            }
          } catch {
            // Stream broke part-way — fall back to one request per missing
            // part, still in display order.
          }
          for (const part of needed) {
            if (!done.has(part)) await fetchPart(part, setterFor(part));
          }
        }
        if (mountedRef.current) setCheckedAt(new Date().toISOString());
      } finally {
        busyRef.current.delete("sequence");
        if (mountedRef.current) setRefreshing(false);
      }
    },
    [applyPart, fetchPart, setterFor],
  );

  // Mount: seed the cache with anything the server already gave us, then walk
  // the sequence (cache-first, so seeded parts cost nothing).
  useEffect(() => {
    if (nextRace) writeF1Part("map", { nextRace });
    if (upcoming.length > 0) writeF1Part("calendar", { upcoming });
    if (initialConstructors.length > 0) {
      writeF1Part("constructors", { constructorStandings: initialConstructors });
    }
    if (initialStandings.length > 0) writeF1Part("standings", { standings: initialStandings });
    void runSequence();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retry = useCallback(
    (part: PartName) => void loadPart(part, setterFor(part), true),
    [loadPart, setterFor],
  );

  const driverRows = standings.data?.standings ?? [];
  const constructorRows = constructors.data?.constructorStandings ?? [];
  const roster: F1RosterEntry[] = drivers.data?.drivers ?? [];
  const [showAllDrivers, setShowAllDrivers] = useState(false);
  const [showAllConstructors, setShowAllConstructors] = useState(false);
  const visibleDrivers = showAllDrivers ? driverRows : driverRows.slice(0, 5);
  const visibleConstructors = showAllConstructors
    ? constructorRows
    : constructorRows.slice(0, 5);

  // "Your driver" cards: identity comes from the static roster (available
  // immediately), championship figures fill in when the standings land.
  const favoriteCards = favoriteDriverIds
    .map((id) => {
      const key = id.toLowerCase();
      const standing = driverRows.find(
        (s) =>
          s.driverId === key ||
          s.code.toLowerCase() === key ||
          s.name.toLowerCase().includes(key),
      );
      if (standing) return { key: standing.driverId, standing, pending: null };
      const entry = roster.find(
        (d) => d.id === key || d.code.toLowerCase() === key || d.name.toLowerCase().includes(key),
      );
      return entry ? { key: entry.id, standing: null, pending: entry } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Normalized team name used only for the "Following" badge — the standings
  // tables below are fully decoupled from the user's selection.
  const normFavTeam = favoriteF1Team.replace(/\s*F1 Team$/i, "").trim();

  return (
    <div className="space-y-4">
      {/* Pit wall header — the single section-scoped refresh control. It
          re-reads local data first and only fetches what's missing or stale,
          so it can never blank a table that is already on screen. */}
      <div className="flex items-baseline justify-between gap-2 -mb-1">
        <span className="font-label text-[10px] text-ink-soft">Pit wall</span>
        <span className="flex items-center gap-2">
          {checkedAt && !refreshing && (
            <span className="font-mono text-[10px] text-ink-soft">
              {new Date(checkedAt).toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
          <button
            type="button"
            onClick={() => void runSequence()}
            disabled={refreshing}
            className="font-label text-[10px] text-masthead-red underline disabled:no-underline disabled:opacity-70 inline-flex items-center gap-1"
            title="Re-read the F1 section from local data, fetching only what is missing or stale"
          >
            {refreshing ? (
              <>
                <SpinGlyph /> Refreshing…
              </>
            ) : (
              "↻ Refresh F1"
            )}
          </button>
        </span>
      </div>

      {/* Team badge card — pure personalization, no data dependency. */}
      {accentColor && favoriteF1Team && (
        <div
          className="rounded-sm p-4 flex items-center gap-3"
          style={{ backgroundColor: accentColor + "18", borderLeft: `3px solid ${accentColor}` }}
        >
          <TeamBadge team={favoriteF1Team} color={accentColor} />
          <div>
            <div className="font-label text-[10px] text-ink-soft">Following</div>
            <div
              className="font-headline text-sm font-semibold leading-tight"
              style={{ color: accentColor }}
            >
              {normFavTeam || favoriteF1Team}
            </div>
          </div>
        </div>
      )}

      {favoriteCards.map(({ key, standing, pending }) => (
        <FavoriteDriverCard
          key={key}
          standing={standing}
          pendingDriver={pending}
          accentColor={teamColor(standing?.team ?? pending?.team ?? "")}
        />
      ))}

      {/* Starting Grid — the map leads, the calendar and the results table
          stream in behind it, each with its own status. */}
      {map.status === "ready" && map.data ? (
        <StartingGrid
          nextRace={map.data.nextRace}
          upcoming={calendar.data?.upcoming ?? []}
          calendarStatus={calendar.status}
          onRetryCalendar={() => retry("calendar")}
          lastRace={results.data?.lastRace ?? null}
          qualifyingGrid={results.data?.qualifyingGrid ?? []}
          liveResults={results.data?.liveResults ?? []}
          currentRace={results.data?.currentRace ?? null}
          racePhase={results.data?.racePhase ?? "last-race"}
          accentColor={accentColor}
          sessionStatus={results.status}
          sessionStale={results.stale}
          onRetrySession={() => retry("results")}
        />
      ) : (
        <div className="paper-box pl-5">
          <div className="font-label text-[10px] text-ink-soft mb-1">Starting Grid</div>
          {map.status === "loading" ? (
            <>
              <TableSkeleton rows={4} />
              <p className="text-[11px] text-ink-soft italic mt-2">Lining up the grid…</p>
            </>
          ) : (
            <PartFailure
              note="The circuit map didn't answer."
              onRetry={() => retry("map")}
            />
          )}
        </div>
      )}

      {/* Constructors' Championship — before the drivers' table, matching the
          order the section fills in. */}
      <div className="paper-box">
        <div className="font-label text-[10px] text-ink-soft mb-2">
          Constructors&rsquo; Championship
        </div>

        {constructors.status === "loading" && <TableSkeleton rows={5} />}

        {constructors.status === "failed" && (
          <PartFailure
            note="The constructors' table didn't answer."
            onRetry={() => retry("constructors")}
          />
        )}

        {constructorRows.length > 0 && (
          <>
            <table className="w-full text-xs">
              <tbody>
                {visibleConstructors.map((cs) => {
                  const csNorm = cs.team.replace(/\s*F1 Team$/i, "").trim();
                  const csColor = teamColor(cs.team);
                  return (
                    <tr key={cs.position} className="border-t hairline first:border-t-0">
                      <td className="py-1 font-mono w-6">{cs.position}</td>
                      <td className="py-1">
                        {csColor && (
                          <span
                            className="inline-block w-[3px] h-3 rounded-full mr-1.5 align-middle"
                            style={{ backgroundColor: csColor }}
                          />
                        )}
                        {csNorm}
                      </td>
                      <td className="py-1 text-right font-mono">{cs.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {constructorRows.length > 5 && (
              <button
                type="button"
                onClick={() => setShowAllConstructors((value) => !value)}
                className="font-label text-[10px] text-masthead-red underline mt-2"
              >
                {showAllConstructors
                  ? "Show top 5"
                  : `Show all ${constructorRows.length} teams`}
              </button>
            )}
            {constructors.stale && <StaleNote onRetry={() => retry("constructors")} />}
          </>
        )}
      </div>

      {/* Drivers' Championship */}
      <div className="paper-box">
        <div className="font-label text-[10px] text-ink-soft mb-2">
          Drivers&rsquo; Championship
        </div>

        {standings.status === "loading" && (
          <>
            <TableSkeleton rows={5} />
            <p className="text-[11px] text-ink-soft italic mt-2">
              Pulling the championship table…
            </p>
          </>
        )}

        {standings.status === "failed" && (
          <PartFailure
            note="The drivers' table didn't answer."
            onRetry={() => retry("standings")}
          />
        )}

        {driverRows.length > 0 && (
          <>
            <table className="w-full text-xs">
              <tbody>
                {visibleDrivers.map((s) => {
                  const driverTeamColor = teamColor(s.team);
                  return (
                    <tr key={s.position} className="border-t hairline first:border-t-0">
                      <td className="py-1 font-mono w-6">{s.position}</td>
                      <td className="py-1">
                        {driverTeamColor && (
                          <span
                            className="inline-block w-[3px] h-3 rounded-full mr-1.5 align-middle"
                            style={{ backgroundColor: driverTeamColor }}
                          />
                        )}
                        {s.name}
                      </td>
                      <td className="py-1 text-ink-soft text-[10px]">{s.code}</td>
                      <td className="py-1 text-right font-mono">{s.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {driverRows.length > 5 && (
              <button
                type="button"
                onClick={() => setShowAllDrivers((value) => !value)}
                className="font-label text-[10px] text-masthead-red underline mt-2"
              >
                {showAllDrivers ? "Show top 5" : `Show all ${driverRows.length} drivers`}
              </button>
            )}
            {standings.stale && <StaleNote onRetry={() => retry("standings")} />}
          </>
        )}
      </div>
    </div>
  );
}
