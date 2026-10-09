"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  F1ConstructorStanding,
  F1GridResult,
  F1LastRace,
  F1LiveResult,
  F1Race,
  F1Phase,
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
import { teamColor } from "@/lib/personalization";
import { isFresh, readF1Part, writeF1Part } from "@/lib/f1-cache";
import StartingGrid from "./StartingGrid";
import YourPaddock from "./YourPaddock";

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
//   Cache-first — every part is cached in sessionStorage, so a page load only
//   goes to the network for parts that are missing or stale. ↻ Refresh asks
//   the server afresh with every cache skipped (OpenF1, then the copy kept of
//   it, then Jolpica — see lib/live/f1.ts).
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
    return !r || (!r.lastRace && !r.session && !r.gridPending && r.qualifyingGrid.length === 0 && r.liveResults.length === 0);
  },
};

// Square badge showing the team's abbreviation on their brand color.
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
        className="font-label text-[10px] text-accent underline not-italic ml-1"
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
        className="font-label text-[10px] text-accent underline not-italic"
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

// A championship table as bars: each row's bar is its points against the
// leader's, in the team's colour, growing in from zero when it scrolls in.
function StandingsBars({
  rows,
  leader,
}: {
  rows: Array<{ key: string; position: number; name: string; sub?: string; color?: string; points: number }>;
  leader: number;
}) {
  return (
    <ol className="space-y-2.5">
      {rows.map((r, i) => {
        const pct = leader > 0 ? Math.max(0.02, r.points / leader) : 0;
        return (
          <li key={r.key} className="grid grid-cols-[1.4rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 text-[13px]">
            <span className="font-mono text-[11px] text-ink-soft">{r.position}</span>
            <span className="truncate font-sans font-medium">
              {r.name}
              {r.sub && <span className="font-mono text-[10px] text-ink-faint ml-1.5">{r.sub}</span>}
            </span>
            <span className="font-mono text-[12px] text-right">{r.points}</span>
            <span />
            <span className="col-span-2 h-1 rounded-full bg-card-bg overflow-hidden">
              <span
                className="block h-full rounded-full bar-grow"
                style={{
                  width: `${pct * 100}%`,
                  background: r.color || "var(--section-hue, var(--accent))",
                  ["--bar-i" as string]: i,
                }}
              />
            </span>
          </li>
        );
      })}
    </ol>
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
  racePhase?: F1Phase;
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
    async <T,>(part: PartName, set: PartSetter<T>, fresh = false) => {
      if (busyRef.current.has(part)) return;
      busyRef.current.add(part);
      set((prev) => (prev.data ? prev : { status: "loading", data: null, stale: false }));
      try {
        const res = await fetch(`/api/f1?part=${part}${fresh ? "&fresh=1" : ""}`, { cache: "no-store" });
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
      await fetchPart(part, set, force);
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
            const res = await fetch(`/api/f1?parts=${needed.join(",")}${opts.force ? "&fresh=1" : ""}`, { cache: "no-store" });
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
            if (!done.has(part)) await fetchPart(part, setterFor(part), opts.force);
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

  return (
    // Two blocks that join the section's own grid (the root is
    // display: contents): the race desk sits beside the stories, the two
    // championship tables run full width underneath, so the stories column
    // is never outgrown by a tall sidebar.
    <div className="contents">
      <div className="space-y-4 min-w-0 lg:col-start-2 lg:row-start-1">
      {/* Pit wall header — the single section-scoped refresh control. It
          asks the server afresh (OpenF1 first, then the kept copy, then
          Jolpica), and a failed answer never blanks a table on screen. */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-display font-extrabold text-[1.6rem] leading-none">Pit wall</span>
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
            onClick={() => void runSequence({ force: true })}
            disabled={refreshing}
            className="chip h-7 px-3 text-[11px]"
            title="Ask the timing feeds again: OpenF1 first, then the last copy kept, then Jolpica"
          >
            {refreshing ? (
              <>
                <SpinGlyph /> Refreshing…
              </>
            ) : (
              "↻ Refresh"
            )}
          </button>
        </span>
      </div>

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
          session={results.data?.session ?? null}
          weekendName={results.data?.weekendName ?? null}
          gridSetAt={results.data?.gridSetAt ?? null}
          tops={results.data?.tops ?? {}}
          gridPending={results.data?.gridPending ?? false}
          sprint={results.data?.sprint ?? false}
          accentColor={accentColor}
          sessionStatus={results.status}
          sessionStale={results.stale}
          onRetrySession={() => retry("results")}
        />
      ) : (
        <div className="module">
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

      </div>

      <div className="grid md:grid-cols-2 gap-4 items-start lg:col-span-2">
      {/* Last race and the calendar run full width, beside each other, so the
          desk column stays shorter than the stories. */}
      {map.status === "ready" && map.data && (
        <StartingGrid
          part="archive"
          nextRace={map.data.nextRace}
          upcoming={calendar.data?.upcoming ?? []}
          calendarStatus={calendar.status}
          onRetryCalendar={() => retry("calendar")}
          lastRace={results.data?.lastRace ?? null}
          qualifyingGrid={results.data?.qualifyingGrid ?? []}
          liveResults={results.data?.liveResults ?? []}
          currentRace={results.data?.currentRace ?? null}
          racePhase={results.data?.racePhase ?? "last-race"}
          session={results.data?.session ?? null}
          weekendName={results.data?.weekendName ?? null}
          gridSetAt={results.data?.gridSetAt ?? null}
          tops={results.data?.tops ?? {}}
          gridPending={results.data?.gridPending ?? false}
          sprint={results.data?.sprint ?? false}
          accentColor={accentColor}
          sessionStatus={results.status}
          sessionStale={results.stale}
          onRetrySession={() => retry("results")}
        />
      )}
      <YourPaddock
        favoriteTeam={favoriteF1Team}
        favoriteDriverIds={favoriteDriverIds}
        driverRows={driverRows}
        constructorRows={constructorRows}
        roster={roster}
        lastRace={results.data?.lastRace ?? null}
      />
      {/* Constructors' Championship — before the drivers' table, matching the
          order the section fills in. */}
      <div className="module" data-reveal>
        <div className="font-label text-[10px] text-ink-soft mb-3">
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
            <StandingsBars
              rows={visibleConstructors.map((cs) => ({
                key: `c-${cs.position}`,
                position: cs.position,
                name: cs.team.replace(/\s*F1 Team$/i, "").trim(),
                color: teamColor(cs.team),
                points: cs.points,
              }))}
              leader={constructorRows[0]?.points ?? 0}
            />
            {constructorRows.length > 5 && (
              <button
                type="button"
                onClick={() => setShowAllConstructors((value) => !value)}
                className="font-sans text-[12px] font-semibold text-ink-soft hover:text-ink mt-3"
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
      <div className="module" data-reveal>
        <div className="font-label text-[10px] text-ink-soft mb-3">
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
            <StandingsBars
              rows={visibleDrivers.map((d) => ({
                key: `d-${d.position}`,
                position: d.position,
                name: d.name,
                sub: d.code,
                color: teamColor(d.team),
                points: d.points,
              }))}
              leader={driverRows[0]?.points ?? 0}
            />
            {driverRows.length > 5 && (
              <button
                type="button"
                onClick={() => setShowAllDrivers((value) => !value)}
                className="font-sans text-[12px] font-semibold text-ink-soft hover:text-ink mt-3"
              >
                {showAllDrivers ? "Show top 5" : `Show all ${driverRows.length} drivers`}
              </button>
            )}
            {standings.stale && <StaleNote onRetry={() => retry("standings")} />}
          </>
        )}
      </div>
      </div>
    </div>
  );
}
