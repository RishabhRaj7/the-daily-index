"use client";

import MoveArrow from "@/components/chrome/MoveArrow";
import { ArrowLeftIcon, ArrowRightIcon, ArrowsClockwiseIcon, ChatCenteredTextIcon, ClockCounterClockwiseIcon, CloudRainIcon, DropIcon, FlagCheckeredIcon, LightningIcon, ListNumbersIcon, MapTrifoldIcon, PlayIcon, RoadHorizonIcon, SteeringWheelIcon, ThermometerHotIcon, ThermometerSimpleIcon, TimerIcon, TireIcon, TrophyIcon, WindIcon, WrenchIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { F1Race } from "@/lib/types";
import type { LivePrediction, LiveRow, LiveSnapshot, TrackModel } from "@/lib/f1-live-types";
import { useF1Live } from "@/lib/use-f1-live";
import { driverPhotoByCode } from "@/lib/f1-assets";
import LiveTiming, { MARK_COLOUR, SEGMENT_COLOUR, stewardLines, TeamGlyph, useF1Favourites } from "./LiveTiming";
import TyreIcon from "./TyreIcon";
import { StintLine } from "./Stints";
import TrackMap, { useTrack } from "./TrackMap";
import MapSheet from "./MapSheet";
import PastSessions from "./PastSessions";
import Season from "./Season";
import { DriverName, openDriver } from "./DriverLink";
import ReplayBar, { useReplay } from "./ReplayBar";
import { LiveDot, SessionClock, TONE, sessionLine } from "./LiveCard";
import Feed from "./centre/Feed";
import { RadioMoments, useInsights } from "./centre/Insights";
import Analysis from "./centre/Analysis";
import { goToView, setOnAir, useLiveView } from "./live-views";
import StewardsView from "./centre/StewardsView";
import Weekend from "./centre/Weekend";
import { ClipNote, Speedometer, TelemetrySheet, useTelemetry } from "./centre/Telemetry";
import { Panel, Tile } from "./centre/ui";
import Battle, { useGapHistory } from "./centre/Battle";
import Pace from "./centre/Pace";
import Commentary from "./centre/Commentary";
import LiveAlerts from "./centre/Alerts";
import { followDriver, useFollowedDriver } from "./followed-driver";
import { eventTime, f1Place, istDay } from "@/lib/event-time";
import { DelayControl, useDelayed, useDelaySeconds } from "./centre/Delay";
import { stewardsByCode } from "@/lib/f1-stewards";

// /f1/live — a session, spread over five views rather than one long page:
//   Live      (named "Timing" in the menu when no session is on)
//             the running order beside the map (the field on it, the
//             followed driver's card with what a pit stop would cost now)
//             and the feed with its filters, scrolling in its own panel
//   Analysis  tyres and pit stops · the lap chart · pace (speed traps, best
//             sectors and the ideal lap, lap benchmarks) · the stewards
//   Feed      race control read plainly, radio with transcripts and every
//             pit stop, filed by kind, with a switch for the reader's drivers
//   Weekend   this weekend's sessions (open any), the circuit, what's next
//   Season    the title as it would stand now (races), the season's records
//             and every round's points
// The view is kept in the address (#analysis/pace), so it survives a reload
// and can be shared. On a phone the views sit in a bar along the foot of the
// screen, like an app's; on a wider screen they head the page.
// Between sessions the same page carries the last session, final; any
// finished session can be opened (Past sessions, Weekend) or replayed.
// Viewing one, a strip under the heading says so, with one tap back to the latest,
// and turns red when a session is on ("Live now"). While a picked session loads,
// the page stays and dims.

// ---- the followed driver ------------------------------------------------------------

const gapSecs = (r: LiveRow) => {
  if (r.position === 1) return 0;
  const m = /^\+?(\d+(?:\.\d+)?)$/.exec(r.gap.trim());
  return m ? Number(m[1]) : null;
};

/**
 * Where a car would come out if it pitted now: its gap to the leader plus
 * what a stop costs, placed among the cars around it (lead-lap cars with a
 * gap in seconds). The cost is the circuit's (MultiViewer), else the median
 * time in the lane at this race so far.
 */
interface PitStopNow {
  loss: number;
  pos: number;
  ahead: { code: string; by: number } | null;
  behind: { code: string; by: number } | null;
  /** The cars either side where they'd rejoin (two each way): seconds from the car rejoining, − ahead, + behind. */
  around: { code: string; colour: string; d: number }[];
}

function pitWindow(snap: LiveSnapshot, row: LiveRow, track: TrackModel | null): PitStopNow | null {
  if (snap.type !== "Race" || !snap.running || row.out || row.inPit) return null;
  const lanes = (snap.pitStops ?? []).map((p) => p.lane).filter((x): x is number => x !== null && x > 10 && x < 45).sort((a, b) => a - b);
  const loss = track?.pitLoss ?? (lanes.length >= 3 ? lanes[Math.floor(lanes.length / 2)] : null);
  const mine = gapSecs(row);
  if (loss === null || mine === null) return null;
  const out = mine + loss;
  const field = snap.rows.filter((r) => r !== row && !r.out).flatMap((r) => {
    const g = gapSecs(r);
    return g === null ? [] : [{ code: r.code, colour: r.colour, g }];
  });
  const ahead = field.filter((f) => f.g <= out).sort((a, b) => b.g - a.g)[0] ?? null;
  const behind = field.filter((f) => f.g > out).sort((a, b) => a.g - b.g)[0] ?? null;
  return {
    loss,
    pos: field.filter((f) => f.g <= out).length + 1,
    ahead: ahead ? { code: ahead.code, by: out - ahead.g } : null,
    behind: behind ? { code: behind.code, by: behind.g - out } : null,
    around: [
      ...field.filter((f) => f.g <= out).sort((a, b) => b.g - a.g).slice(0, 2).reverse(),
      ...field.filter((f) => f.g > out).sort((a, b) => a.g - b.g).slice(0, 2),
    ].map((f) => ({ code: f.code, colour: f.colour, d: f.g - out })),
  };
}

/**
 * If the followed driver pitted now: the place they'd come out in (from where
 * they are now), the cars they'd rejoin between with the gaps, and whether
 * it's into traffic. Estimated from the gaps to the leader and the circuit's
 * pit loss. Always there: dashes, and why, when it can't be worked out.
 */
function PitNow({ stop, row, snap, className = "" }: { stop: PitStopNow | null; row: LiveRow; snap: LiveSnapshot; className?: string }) {
  const lost = stop ? stop.pos - row.position : 0;
  const why = snap.type !== "Race" ? "A race only" : !snap.running ? "When the race is running" : row.out ? "Out of the race" : row.inPit ? "In the pits now" : "Not enough gaps yet";
  const traffic = !stop
    ? why
    : stop.ahead && stop.ahead.by < 1.5
      ? `Into traffic: ${stop.ahead.by.toFixed(1)} s behind ${stop.ahead.code}`
      : stop.behind && stop.behind.by < 1
        ? `${stop.behind.code} right behind, ${stop.behind.by.toFixed(1)} s back`
        : "In clear air";
  // The car they'd come out behind, and the one behind them.
  const ahead = stop?.around.filter((c) => c.d <= 0).at(-1) ?? null;
  const behind = stop?.around.find((c) => c.d > 0) ?? null;
  const chip = (c: { code: string; colour: string; d: number } | null, key: string) => (
    <span key={key} className="flex items-center gap-1.5 rounded-full border hairline px-2 h-7 min-w-0">
      {c ? (
        <>
          <span className="w-[3px] h-3 rounded-full shrink-0" style={{ background: c.colour }} />
          <span className="font-sans font-semibold text-[11.5px] shrink-0">{c.code}</span>
          <span className="font-mono text-[11px] text-ink-soft tabular-nums truncate">
            {c.d <= 0 ? "−" : "+"}
            {Math.abs(c.d).toFixed(1)}
          </span>
        </>
      ) : (
        <span className="font-mono text-[11px] text-ink-faint px-1">—</span>
      )}
    </span>
  );
  return (
    <div className={`rounded-xl border hairline px-3 py-2.5 flex flex-col overflow-hidden ${className}`}>
      <div className="flex items-baseline justify-between gap-2 shrink-0">
        <span className="font-label text-[11px] text-ink-faint truncate">If {row.code} pits now</span>
        <span className="font-mono text-[11px] text-ink-faint whitespace-nowrap">Pit loss {stop ? `~${stop.loss.toFixed(0)} s` : "—"}</span>
      </div>
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-2 items-center flex-1 min-h-0">
        <div className="flex items-baseline gap-2 min-w-0 whitespace-nowrap">
          <span className="font-display font-extrabold text-[1.8rem] leading-none text-ink-soft">P{row.position}</span>
          <ArrowRightIcon size={13} weight="bold" className="text-ink-faint" aria-hidden="true" />
          <span className="font-display font-extrabold text-[1.8rem] leading-none" style={{ color: !stop ? "var(--ink-faint)" : lost > 0 ? "var(--down)" : "var(--up)" }}>
            {stop ? `P${stop.pos}` : "—"}
          </span>
          <span className="font-mono text-[11px] text-ink-soft ml-1 truncate">{!stop ? "" : lost > 0 ? `${lost} place${lost === 1 ? "" : "s"} lost` : "No places lost"}</span>
        </div>
        <div className="min-w-0">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5" aria-label="Where they'd rejoin">
            {chip(ahead, "a")}
            <span className="flex items-center rounded-full px-2.5 h-7 text-[color:var(--paper)]" style={{ background: row.colour }}>
              <span className="font-sans font-bold text-[11.5px]">{row.code}</span>
            </span>
            {chip(behind, "b")}
          </div>
          <div className="font-mono text-[11px] mt-1.5 truncate" style={{ color: !stop ? "var(--ink-faint)" : traffic.startsWith("In clear") ? "var(--up)" : "var(--f1-slower)" }}>
            {traffic}
          </div>
        </div>
      </div>
    </div>
  );
}

const lapSecs = (t?: string | null) => {
  const m = /^(?:(\d+):)?(\d+\.\d+)$/.exec(t ?? "");
  return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : null;
};

/** One figure in the session's summary: its label, the figure, and what it's out of. */
function SessionFigure({ label, value, sub, colour }: { label: string; value: React.ReactNode; sub?: React.ReactNode; colour?: string }) {
  return (
    <div className="px-3 py-2.5 min-w-0">
      <div className="font-label text-[11px] text-ink-faint truncate">{label}</div>
      <div className="font-display font-extrabold text-[1.45rem] leading-none mt-1.5 truncate" style={colour ? { color: colour } : undefined}>
        {value}
      </div>
      {sub && <div className="font-mono text-[11px] text-ink-faint mt-1 truncate">{sub}</div>}
    </div>
  );
}

/** Where the followed driver's race finished, in place of the fight with the car ahead once it's over. */
function SessionResult({ row, race, className = "" }: { row: LiveRow; race: boolean; className?: string }) {
  const moved = race && row.grid ? row.grid - row.position : null;
  return (
    <div className={`rounded-xl border hairline px-3 py-2 flex flex-col ${className}`}>
      <div className="font-label text-[11px] text-ink-faint">{race ? "Result" : "Finished"}</div>
      <div className="flex items-baseline gap-2 mt-1.5 min-w-0 whitespace-nowrap">
        {race && row.grid ? (
          <>
            <span className="font-display font-extrabold text-[1.5rem] leading-none text-ink-soft">P{row.grid}</span>
            <ArrowRightIcon size={13} weight="bold" className="text-ink-faint self-center shrink-0" aria-hidden="true" />
          </>
        ) : null}
        <span className="font-display font-extrabold text-[1.5rem] leading-none">{row.out && race ? "DNF" : `P${row.position}`}</span>
        <span className="font-mono text-[11px] truncate" style={{ color: moved ? (moved > 0 ? "var(--up)" : "var(--down)") : "var(--ink-soft)" }}>
          {row.out && race ? `Out after lap ${row.laps}` : moved === null ? (race ? "" : row.gap ? `${row.gap} to the fastest` : "Fastest") : moved === 0 ? "Held position" : `${Math.abs(moved)} place${Math.abs(moved) === 1 ? "" : "s"} ${moved > 0 ? "gained" : "lost"}`}
        </span>
      </div>
    </div>
  );
}

/** A finished session's numbers for the followed driver, in place of what only means something while it runs. */
function SessionSummary({ row, snap, className = "" }: { row: LiveRow; snap: LiveSnapshot; className?: string }) {
  const race = snap.type === "Race";
  const timed = snap.rows.filter((r) => lapSecs(r.best) !== null).sort((a, b) => lapSecs(a.best)! - lapSecs(b.best)!);
  const lapRank = timed.findIndex((r) => r.code === row.code);
  const speeds = (snap.stats ?? []).filter((s) => s.speeds.st !== null).sort((a, b) => b.speeds.st! - a.speeds.st!);
  const speedRank = speeds.findIndex((s) => s.code === row.code);
  const mine = (snap.pitStops ?? []).filter((p) => p.code === row.code && p.stationary !== null && p.stationary > 1 && p.stationary < 15);
  const quickest = mine.length ? Math.min(...mine.map((p) => p.stationary!)) : null;
  const stewards = stewardsByCode(snap.raceControl, snap.lap?.current ?? null).get(row.code);
  const penalties = stewards?.penalties.length ?? 0;
  const limits = stewards?.trackLimits ?? 0;
  return (
    <div className={`rounded-xl border hairline grid grid-cols-2 sm:grid-cols-4 divide-x divide-[var(--rule)] overflow-hidden ${className}`}>
      <SessionFigure label="Lap rank" value={lapRank >= 0 ? `P${lapRank + 1}` : "—"} sub={lapRank >= 0 ? `of ${timed.length} cars` : undefined} colour={lapRank === 0 ? "var(--f1-fastest)" : undefined} />
      <SessionFigure label="Top speed" value={speedRank >= 0 ? `${speeds[speedRank].speeds.st}` : "—"} sub={speedRank >= 0 ? `km/h · P${speedRank + 1}` : undefined} />
      {race ? (
        <SessionFigure label="Best stop" value={quickest !== null ? `${quickest.toFixed(1)} s` : row.stops} sub={quickest !== null ? `${row.stops} stop${row.stops === 1 ? "" : "s"}` : `stop${row.stops === 1 ? "" : "s"}`} />
      ) : (
        <SessionFigure label="Laps" value={row.laps} sub={`${row.stops} stop${row.stops === 1 ? "" : "s"}`} />
      )}
      <SessionFigure label="Stewards" value={penalties ? `${penalties} penalt${penalties === 1 ? "y" : "ies"}` : "Clean"} sub={limits ? `${limits} track limit${limits === 1 ? "" : "s"}` : "No track limits"} colour={penalties ? "var(--down)" : undefined} />
    </div>
  );
}

/**
 * The followed driver, under the map: who and where, then their speedometer
 * (a tap opens the telemetry) beside their laps — last and best against the
 * session's fastest — the three sectors with their mini-sectors and personal
 * bests, the race in tyres, and what a stop now would cost. Once a session is
 * over, the fight, the clipping, the pace and the pit stop give way to the result
 * and the session's numbers, since they only mean something while it runs.
 */
function FocusCard({ row, photo, snap, track, live, replayT }: { row: LiveRow; photo: string | null; snap: LiveSnapshot; track: TrackModel | null; live: boolean; replayT: number | null }) {
  const stop = pitWindow(snap, row, track);
  const telemetry = useTelemetry(snap, row.code, live, replayT);
  const [detail, setDetail] = useState(false);
  const stats = snap.stats?.find((s) => s.code === row.code);
  const stints = snap.stints?.find((s) => s.code === row.code)?.stints ?? [];
  const race = snap.type === "Race";
  const total = race ? (snap.lap?.total ?? 0) : 0;
  const fastest = snap.rows.find((r) => r.bestFastest);
  const off = !row.bestFastest && fastest ? (lapSecs(row.best) ?? 0) - (lapSecs(fastest.best) ?? 0) : null;
  const upTo = snap.lap?.current ?? null;
  const stewards = useMemo(() => stewardsByCode(snap.raceControl, upTo).get(row.code), [snap.raceControl, upTo, row.code]);
  const stewardLine = stewards ? stewardLines(stewards) : [];
  const ended = !snap.running && replayT === null;
  return (
    <div className="mt-4 pt-4 border-t hairline">
      <div className="flex items-center gap-3">
        <span className="relative w-12 h-12 rounded-full overflow-hidden shrink-0" style={{ background: `color-mix(in srgb, ${row.colour} 30%, var(--paper))` }}>
          {photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover object-top" loading="lazy" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <TeamGlyph team={row.team} colour={row.colour} />
            <DriverName code={row.code} className="font-sans font-bold text-[14px] truncate">
              {row.name || row.code}
            </DriverName>
            <span className="font-mono text-[11px] text-ink-soft">P{row.position}</span>
          </span>
          <span className="block font-mono text-[11px] text-ink-soft mt-1 truncate">
            {race ? (row.position === 1 ? "Leading" : `${row.gap || "—"} to the leader · ${row.interval || "—"} to the car ahead`) : `${row.gap || "—"} to the fastest`}
          </span>
          {stewardLine.length > 0 && (
            <span className="block font-mono text-[11px] mt-1 truncate" style={{ color: stewards?.penalties.length ? "var(--down)" : "var(--f1-slower)" }} title={stewardLine.join(" · ")}>
              {stewardLine.join(" · ")}
            </span>
          )}
        </span>
        <button type="button" onClick={() => openDriver(row.code)} className="chip h-8 text-[11.5px] shrink-0" title={`${row.name || row.code}'s season, round by round`}>
          Season <ArrowRightIcon size={13} weight="bold" className="inline align-[-2px]" aria-hidden="true" />
        </button>
      </div>

      {/* Every box always there, each a fixed height, so the card never changes
          shape as values come and go. Phones: one column; wider: the dial on the
          left beside laps, sectors and the fight; tyres beside clipping; the
          pace, then the pit stop, across the foot. */}
      <div
        className={[
          "mt-3 grid gap-3 [&>*]:min-h-0 [&>*]:min-w-0 grid-cols-1",
          ended
            ? "[grid-template-areas:'tele'_'laps'_'sect'_'fight'_'tyre'_'pace'] [grid-template-rows:15.5rem_4.9rem_5.6rem_5.4rem_5.1rem_auto] sm:grid-cols-[14rem_minmax(0,1fr)] sm:[grid-template-areas:'tele_laps'_'tele_sect'_'tele_fight'_'tyre_tyre'_'pace_pace'] sm:[grid-template-rows:4.9rem_5.6rem_5.4rem_5.1rem_auto]"
            : "[grid-template-areas:'tele'_'laps'_'sect'_'fight'_'tyre'_'clip'_'pace'_'pit'] [grid-template-rows:15.5rem_4.9rem_5.6rem_5.4rem_5.1rem_5.1rem_12rem_8.4rem] sm:grid-cols-[14rem_minmax(0,1fr)] sm:[grid-template-areas:'tele_laps'_'tele_sect'_'tele_fight'_'tyre_clip'_'pace_pace'_'pit_pit'] sm:[grid-template-rows:4.9rem_5.6rem_5.4rem_5.1rem_11.75rem_5.9rem]",
        ].join(" ")}
      >
        <Speedometer t={telemetry} colour={row.colour} code={row.code} onOpen={() => setDetail(true)} ended={!snap.running && replayT === null} className="[grid-area:tele] h-full" />

        {/* last and best, against the session's fastest */}
        <div className="[grid-area:laps] rounded-xl border hairline grid grid-cols-2 divide-x divide-[var(--rule)] overflow-hidden">
          <div className="px-3 py-2 min-w-0">
            <div className="font-label text-[11px] text-ink-faint flex items-center gap-1"><TimerIcon size={13} aria-hidden="true" />Last lap</div>
            <div className="font-mono text-[15px] font-semibold tabular-nums mt-1 truncate" style={{ color: MARK_COLOUR[row.lastMark] }}>
              {row.last || "—"}
            </div>
          </div>
          <div className="px-3 py-2 min-w-0">
            <div className="font-label text-[11px] text-ink-faint truncate">{row.bestFastest ? "Best · fastest" : "Best lap"}</div>
            <div className="font-mono text-[15px] font-semibold tabular-nums mt-1 truncate" style={{ color: row.bestFastest ? "var(--f1-fastest)" : undefined }}>
              {row.best || "—"}
            </div>
            <div className="font-mono text-[11px] text-ink-faint tabular-nums truncate">{row.bestFastest ? "Session best" : off !== null && off > 0 ? <><LightningIcon size={12} weight="fill" className="inline align-[-2px] mr-0.5" style={{ color: "var(--f1-fastest)" }} role="img" aria-label="To the fastest" />+{off.toFixed(3)}</> : "—"}</div>
          </div>
        </div>

        {/* the sectors: this lap's (coloured as the timing screens colour them), mini-sectors, and their bests */}
        <div className="[grid-area:sect] rounded-xl border hairline px-3 py-2 overflow-hidden">
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => {
              const s = row.sectors[i];
              return (
                <div key={i} className="min-w-0">
                  <div className="font-label text-[11px] text-ink-faint">S{i + 1}</div>
                  <div className="font-mono text-[13px] font-semibold tabular-nums mt-0.5 truncate" style={{ color: s ? MARK_COLOUR[s.mark] : undefined }}>
                    {s?.value || "—"}
                  </div>
                  <div className="flex gap-[2px] mt-1 h-[4px]" aria-hidden="true">
                    {(s?.segments.length ? s.segments : Array.from({ length: 8 }, () => "none" as const)).map((g, k) => (
                      <span key={k} className="h-[4px] flex-1 max-w-[9px] rounded-[1px]" style={{ background: SEGMENT_COLOUR[g] }} />
                    ))}
                  </div>
                  <div className="font-mono text-[11px] text-ink-faint mt-1 tabular-nums truncate"><LightningIcon size={12} weight="fill" className="inline align-[-2px] mr-0.5" role="img" aria-label="Best" />{stats?.bestSectors[i] ?? "—"}</div>
                </div>
              );
            })}
          </div>
        </div>

        {ended ? <SessionResult row={row} race={race} className="[grid-area:fight]" /> : <Battle snap={snap} row={row} className="[grid-area:fight] overflow-hidden" />}

        {/* the race in tyres */}
        <div className="[grid-area:tyre] rounded-xl border hairline px-3 pt-2 pb-1 overflow-hidden">
          <div className="flex items-baseline justify-between gap-2 font-label text-[11px] text-ink-faint whitespace-nowrap">
            <span className="flex items-center gap-1.5 min-w-0">
              <TireIcon size={13} className="shrink-0" aria-hidden="true" />
              Tyres
              {stints.some((x) => !x.fresh) && (
                <span className="inline-block w-3.5 h-2 rounded-[2px] shrink-0" style={{ background: "repeating-linear-gradient(135deg, currentColor 0 2px, transparent 2px 4px)" }} title="A striped stint ran on a used set; a solid one on new tyres" role="img" aria-label="Striped: a used set" />
              )}
            </span>
            <span className="truncate">
              {row.stops} stop{row.stops === 1 ? "" : "s"}
              {total ? ` · ${total}` : ""}
            </span>
          </div>
          {stints.length > 0 ? (
            <div className="pt-2.5">
              <StintLine stints={stints} total={total} running={snap.running} size="sm" />
            </div>
          ) : (
            <div className="font-mono text-[11px] text-ink-faint mt-2">—</div>
          )}
        </div>

        {ended ? (
          <SessionSummary row={row} snap={snap} className="[grid-area:pace]" />
        ) : (
          <>
            <ClipNote t={telemetry} track={track} className="[grid-area:clip]" />
            <Pace snap={snap} row={row} className="[grid-area:pace]" />

            {/* if they pitted now: where they'd come out, and among whom */}
            <PitNow stop={stop} row={row} snap={snap} className="[grid-area:pit]" />
          </>
        )}
      </div>

      {detail && <TelemetrySheet t={telemetry} code={row.code} name={row.name} colour={row.colour} onClose={() => setDetail(false)} />}
    </div>
  );
}

// ---- the title, live ---------------------------------------------------------------

function TitleRow({ label, team, colour, position, predicted, points, predictedPoints, mine, code }: { label: string; team?: string; colour: string; position: number; predicted: number; points: number; predictedPoints: number; mine?: boolean; code?: string }) {
  const moved = position - predicted;
  return (
    <li
      className="grid grid-cols-[1.6rem_minmax(0,1fr)_1.8rem_3rem_3rem] items-center gap-2 border-t hairline first:border-t-0 py-[6px] text-[12.5px]"
      style={mine ? { background: `color-mix(in srgb, ${colour} 12%, transparent)` } : undefined}
    >
      <span className="font-mono text-[11px] text-ink-soft tabular-nums pl-1">{predicted}</span>
      <span className="flex items-center gap-2 min-w-0">
        <span className="w-[3px] h-3.5 rounded-full shrink-0" style={{ background: colour }} />
        {team && <TeamGlyph team={team} colour={colour} />}
        <DriverName code={code} className="font-sans font-bold truncate">
          {label}
        </DriverName>
      </span>
      <span className="font-mono text-[11px] text-center" style={{ color: moved > 0 ? "var(--f1-personal)" : moved < 0 ? "var(--down)" : "var(--ink-faint)" }}>
        {moved === 0 ? "–" : <><MoveArrow up={moved > 0} size={10} />{Math.abs(moved)}</>}
      </span>
      <span className="font-mono text-[12px] tabular-nums text-right">{Math.round(predictedPoints)}</span>
      <span className="font-mono text-[11px] tabular-nums text-right" style={{ color: predictedPoints > points ? "var(--f1-personal)" : "var(--ink-faint)" }}>
        {predictedPoints > points ? `+${Math.round(predictedPoints - points)}` : "—"}
      </span>
    </li>
  );
}

function Title({ p, fav }: { p: LivePrediction; fav: Set<string> }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
      <div>
        <div className="font-label text-[11px] text-ink-faint mb-2 flex items-center gap-1.5"><SteeringWheelIcon size={14} aria-hidden="true" />Drivers</div>
        <ol>
          {p.drivers.slice(0, 10).map((d) => (
            <TitleRow key={d.code} label={d.code} {...d} mine={fav.has(d.code)} />
          ))}
        </ol>
      </div>
      <div>
        <div className="font-label text-[11px] text-ink-faint mb-2 flex items-center gap-1.5"><WrenchIcon size={14} aria-hidden="true" />Constructors</div>
        <ol>
          {p.teams.slice(0, 10).map((t) => (
            <TitleRow key={t.name} label={t.name} team={t.name} {...t} />
          ))}
        </ol>
      </div>
    </div>
  );
}

function NextUp({ race, next, known }: { race: F1Race | null; next: string | null; known: boolean }) {
  const [now] = useState(() => Date.now());
  const upcoming = (race?.sessions ?? []).filter((s) => Date.parse(s.end || s.start) > now);
  const first = upcoming[0];
  const at = first ? new Date(first.start) : next ? new Date(next) : null;
  return (
    <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] px-4 py-3.5 sm:px-5 flex flex-wrap items-center gap-x-4 gap-y-1">
      <span className="flex items-center gap-2 font-label text-[11px] text-ink-soft">
        <LiveDot running={false} /> Nothing on track
      </span>
      <span className="font-headline text-[15px] leading-snug">
        {first && at
          ? `Next: ${first.name}, ${istDay(at, { weekday: "long" })} at ${eventTime(at, f1Place(race?.circuit, race?.name, race?.country))}. This page goes live by itself.`
          : known
            ? "The next session isn’t on the calendar yet."
            : " "}
      </span>
    </div>
  );
}

// ---- the views ------------------------------------------------------------------------

function LiveView({ snap, live, replay, replayT }: { snap: LiveSnapshot; live: boolean; replay: boolean; replayT: number | null }) {
  const [enlarged, setEnlarged] = useState(false);
  const fav = useF1Favourites();
  const picked = useFollowedDriver();
  // Followed: the driver last tapped here, then the paddock's first driver (as picked) while running, then the second, then the leader.
  const defaultFocus = [...fav.codes].map((c) => snap.rows.find((r) => r.code === c && !r.out)).find(Boolean)?.code ?? snap.rows[0]?.code ?? null;
  const focus = picked && snap.rows.some((r) => r.code === picked) ? picked : defaultFocus;
  const focusRow = snap.rows.find((r) => r.code === focus);
  const track = useTrack(snap.circuitKey);
  const photos = snap.photos ?? {};
  const race = snap.type === "Race";

  // A phone reads down: the map, the order, the feed. A wide screen puts the
  // order and the map side by side, with the feed under the order filling the
  // rest of the left column beside the map and the followed driver's card, so
  // the two columns end together; its list scrolls inside. The map takes up what's
  // left of its column. An ultrawide gives each its own column (.live-grid).
  return (
    <div className="live-grid grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)] gap-5 lg:gap-6 items-stretch">
      {track ? (
        <Panel id="track" icon={MapTrifoldIcon} label={track.name || "Track"} meta={live || replay ? "Cars placed from the timing loops" : track.corners.length ? `${track.corners.length} corners` : undefined} className="order-1 lg:col-start-2 lg:row-start-1 lg:row-span-2">
          <TrackMap model={track} snap={snap} focus={focus} onFocus={followDriver} onExpand={() => setEnlarged(true)} fit controls className="live-map h-[40vh] max-h-[24rem] lg:h-[24rem] lg:max-h-none" />
          {enlarged && <MapSheet model={track} snap={snap} focus={focus} onFocus={followDriver} onClose={() => setEnlarged(false)} />}
          {focusRow && <FocusCard row={focusRow} photo={photos[focusRow.code] ?? driverPhotoByCode(focusRow.code, focusRow.team)} snap={snap} track={track} live={live && !replay} replayT={replay ? replayT : null} />}
          {focusRow && snap.running && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 font-mono text-[11px] text-ink-faint">
              <span>{focusRow.code}&rsquo;s mini-sectors:</span>
              <span style={{ color: "var(--f1-fastest)" }}>■ session best</span>
              <span style={{ color: "var(--f1-personal)" }}>■ personal best</span>
              <span style={{ color: "var(--f1-slower)" }}>■ slower</span>
            </div>
          )}
        </Panel>
      ) : (
        <div id="track" className="order-1 lg:col-start-2 lg:row-start-1 lg:row-span-2 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] aspect-[4/3] lg:aspect-auto min-w-0 animate-pulse" />
      )}
      <Panel id="feed" icon={ChatCenteredTextIcon} label="Feed" meta="Race control · radio · pits" className="order-3 lg:col-start-1 lg:row-start-2 h-[78vh] max-h-[40rem] lg:h-auto lg:max-h-none lg:min-h-[26rem] lg:[contain:size]">
        <Feed snap={snap} mine={fav.codes} photos={photos} page={20} pinned />
      </Panel>
      <Panel
        id="timing"
        icon={ListNumbersIcon}
        label={live || replay ? "Timing" : "Final classification"}
        meta={replay ? "As it stood · tap a row to follow, a name for the season" : live ? `Read ${new Date(snap.at).toLocaleTimeString("en-GB")} · every 5 s` : "Tap a row to follow · a name for the season"}
        className="order-2 lg:col-start-1 lg:row-start-1"
      >
        <LiveTiming snap={snap} wide focus={focus} onFocus={followDriver} />
        <div className="mt-auto pt-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[11px] text-ink-faint">
          <span style={{ color: "var(--f1-fastest)" }}>■ fastest in the session</span>
          <span style={{ color: "var(--f1-personal)" }}>■ personal best</span>
          <span style={{ color: "var(--f1-slower)" }}>■ slower</span>
          <span className="flex items-center gap-1">
            <TyreIcon compound="SOFT" size={12} /> <TyreIcon compound="MEDIUM" size={12} /> <TyreIcon compound="HARD" size={12} /> tyre · laps on the set
          </span>
          {race && <span>Interval: to the car ahead · Gap: to the leader</span>}
        </div>
      </Panel>
      {/* Every session: what the stewards have said about each driver. */}
      <StewardsView snap={snap} className="order-4 lg:col-span-2" />
    </div>
  );
}

function Tiles({ snap, live }: { snap: LiveSnapshot; live: boolean }) {
  const race = snap.type === "Race";
  const tone = TONE[snap.track.tone];
  const fastest = snap.rows.find((r) => r.bestFastest);
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      {race && snap.lap ? (
        <Tile icon={ArrowsClockwiseIcon} label="Lap" value={`${snap.lap.current}`} unit={`/ ${snap.lap.total}`} />
      ) : (
        <Tile icon={TimerIcon} label={live ? (snap.partLabel ? `${snap.partLabel} · left` : "Time left") : "Best lap"} value={live && snap.running ? <SessionClock snap={snap} /> : (fastest?.best ?? "—")} unit={live ? undefined : fastest?.code} />
      )}
      {live ? <Tile icon={RoadHorizonIcon} label="Track" value={snap.track.tone === "green" ? "Green" : snap.track.label} tone={snap.track.tone === "green" ? undefined : tone.bg} /> : <Tile icon={FlagCheckeredIcon} label="Session" value="Final" />}
      {snap.weather && (
        <>
          <Tile icon={ThermometerSimpleIcon} label="Air" value={snap.weather.air.toFixed(1)} unit="°C" />
          <Tile icon={ThermometerHotIcon} label="Tarmac" value={snap.weather.track.toFixed(1)} unit="°C" />
          <Tile icon={DropIcon} label="Humidity" value={Math.round(snap.weather.humidity)} unit="%" />
          <Tile icon={snap.weather.rain ? CloudRainIcon : WindIcon} label={snap.weather.rain ? "Rain" : "Wind"} value={snap.weather.rain ? "Wet" : snap.weather.wind.toFixed(1)} unit={snap.weather.rain ? undefined : "m/s"} tone={snap.weather.rain ? "var(--f1-pit)" : undefined} />
        </>
      )}
    </div>
  );
}

// ---- the page --------------------------------------------------------------------------

/** "Mexico City · Qualifying", from a session's archive path. */
function pathLabel(path: string): string {
  const [, meeting = "", session = ""] = path.split("/");
  const clean = (s: string) => s.replace(/^\d{4}-\d{2}-\d{2}_/, "").replace(/_Grand_Prix$/, "").replace(/_/g, " ");
  return `${clean(meeting)} · ${clean(session).replace("Practice ", "FP")}`;
}

const SOON_MS = 15 * 60_000;
const AFTER_MS = 30 * 60_000;

/** The session the timetable says is on (or about to be), looked at every half minute. */
function useOnTrack(race: F1Race | null): { name: string; soon: boolean } | null {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  if (!now) return null;
  const s = (race?.sessions ?? []).find((x) => now >= Date.parse(x.start) - SOON_MS && now <= Date.parse(x.end || x.start) + AFTER_MS);
  return s ? { name: s.name.replace("Practice ", "FP"), soon: now < Date.parse(s.start) } : null;
}

/** Viewing a past session: what it is, and the way back, red when a session is on. */
function ArchiveStrip({ label, onTrack, onLatest }: { label: string; onTrack: { name: string; soon: boolean } | null; onLatest: () => void }) {
  return (
    <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] px-4 py-2.5 sm:px-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <span className="flex items-center gap-x-4 gap-y-1 flex-wrap min-w-0">
        <span className="flex items-center gap-2 font-label text-[11px] text-ink-soft">
          <ClockCounterClockwiseIcon size={14} aria-hidden="true" /> Archive
        </span>
        <span className="font-headline text-[15px] leading-snug">{label}</span>
      </span>
      <button
        type="button"
        onClick={onLatest}
        className="chip h-8 text-[12px] gap-1.5 shrink-0"
        style={onTrack && !onTrack.soon ? { background: "var(--hue-f1)", borderColor: "var(--hue-f1)", color: "#fff" } : undefined}
      >
        {onTrack ? (
          <>
            {!onTrack.soon && <span className="w-2 h-2 rounded-full bg-white animate-pulse" aria-hidden="true" />}
            {onTrack.soon ? "Starting soon" : "Live now"} · {onTrack.name}
          </>
        ) : (
          <>
            <ArrowLeftIcon size={13} weight="bold" aria-hidden="true" /> Back to latest
          </>
        )}
      </button>
    </div>
  );
}

export default function LiveCentre() {
  // ?session=<archive path>: a past session, kept in the address so it can be shared or reloaded.
  const [past, setPast] = useState<string | null>(null);
  const nav = useLiveView();
  // The weekend's timetable, beside the session rather than before it: the page never waits for it.
  const [race, setRace] = useState<F1Race | null>(null);
  const [raceKnown, setRaceKnown] = useState(false);
  useEffect(() => {
    let on = true;
    fetch("/api/f1?part=map")
      .then((r) => (r.ok ? (r.json() as Promise<{ data?: { nextRace?: F1Race } | null }>) : null))
      .then((d) => {
        if (!on) return;
        setRace(d?.data?.nextRace ?? null);
        setRaceKnown(true);
      })
      .catch(() => on && setRaceKnown(true));
    return () => {
      on = false;
    };
  }, []);
  useEffect(() => {
    const read = () => {
      setPast(new URLSearchParams(location.search).get("session"));
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  const go = goToView;
  // From the header's picker the page goes back to the top; from a session
  // card on the Weekend view it stays where the reader is looking — even as
  // what's above the views changes (the next-session note comes and goes), the
  // views stay put on the screen until the new session is drawn.
  const anchor = useRef<{ path: string | null; top: number } | null>(null);
  // The session the page shows with nothing picked: picking it again is simply going back.
  const [latest, setLatest] = useState<string | null>(null);
  const pick = (picked: string | null, opts: { keepScroll?: boolean } = {}) => {
    const path = picked === latest ? null : picked;
    const top = document.getElementById("views-top");
    anchor.current = opts.keepScroll && top ? { path, top: top.getBoundingClientRect().top } : null;
    const url = new URL(location.href);
    if (path) url.searchParams.set("session", path);
    else url.searchParams.delete("session");
    history.pushState(null, "", url);
    setPast(path);
    if (!opts.keepScroll) window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const { snapshot: fresh, last, next, checked, answeredFor } = useF1Live({ full: true, always: !past, session: past, sessions: race?.sessions });
  const onTrack = useOnTrack(race);
  // Waiting for the session just picked: what's on screen stays, dimmed.
  const loading = checked && answeredFor !== past;
  // Live, the timing can be held back to match the commentary or TV (centre/Delay.tsx).
  const delay = useDelaySeconds();
  const snapshot = useDelayed(fresh, !past ? delay : 0);
  const live = !past && !!snapshot;
  const loaded = live ? snapshot : last;
  // Picking another session keeps the one on screen until the new one arrives,
  // so the page doesn't empty out (and lose the reader's place) while it loads.
  const [held, setHeld] = useState<LiveSnapshot | null>(null);
  if (loaded && loaded !== held) setHeld(loaded);
  const base = loaded ?? held;
  if (!past && !loading && base?.path && base.path !== latest) setLatest(base.path);
  // The menu calls the first view "Live" only while a session is on.
  useEffect(() => {
    setOnAir(live);
  }, [live]);
  useLayoutEffect(() => {
    const a = anchor.current;
    const top = document.getElementById("views-top");
    if (!a || !top) return;
    const moved = top.getBoundingClientRect().top - a.top;
    if (Math.abs(moved) > 1) window.scrollBy({ top: moved, behavior: "instant" });
    // Done once the session picked is the one drawn.
    if ((base?.path ?? null) === a.path || (!a.path && !past)) anchor.current = null;
  }, [base, past]);
  // A finished session can be played back: the replay bar drives the page.
  const [replaying, setReplaying] = useState(false);
  const [replayPath, setReplayPath] = useState<string | null>(null);
  if (replaying && (live || !base?.path || (replayPath && base.path !== replayPath))) {
    setReplaying(false);
    setReplayPath(null);
  }
  const replay = useReplay(replaying ? replayPath : null);
  const snap = replaying && replay.snap ? replay.snap : base;
  const inReplay = replaying && !!replay.snap;
  // Every car's gap to the car ahead, lap by lap, whichever view is open (the followed driver's fight reads it).
  useGapHistory(snap);
  const fav = useF1Favourites();
  const highlight = useMemo(() => new Set(fav.codes), [fav.codes]);
  // Alerts follow the reader's drivers and their team's.
  const teamCodes = (snapshot?.rows ?? []).filter((r) => fav.team !== "" && r.team === fav.team).map((r) => r.code).join(",");
  const alertFor = useMemo(() => new Set([...fav.codes, ...(teamCodes ? teamCodes.split(",") : [])]), [fav.codes, teamCodes]);
  const view = nav.view;
  const insights = useInsights(view === "feed" && !inReplay ? snap : null);
  const tone = snap ? TONE[snap.track.tone] : null;
  const status = snap ? (replaying ? "Replay" : live ? (snap.running ? "Live" : snap.status === "Inactive" ? "Starting soon" : "Chequered flag") : past ? "Archive" : "Final") : null;

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <Link href="/#paddock-notes" className="chip shrink-0">
          <ArrowLeftIcon size={13} weight="bold" className="inline align-[-2px]" aria-hidden="true" /> <span className="hidden sm:inline">Pit wall</span>
        </Link>
        <span className="flex items-center gap-2 min-w-0">
          {/* F1's live audio coverage, while a session is live (the feed lists the stream) */}
          {live && !replaying && snapshot?.commentary && <Commentary src={snapshot.commentary} />}
          {live && !replaying && <DelayControl />}
          {/* alerts for a live session only (with the bell that mutes them) */}
          {live && !replaying && snapshot && <LiveAlerts snap={snapshot} mine={alertFor} onOpen={() => go("feed")} />}
          <PastSessions current={past} shown={past ?? latest} label={past ? pathLabel(past) : null} onTrack={onTrack} onPick={pick} />
          {!live && base?.path && !replaying && (
            <button
              type="button"
              onClick={() => {
                setReplayPath(base.path);
                setReplaying(true);
              }}
              className="chip h-8 text-[12px] gap-1.5 shrink-0"
              title="Play the session back as it happened"
            >
              <PlayIcon size={13} weight="fill" aria-hidden="true" />
              Replay
            </button>
          )}
          {snap && (
            <span className="hidden sm:flex items-center gap-2 rounded-full border hairline h-8 px-3 font-label text-[11px] shrink-0">
              <LiveDot running={(live || replaying) && snap.running} />
              <span style={{ color: (live || replaying) && snap.running ? "var(--hue-f1)" : undefined }}>
                {status}
              </span>
            </span>
          )}
        </span>
      </div>

      <header id="live-head" className="mt-6 sm:mt-8">
        <div className="flex items-center gap-2 font-label text-[11px] text-ink-soft">
          {snap && <LiveDot running={(live || replaying) && snap.running} />}
          {/* A phone has no room for the status pill at the top. Past sessions say so in the strip, and a final one in its tile. */}
          {status && (live || replaying) && (
            <span className="sm:hidden shrink-0" style={{ color: (live || replaying) && snap?.running ? "var(--hue-f1)" : undefined }}>
              {status} ·
            </span>
          )}
          <span className="truncate">{snap ? `${snap.location} · ${sessionLine(snap)}` : "Live centre"}</span>
        </div>
        <h1 className="font-display font-extrabold uppercase text-[clamp(2.2rem,8vw,5.5rem)] leading-[0.86] mt-2.5 lean-title">{snap?.meeting ?? race?.name ?? "Live centre"}</h1>
      </header>

      {!checked && <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] mt-6 h-72 animate-pulse" />}
      {checked && !live && !past && (
        <div className="mt-5">
          <NextUp race={race} next={next} known={raceKnown} />
        </div>
      )}
      {past && (
        <div className="mt-5">
          <ArchiveStrip label={pathLabel(past)} onTrack={onTrack} onLatest={() => pick(null)} />
        </div>
      )}
      {past && checked && !loading && !snap && <p className="mt-6 font-mono text-[11px] text-ink-faint">F1&rsquo;s archive hasn&rsquo;t published that session yet.</p>}

      <div aria-busy={loading || undefined} className="transition-opacity duration-200" style={{ opacity: loading ? 0.45 : 1 }}>
      {snap && (
        <div className="mt-5">
          <Tiles snap={snap} live={live || inReplay} />
          <div className="h-[3px] rounded-full mt-5" style={{ background: !(live || inReplay) || snap.track.tone === "green" ? "var(--hue-f1)" : tone!.bg }} />
        </div>
      )}

      <div id="views-top" aria-hidden="true" />
      <div key={view} className="mt-5 lg:mt-6 animate-[fade-in_0.25s_ease]">
        {snap && view === "live" && <LiveView snap={snap} live={live} replay={inReplay} replayT={inReplay ? replay.t : null} />}
        {snap && view === "analysis" && <Analysis snap={snap} sub={nav.sub} onSub={(s) => go("analysis", s)} highlight={highlight} mine={fav.codes} />}
        {snap && view === "feed" && (
          <>
            <RadioMoments insights={insights} photos={snap.photos ?? {}} />
            <Panel icon={ChatCenteredTextIcon} label="The feed" meta={`${snap.session} · newest first`}>
              <Feed snap={snap} mine={fav.codes} photos={snap.photos ?? {}} />
            </Panel>
          </>
        )}
        {snap && view === "weekend" && <Weekend snap={snap} race={race} current={past} onPick={(path) => pick(path, { keepScroll: true })} />}
        {view === "season" && (
          <div className="space-y-6">
            {snap?.prediction && (
              <Panel icon={TrophyIcon} label="The title, live" meta="F1's projection if the race ended now">
                <Title p={snap.prediction} fav={fav.codes} />
              </Panel>
            )}
            {checked && <Season />}
          </div>
        )}
      </div>
      </div>

      {/* room for the phone's menu (LiveNav) */}
      <div className="md:hidden h-20" aria-hidden="true" />

      {replaying && (
        <>
          <div className="h-20" aria-hidden="true" />
          <ReplayBar
            replay={replay}
            onClose={() => {
              setReplaying(false);
              setReplayPath(null);
            }}
          />
        </>
      )}
    </>
  );
}
