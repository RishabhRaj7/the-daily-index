"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
import Analysis, { type Sub } from "./centre/Analysis";
import Weekend from "./centre/Weekend";
import { Speedometer, TelemetrySheet, useTelemetry } from "./centre/Telemetry";
import { Panel, Tile } from "./centre/ui";
import Battle, { useGapHistory } from "./centre/Battle";
import Commentary from "./centre/Commentary";
import { stewardsByCode } from "@/lib/f1-stewards";

// /f1/live — a session, spread over five views rather than one long page:
//   Live      the running order beside the map (the field on it, the
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

type View = "live" | "analysis" | "feed" | "weekend" | "season";

const VIEWS: { id: View; label: string; icon: React.ReactNode }[] = [
  {
    id: "live",
    label: "Live",
    icon: (
      <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
        <path d="M3 5h14M3 10h14M3 15h9" />
      </svg>
    ),
  },
  {
    id: "analysis",
    label: "Analysis",
    icon: (
      <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 16V4M3 16h14M6.5 12l3-3.5 2.5 2 4-5" />
      </svg>
    ),
  },
  {
    id: "feed",
    label: "Feed",
    icon: (
      <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 4h12v9H8l-4 3z" />
        <path d="M7 7.5h6M7 10h4" />
      </svg>
    ),
  },
  {
    id: "weekend",
    label: "Weekend",
    icon: (
      <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 17V3M5 4h9l-2 3 2 3H5" />
      </svg>
    ),
  },
  {
    id: "season",
    label: "Season",
    icon: (
      <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 3h8v4a4 4 0 0 1-8 0zM10 11v3M7 17h6M6 5H3.5a2.5 2.5 0 0 0 2.5 3M14 5h2.5A2.5 2.5 0 0 1 14 8" />
      </svg>
    ),
  },
];

// Links into the page from before the views (the Pit wall card links #race-control).
const LEGACY: Record<string, string> = {
  timing: "live",
  track: "live",
  "race-control": "feed",
  radio: "feed",
  strategy: "analysis/tyres",
  story: "analysis/laps",
  title: "season",
  benchmarks: "analysis/pace",
};

function readHash(): { view: View; sub: Sub } {
  const raw = location.hash.replace(/^#/, "");
  const [v, s] = (LEGACY[raw] ?? raw).split("/");
  const view = (VIEWS.some((x) => x.id === v) ? v : "live") as View;
  const sub = (["tyres", "laps", "pace", "stewards"].includes(s) ? s : "tyres") as Sub;
  return { view, sub };
}

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
 * pit loss.
 */
function PitNow({ stop, row }: { stop: PitStopNow; row: LiveRow }) {
  const lost = stop.pos - row.position;
  const traffic = stop.ahead && stop.ahead.by < 1.5 ? `Into traffic: ${stop.ahead.by.toFixed(1)} s behind ${stop.ahead.code}` : stop.behind && stop.behind.by < 1 ? `${stop.behind.code} right behind, ${stop.behind.by.toFixed(1)} s back` : "In clear air";
  const ahead = stop.around.filter((c) => c.d <= 0);
  const behind = stop.around.filter((c) => c.d > 0);
  const chip = (c: { code: string; colour: string; d: number }) => (
    <span key={c.code} className="flex items-center gap-1.5 rounded-full border hairline px-2 h-7 shrink-0">
      <span className="w-[3px] h-3 rounded-full" style={{ background: c.colour }} />
      <span className="font-sans font-semibold text-[11.5px]">{c.code}</span>
      <span className="font-mono text-[10.5px] text-ink-soft tabular-nums">
        {c.d <= 0 ? "−" : "+"}
        {Math.abs(c.d).toFixed(1)}
      </span>
    </span>
  );
  return (
    <div className="mt-3 rounded-xl border hairline px-3 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-label text-[9.5px] text-ink-faint">If {row.code} pits now</span>
        <span className="font-mono text-[10.5px] text-ink-faint">Pit loss ~{stop.loss.toFixed(0)} s</span>
      </div>
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-2.5 items-center">
        <div className="flex items-baseline gap-2">
          <span className="font-display font-extrabold text-[1.9rem] leading-none text-ink-soft">P{row.position}</span>
          <span className="font-mono text-[13px] text-ink-faint" aria-hidden="true">→</span>
          <span className="font-display font-extrabold text-[1.9rem] leading-none" style={{ color: lost > 0 ? "var(--down)" : "var(--up)" }}>
            P{stop.pos}
          </span>
          <span className="font-mono text-[10.5px] text-ink-soft ml-1">{lost > 0 ? `${lost} place${lost === 1 ? "" : "s"} lost` : "No places lost"}</span>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none]" aria-label="Where they'd rejoin">
            {ahead.map(chip)}
            <span className="flex items-center gap-1.5 rounded-full px-2 h-7 shrink-0 text-[color:var(--paper)]" style={{ background: row.colour }}>
              <span className="font-sans font-bold text-[11.5px]">{row.code}</span>
            </span>
            {behind.map(chip)}
          </div>
          <div className="font-mono text-[10.5px] mt-1.5" style={{ color: traffic.startsWith("In clear") ? "var(--up)" : "var(--f1-slower)" }}>
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

/**
 * The followed driver, under the map: who and where, then their speedometer
 * (a tap opens the telemetry) beside their laps — last and best against the
 * session's fastest — the three sectors with their mini-sectors and personal
 * bests, the race in tyres, and what a stop now would cost.
 */
function FocusCard({ row, photo, snap, track, live, replayT }: { row: LiveRow; photo: string | null; snap: LiveSnapshot; track: TrackModel | null; live: boolean; replayT: number | null }) {
  const stop = pitWindow(snap, row, track);
  const telemetry = useTelemetry(snap, row.code, live, replayT);
  const [detail, setDetail] = useState(false);
  const hasTelemetry = !!telemetry.now || telemetry.samples.length > 1 || (!live && !!snap.path);
  const stats = snap.stats?.find((s) => s.code === row.code);
  const stints = snap.stints?.find((s) => s.code === row.code)?.stints ?? [];
  const race = snap.type === "Race";
  const total = race ? (snap.lap?.total ?? 0) : 0;
  const fastest = snap.rows.find((r) => r.bestFastest);
  const off = !row.bestFastest && fastest ? (lapSecs(row.best) ?? 0) - (lapSecs(fastest.best) ?? 0) : null;
  const upTo = snap.lap?.current ?? null;
  const stewards = useMemo(() => stewardsByCode(snap.raceControl, upTo).get(row.code), [snap.raceControl, upTo, row.code]);
  const stewardLine = stewards ? stewardLines(stewards) : [];
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
          <span className="block font-mono text-[10.5px] text-ink-soft mt-1 truncate">
            {race ? (row.position === 1 ? "Leading" : `${row.gap || "—"} to the leader · ${row.interval || "—"} to the car ahead`) : `${row.gap || "—"} to the fastest`}
          </span>
          {stewardLine.length > 0 && (
            <span className="block font-mono text-[10.5px] mt-1 truncate" style={{ color: stewards?.penalties.length ? "var(--down)" : "var(--f1-slower)" }} title={stewardLine.join(" · ")}>
              {stewardLine.join(" · ")}
            </span>
          )}
        </span>
        <button type="button" onClick={() => openDriver(row.code)} className="chip h-8 text-[11.5px] shrink-0" title={`${row.name || row.code}'s season, round by round`}>
          Season →
        </button>
      </div>

      <div className={`mt-3 grid gap-3 items-start ${hasTelemetry || stints.length ? "sm:grid-cols-[13.5rem_minmax(0,1fr)]" : ""}`}>
        {/* left: the speedometer, and the race in tyres under it */}
        {(hasTelemetry || stints.length > 0) && (
          <div className="space-y-3 min-w-0">
            {hasTelemetry && <Speedometer t={telemetry} colour={row.colour} code={row.code} onOpen={() => setDetail(true)} />}
            {stints.length > 0 && (
              <div className="rounded-xl border hairline px-3 pt-2 pb-1">
                <div className="flex items-baseline justify-between gap-2 font-label text-[9px] text-ink-faint">
                  <span className="flex items-center gap-1.5 min-w-0">
                    Tyres
                    {stints.some((x) => !x.fresh) && (
                      <span className="flex items-center gap-1" title="A dashed stint ran on a used set; a solid one on new tyres">
                        <span className="inline-block w-3 h-[2px]" style={{ background: "repeating-linear-gradient(90deg, currentColor 0 3px, transparent 3px 5px)" }} /> used
                      </span>
                    )}
                  </span>
                  <span className="whitespace-nowrap">
                    {row.stops} stop{row.stops === 1 ? "" : "s"}
                    {total ? ` · ${total} laps` : ""}
                  </span>
                </div>
                <div className="pt-3 pr-2">
                  <StintLine stints={stints} total={total} running={snap.running} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* right: laps, sectors, the fight */}
        <div className="min-w-0 space-y-3">
          {/* last and best, against the session's fastest */}
          <div className="rounded-xl border hairline grid grid-cols-2 divide-x divide-[var(--rule)]">
            <div className="px-3 py-2 min-w-0">
              <div className="font-label text-[9px] text-ink-faint">Last lap</div>
              <div className="font-mono text-[15px] font-semibold tabular-nums mt-1 whitespace-nowrap" style={{ color: MARK_COLOUR[row.lastMark] }}>
                {row.last || "—"}
              </div>
            </div>
            <div className="px-3 py-2 min-w-0">
              <div className="font-label text-[9px] text-ink-faint whitespace-nowrap">{row.bestFastest ? "Best · fastest" : "Best lap"}</div>
              <div className="font-mono text-[15px] font-semibold tabular-nums mt-1 whitespace-nowrap" style={{ color: row.bestFastest ? "var(--f1-fastest)" : undefined }}>
                {row.best || "—"}
              </div>
              {!row.bestFastest && off !== null && off > 0 && <div className="font-mono text-[10px] text-ink-faint tabular-nums">+{off.toFixed(3)} to the fastest</div>}
            </div>
          </div>

          {/* the sectors: this lap's (coloured as the timing screens colour them), mini-sectors, and their bests */}
          <div className="rounded-xl border hairline px-3 py-2.5">
            <div className="grid grid-cols-3 gap-3">
              {[0, 1, 2].map((i) => {
                const s = row.sectors[i];
                return (
                  <div key={i} className="min-w-0">
                    <div className="font-label text-[9px] text-ink-faint">S{i + 1}</div>
                    <div className="font-mono text-[13px] font-semibold tabular-nums mt-0.5" style={{ color: s ? MARK_COLOUR[s.mark] : undefined }}>
                      {s?.value || "—"}
                    </div>
                    {s && s.segments.length > 0 && (
                      <div className="flex gap-[2px] mt-1" aria-hidden="true">
                        {s.segments.map((g, k) => (
                          <span key={k} className="h-[4px] flex-1 max-w-[9px] rounded-[1px]" style={{ background: SEGMENT_COLOUR[g] }} />
                        ))}
                      </div>
                    )}
                    {stats?.bestSectors[i] && <div className="font-mono text-[10.5px] text-ink-faint mt-1 tabular-nums truncate">Best {stats.bestSectors[i]}</div>}
                  </div>
                );
              })}
            </div>
          </div>

          <Battle snap={snap} row={row} />
        </div>
      </div>

      {/* if they pitted now: where they'd come out, and among whom */}
      {stop && <PitNow stop={stop} row={row} />}
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
      <span className="font-mono text-[10px] text-center" style={{ color: moved > 0 ? "var(--f1-personal)" : moved < 0 ? "var(--down)" : "var(--ink-faint)" }}>
        {moved > 0 ? `▲${moved}` : moved < 0 ? `▼${-moved}` : "–"}
      </span>
      <span className="font-mono text-[12px] tabular-nums text-right">{Math.round(predictedPoints)}</span>
      <span className="font-mono text-[10.5px] tabular-nums text-right" style={{ color: predictedPoints > points ? "var(--f1-personal)" : "var(--ink-faint)" }}>
        {predictedPoints > points ? `+${Math.round(predictedPoints - points)}` : "—"}
      </span>
    </li>
  );
}

function Title({ p, fav }: { p: LivePrediction; fav: Set<string> }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
      <div>
        <div className="font-label text-[10px] text-ink-faint mb-2">Drivers</div>
        <ol>
          {p.drivers.slice(0, 10).map((d) => (
            <TitleRow key={d.code} label={d.code} {...d} mine={fav.has(d.code)} />
          ))}
        </ol>
      </div>
      <div>
        <div className="font-label text-[10px] text-ink-faint mb-2">Constructors</div>
        <ol>
          {p.teams.slice(0, 10).map((t) => (
            <TitleRow key={t.name} label={t.name} team={t.name} {...t} />
          ))}
        </ol>
      </div>
    </div>
  );
}

function NextUp({ race, next }: { race: F1Race | null; next: string | null }) {
  const [now] = useState(() => Date.now());
  const upcoming = (race?.sessions ?? []).filter((s) => Date.parse(s.end || s.start) > now);
  const first = upcoming[0];
  const at = first ? new Date(first.start) : next ? new Date(next) : null;
  return (
    <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] px-4 py-3.5 sm:px-5 flex flex-wrap items-center gap-x-4 gap-y-1">
      <span className="flex items-center gap-2 font-label text-[10.5px] text-ink-soft">
        <LiveDot running={false} /> Nothing on track
      </span>
      <span className="font-headline text-[15px] leading-snug">
        {first && at
          ? `Next: ${first.name}, ${at.toLocaleDateString("en-GB", { weekday: "long" })} at ${at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}. This page goes live by itself.`
          : "The next session isn’t on the calendar yet."}
      </span>
    </div>
  );
}

// ---- the views ------------------------------------------------------------------------

function LiveView({ snap, live, replay, replayT }: { snap: LiveSnapshot; live: boolean; replay: boolean; replayT: number | null }) {
  const [enlarged, setEnlarged] = useState(false);
  const fav = useF1Favourites();
  const [picked, setPicked] = useState<string | null>(null);
  // Followed at first: the paddock's first driver (as picked) while running, then the second, then the leader.
  const defaultFocus = [...fav.codes].map((c) => snap.rows.find((r) => r.code === c && !r.out)).find(Boolean)?.code ?? snap.rows[0]?.code ?? null;
  const focus = picked && snap.rows.some((r) => r.code === picked) ? picked : defaultFocus;
  const focusRow = snap.rows.find((r) => r.code === focus);
  const track = useTrack(snap.circuitKey);
  const photos = snap.photos ?? {};
  const race = snap.type === "Race";

  // A phone reads down: the map, the order, the feed. A wide screen puts the
  // order and the map side by side (sized so the two come out about as tall)
  // and the feed across the full width beneath them, its filters down the
  // left and its list scrolling inside.
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-5 lg:gap-6 items-stretch">
      {track ? (
        <Panel id="track" label={track.name || "Track"} meta={live || replay ? "Cars placed from the timing loops" : track.corners.length ? `${track.corners.length} corners` : undefined} className="order-1 lg:col-start-2 lg:row-start-1">
          <TrackMap model={track} snap={snap} focus={focus} onFocus={setPicked} onExpand={() => setEnlarged(true)} fit controls className="h-[42vh] max-h-[26rem] lg:h-[31rem] lg:max-h-none" />
          {enlarged && <MapSheet model={track} snap={snap} focus={focus} onFocus={setPicked} onClose={() => setEnlarged(false)} />}
          {focusRow && <FocusCard row={focusRow} photo={photos[focusRow.code] ?? driverPhotoByCode(focusRow.code, focusRow.team)} snap={snap} track={track} live={live && !replay} replayT={replay ? replayT : null} />}
          {focusRow && snap.running && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 font-mono text-[10.5px] text-ink-faint">
              <span>{focusRow.code}&rsquo;s mini-sectors:</span>
              <span style={{ color: "var(--f1-fastest)" }}>■ session best</span>
              <span style={{ color: "var(--f1-personal)" }}>■ personal best</span>
              <span style={{ color: "var(--f1-slower)" }}>■ slower</span>
            </div>
          )}
        </Panel>
      ) : (
        <div className="order-1 lg:col-start-2 lg:row-start-1 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] aspect-[4/3] animate-pulse" />
      )}
      <Panel id="feed" label="Feed" meta="Race control · radio · pits" className="order-3 lg:col-span-2 h-[78vh] max-h-[40rem] lg:h-[34rem]">
        <Feed snap={snap} mine={fav.codes} photos={photos} page={20} pinned />
      </Panel>
      <Panel
        id="timing"
        label={live || replay ? "Timing" : "Final classification"}
        meta={replay ? "As it stood · tap a row to follow, a name for the season" : live ? `Read ${new Date(snap.at).toLocaleTimeString("en-GB")} · every 5 s` : "Tap a row to follow · a name for the season"}
        className="order-2 lg:col-start-1 lg:row-start-1"
      >
        <LiveTiming snap={snap} wide focus={focus} onFocus={setPicked} />
        <div className="mt-auto pt-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[10.5px] text-ink-faint">
          <span style={{ color: "var(--f1-fastest)" }}>■ fastest in the session</span>
          <span style={{ color: "var(--f1-personal)" }}>■ personal best</span>
          <span style={{ color: "var(--f1-slower)" }}>■ slower</span>
          <span className="flex items-center gap-1">
            <TyreIcon compound="SOFT" size={12} /> <TyreIcon compound="MEDIUM" size={12} /> <TyreIcon compound="HARD" size={12} /> tyre · laps on the set
          </span>
          {race && <span>Interval: to the car ahead · Gap: to the leader</span>}
        </div>
      </Panel>
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
        <Tile label="Lap" value={`${snap.lap.current}`} unit={`/ ${snap.lap.total}`} />
      ) : (
        <Tile label={live ? (snap.partLabel ? `${snap.partLabel} · left` : "Time left") : "Fastest lap"} value={live && snap.running ? <SessionClock snap={snap} /> : (fastest?.best ?? "—")} unit={live ? undefined : fastest?.code} />
      )}
      {live ? <Tile label="Track" value={snap.track.tone === "green" ? "Green" : snap.track.label} tone={snap.track.tone === "green" ? undefined : tone.bg} /> : <Tile label="Session" value="Final" />}
      {snap.weather && (
        <>
          <Tile label="Air" value={snap.weather.air.toFixed(1)} unit="°C" />
          <Tile label="Track temp" value={snap.weather.track.toFixed(1)} unit="°C" />
          <Tile label="Humidity" value={Math.round(snap.weather.humidity)} unit="%" />
          <Tile label={snap.weather.rain ? "Rain" : "Wind"} value={snap.weather.rain ? "Wet" : snap.weather.wind.toFixed(1)} unit={snap.weather.rain ? undefined : "m/s"} tone={snap.weather.rain ? "var(--f1-pit)" : undefined} />
        </>
      )}
    </div>
  );
}

// ---- the page --------------------------------------------------------------------------

export default function LiveCentre({ race }: { race: F1Race | null }) {
  // ?session=<archive path>: a past session, kept in the address so it can be shared or reloaded.
  const [past, setPast] = useState<string | null>(null);
  const [nav, setNav] = useState<{ view: View; sub: Sub }>({ view: "live", sub: "tyres" });
  useEffect(() => {
    const read = () => {
      setPast(new URLSearchParams(location.search).get("session"));
      setNav(readHash());
    };
    read();
    window.addEventListener("popstate", read);
    window.addEventListener("hashchange", read);
    return () => {
      window.removeEventListener("popstate", read);
      window.removeEventListener("hashchange", read);
    };
  }, []);
  const go = (view: View, sub: Sub = nav.sub) => {
    setNav({ view, sub });
    history.replaceState(null, "", `${location.pathname}${location.search}#${view === "analysis" ? `analysis/${sub}` : view}`);
    // Back to the top of the views when the new one starts above the screen.
    const top = document.getElementById("views-top");
    if (top && top.getBoundingClientRect().top < 0) window.scrollTo({ top: top.getBoundingClientRect().top + window.scrollY - 72, behavior: "instant" });
  };
  const pick = (path: string | null) => {
    const url = new URL(location.href);
    if (path) url.searchParams.set("session", path);
    else url.searchParams.delete("session");
    history.pushState(null, "", url);
    setPast(path);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const { snapshot, last, next, checked } = useF1Live({ full: true, always: !past, session: past });
  const live = !past && !!snapshot;
  const base = live ? snapshot : last;
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
  const view = nav.view;
  const tone = snap ? TONE[snap.track.tone] : null;

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <Link href="/#paddock-notes" className="chip shrink-0">
          <span aria-hidden="true">←</span> <span className="hidden sm:inline">Pit wall</span>
        </Link>
        <span className="flex items-center gap-2 min-w-0">
          {/* F1's live audio coverage, while a session is live (the feed lists the stream) */}
          {live && !replaying && snapshot?.commentary && <Commentary src={snapshot.commentary} />}
          <PastSessions current={past} label={past && snap ? `${snap.meeting.replace(/ Grand Prix$/, "")} · ${snap.session.replace("Practice ", "FP")}` : null} onPick={pick} />
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
              <svg viewBox="0 0 12 12" className="w-3 h-3" fill="currentColor" aria-hidden="true">
                <path d="M3 1.8v8.4c0 .5.5.8.9.5l6.4-4.2c.4-.3.4-.8 0-1.1L3.9 1.3c-.4-.3-.9 0-.9.5z" />
              </svg>
              Replay
            </button>
          )}
          {snap && (
            <span className="hidden sm:flex items-center gap-2 rounded-full border hairline h-8 px-3 font-label text-[10.5px] shrink-0">
              <LiveDot running={(live || replaying) && snap.running} />
              <span style={{ color: (live || replaying) && snap.running ? "var(--hue-f1)" : undefined }}>
                {replaying ? "Replay" : live ? (snap.running ? "Live" : snap.status === "Inactive" ? "Starting soon" : "Chequered flag") : past ? "Archive" : "Final"}
              </span>
            </span>
          )}
        </span>
      </div>

      <header className="mt-6 sm:mt-8">
        <div className="flex items-center gap-2 font-label text-[10px] text-ink-soft">
          {snap && <LiveDot running={(live || replaying) && snap.running} />}
          <span className="truncate">{snap ? `${snap.location} · ${sessionLine(snap)}` : "Live centre"}</span>
        </div>
        <h1 className="font-display font-extrabold uppercase text-[clamp(2.2rem,8vw,5.5rem)] leading-[0.86] mt-2.5">{snap?.meeting ?? race?.name ?? "Live centre"}</h1>
      </header>

      {!checked && <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] mt-6 h-72 animate-pulse" />}
      {checked && !live && !past && (
        <div className="mt-5">
          <NextUp race={race} next={next} />
        </div>
      )}
      {past && checked && !snap && <p className="mt-6 font-mono text-[11px] text-ink-faint">F1&rsquo;s archive hasn&rsquo;t published that session yet.</p>}

      {snap && (
        <div className="mt-5">
          <Tiles snap={snap} live={live || inReplay} />
          <div className="h-[3px] rounded-full mt-5" style={{ background: !(live || inReplay) || snap.track.tone === "green" ? "var(--hue-f1)" : tone!.bg }} />
        </div>
      )}

      <div id="views-top" aria-hidden="true" />
      {/* the views: a bar at the top on a wide screen */}
      <nav id="views" aria-label="Views" className="hidden lg:flex sticky top-[3.6rem] z-30 mt-6 scroll-mt-20">
        <div className="glass border hairline rounded-full p-1 flex gap-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => go(v.id)}
              aria-current={view === v.id ? "page" : undefined}
              className={`rounded-full px-4 h-9 flex items-center gap-2 text-[13px] font-sans font-semibold whitespace-nowrap transition-colors ${view === v.id ? "text-[color:var(--paper)]" : "text-ink-soft hover:text-ink"}`}
              style={view === v.id ? { background: "var(--ink)" } : undefined}
            >
              <span className="[&_svg]:w-4 [&_svg]:h-4">{v.icon}</span>
              {v.label}
            </button>
          ))}
        </div>
      </nav>

      <div key={view} className="mt-5 lg:mt-6 animate-[fade-in_0.25s_ease]">
        {snap && view === "live" && <LiveView snap={snap} live={live} replay={inReplay} replayT={inReplay ? replay.t : null} />}
        {snap && view === "analysis" && <Analysis snap={snap} sub={nav.sub} onSub={(s) => go("analysis", s)} highlight={highlight} mine={fav.codes} />}
        {snap && view === "feed" && (
          <Panel label="The feed" meta={`${snap.session} · newest first`}>
            <Feed snap={snap} mine={fav.codes} photos={snap.photos ?? {}} />
          </Panel>
        )}
        {snap && view === "weekend" && <Weekend snap={snap} race={race} current={past} onPick={pick} />}
        {view === "season" && (
          <div className="space-y-6">
            {snap?.prediction && (
              <Panel label="The title, live" meta="F1's projection if the race ended now">
                <Title p={snap.prediction} fav={fav.codes} />
              </Panel>
            )}
            {checked && <Season />}
          </div>
        )}
      </div>

      {/* the views on a phone: a bar along the foot, like an app's */}
      <div className="lg:hidden h-20" aria-hidden="true" />
      <nav aria-label="Views" className="lg:hidden fixed inset-x-0 bottom-0 z-40 glass border-t hairline pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5 max-w-lg mx-auto">
          {VIEWS.map((v) => {
            const on = view === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => go(v.id)}
                aria-current={on ? "page" : undefined}
                className={`relative flex flex-col items-center gap-1 pt-2.5 pb-2 font-sans text-[10.5px] font-semibold transition-colors ${on ? "text-ink" : "text-ink-faint"}`}
              >
                {on && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-b-full" style={{ background: "var(--hue-f1)" }} />}
                {v.icon}
                {v.label}
              </button>
            );
          })}
        </div>
      </nav>

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
