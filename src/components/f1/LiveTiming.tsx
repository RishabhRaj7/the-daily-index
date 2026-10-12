"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { LapMark, LiveRow, LiveSector, LiveSnapshot, SegmentMark } from "@/lib/f1-live-types";
import { loadPersonalization, PERSONALIZATION_CHANGED_EVENT } from "@/lib/personalization";
import TyreIcon from "./TyreIcon";
import { DriverName } from "./DriverLink";
import { createPortal } from "react-dom";
import { teamLogo } from "@/lib/f1-assets";
import { stewardsByCode, type Stewards } from "@/lib/f1-stewards";

// The running order, as the timing screens show it. Its columns follow the
// session and the room it has (it measures itself):
//   race          interval · gap · last lap · tyre · stops
//   qual/practice best lap · gap · last lap · tyre
//   room to spare (on /f1/live) the surname and the three sectors, each with
//                 its mini-sector lights
// Laps and sectors are purple for the session's best and green for a
// personal best; the reader's drivers (and team) are tinted in their team
// colour. When the order changes, rows glide to their new places and flash
// green or red; a new session-best lap flashes purple. In a qualifying part
// a dashed line marks the cut-off.

export const MARK_COLOUR: Record<LapMark, string> = {
  fastest: "var(--f1-fastest)",
  personal: "var(--f1-personal)",
  none: "inherit",
};

export const SEGMENT_COLOUR: Record<SegmentMark, string> = {
  fastest: "var(--f1-fastest)",
  personal: "var(--f1-personal)",
  slower: "var(--f1-slower)",
  pit: "var(--f1-pit)",
  none: "var(--rule)",
};

// narrow   a phone: code, interval and gap (or the sectors), tyre
// medium   a card: + last and best laps, tyre age, stops
// roomy    + surname; the time columns share the room evenly
// wide     gaps and the three sectors with their mini-sectors, side by side
// Short of wide, Gaps / Sectors picks the middle columns (the live centre).
type Layout = "narrow" | "medium" | "roomy" | "wide";

function subscribe(cb: () => void) {
  window.addEventListener(PERSONALIZATION_CHANGED_EVENT, cb);
  return () => window.removeEventListener(PERSONALIZATION_CHANGED_EVENT, cb);
}

/** The reader's drivers (as timing codes) and team, from Your paddock. */
export function useF1Favourites(): { codes: Set<string>; team: string } {
  const key = useSyncExternalStore(
    subscribe,
    () => {
      const p = loadPersonalization();
      return `${(p.favoriteF1Drivers ?? []).join(",").toUpperCase()}|${p.favoriteF1Team ?? ""}`;
    },
    () => "|",
  );
  return useMemo(() => {
    const [codes, team] = key.split("|");
    return { codes: new Set(codes ? codes.split(",") : []), team };
  }, [key]);
}

function useLayoutFor(ref: React.RefObject<HTMLDivElement | null>, allowWide: boolean): Layout {
  const [layout, setLayout] = useState<Layout>("medium");
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      setLayout(allowWide && w >= 760 ? "wide" : w >= 600 ? "roomy" : w >= 430 ? "medium" : "narrow");
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, allowWide]);
  return layout;
}

/**
 * The stewards' word on a driver, beside the code, as the broadcast shows it:
 * penalties still to serve in red, a pastel-yellow tile with a "!" for an incident
 * under (or awaiting) investigation, a grey one for an incident noted, and the
 * black-and-white flag. Hover for the details; a tap opens them (outside the
 * table, so its clipping can't cut them off).
 */
export function stewardLines(s: Stewards): string[] {
  return [
    ...s.penalties.map((p) => `Penalty ${p.label === "DT" ? "drive-through" : p.label === "SG" ? "stop-and-go" : p.label}: ${p.why.toLowerCase()}`),
    ...s.incidents.map((x) => `${x.state === "noted" ? "Noted" : x.state === "after" ? "Investigated after the race" : "Under investigation"}: ${x.why.toLowerCase()}`),
    ...(s.blackWhite ? [`Black-and-white flag: ${s.blackWhite.toLowerCase()}`] : []),
    ...(s.trackLimits ? [`${s.trackLimits} lap${s.trackLimits === 1 ? "" : "s"} deleted for track limits`] : []),
  ];
}

function StewardMarks({ s, code, compact = false }: { s: Stewards | undefined; code: string; compact?: boolean }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!at) return;
    const close = () => setAt(null);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("pointerdown", close);
    // The page scrolling (not the feed's or a table's own scrolling, which the live page does all the time).
    window.addEventListener("scroll", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", close);
      window.removeEventListener("keydown", esc);
    };
  }, [at]);
  if (!s || (!s.penalties.length && !s.incidents.length && !s.blackWhite)) return null;
  const top = s.incidents[0];
  const lines = stewardLines(s);
  return (
    <>
      <button
        type="button"
        className="min-w-0 overflow-hidden flex items-center gap-1 rounded focus-visible:outline-2"
        title={lines.join("\n")}
        aria-label={`${code}: ${lines.join("; ")}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          setAt(at ? null : { x: r.left, y: r.bottom });
        }}
      >
        {s.penalties.map((p, i) => (
          <span key={i} className="whitespace-nowrap rounded px-1 font-mono text-[9.5px] font-semibold leading-[15px]" style={{ color: "var(--down)", background: "color-mix(in srgb, var(--down) 15%, transparent)" }}>
            {compact ? p.label.replace(/s$/, "") : p.label}
          </span>
        ))}
        {top && (
          // A pastel-yellow tile with a black "!" and a soft shadow (grey when only noted); the tooltip says when it's after the race.
          <span
            className="grid place-items-center w-[13px] h-[15px] rounded-[3px] shrink-0"
            style={{ background: top.state === "noted" ? "#d9d9de" : "#ffe98a", boxShadow: "0 1px 3px rgba(0,0,0,0.35)" }}
            aria-hidden="true"
          >
            <svg viewBox="0 0 14 16" className="w-[13px] h-[15px] block">
              <path d="M7 3.6v6.2" stroke="#111" strokeWidth="2.2" strokeLinecap="round" />
              <circle cx="7" cy="12.6" r="1.25" fill="#111" />
            </svg>
          </span>
        )}
        {s.blackWhite && (
          <svg viewBox="0 0 12 12" className="w-3 h-3 block" aria-hidden="true">
            <rect x="0.5" y="0.5" width="11" height="11" rx="1.5" fill="#fff" stroke="var(--ink-soft)" />
            <path d="M0.5 11.5 11.5 0.5V10a1.5 1.5 0 0 1-1.5 1.5Z" fill="#111" />
          </svg>
        )}
      </button>
      {at &&
        createPortal(
          <div
            className="fixed z-[95] w-[min(18rem,calc(100vw-1rem))] rounded-xl border hairline bg-[var(--surface)] shadow-xl p-3 space-y-1.5 animate-[fade-in_0.15s_ease]"
            style={{ left: Math.max(8, Math.min(at.x - 8, window.innerWidth - 296)), top: at.y + 6 }}
            onPointerDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={`${code} and the stewards`}
          >
            <div className="font-label text-[9.5px] text-ink-faint">{code} · stewards</div>
            {lines.map((l, i) => (
              <p key={i} className="font-sans text-[12.5px] leading-snug">
                {l}
              </p>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

function Status({ r, race, running }: { r: LiveRow; race: boolean; running: boolean }) {
  // Once the flag has fallen everyone is in the pits; only the out and the
  // knocked out are worth a word.
  if (!running) return r.out ? <span className="font-label text-[9.5px] text-ink-faint">{race ? "DNF" : "Out"}</span> : !race && r.knockedOut ? <span className="font-label text-[9.5px] text-ink-faint">KO</span> : null;
  if (r.out) return <span className="font-label text-[9.5px] text-ink-faint">Out</span>;
  if (r.inPit) return <span className="shrink-0 whitespace-nowrap rounded px-1 font-label text-[9.5px] text-white" style={{ background: "var(--f1-pit)" }}>Pit</span>;
  // The out-lap matters off a race (that lap isn't timed); in a race the
  // stop count and the fresh tyre already say it.
  if (r.pitOut && !race)
    return (
      <span className="shrink-0 whitespace-nowrap rounded px-1 font-label text-[9.5px] border" style={{ color: "var(--f1-pit)", borderColor: "color-mix(in srgb, var(--f1-pit) 45%, transparent)" }} title="On an out-lap">
        Out lap
      </span>
    );
  if (!race && r.knockedOut) return <span className="font-label text-[9.5px] text-ink-faint">KO</span>;
  return null;
}

function Sector({ s }: { s: LiveSector | undefined }) {
  if (!s) return <span />;
  return (
    <span className="flex flex-col items-end gap-[3px] w-full min-w-0">
      <span className="font-mono text-[11px] tabular-nums" style={{ color: MARK_COLOUR[s.mark] }}>
        {s.value || "—"}
      </span>
      {s.segments.length > 0 && (
        <span className="flex justify-end gap-[2px] w-full" aria-hidden="true">
          {s.segments.map((g, i) => (
            <span key={i} className="flex-1 min-w-[2px] max-w-[5px] h-[3px] rounded-[1px]" style={{ background: SEGMENT_COLOUR[g] }} />
          ))}
        </span>
      )}
    </span>
  );
}

export function TeamGlyph({ team, colour, size = 14 }: { team: string; colour: string; size?: number }) {
  const logo = teamLogo(team);
  return logo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logo} alt="" width={size} height={size} className="f1-logo shrink-0 object-contain" style={{ width: size, height: size }} loading="lazy" />
  ) : (
    <span className="shrink-0 rounded-full" style={{ width: size * 0.7, height: size * 0.7, background: colour }} />
  );
}

export default function LiveTiming({
  snap,
  limit,
  wide = false,
  focus = null,
  onFocus,
}: {
  snap: LiveSnapshot;
  limit?: number;
  wide?: boolean;
  /** The driver followed on the map; tapping a row follows another. */
  focus?: string | null;
  onFocus?: (code: string) => void;
}) {
  const race = snap.type === "Race";
  const fav = useF1Favourites();
  const box = useRef<HTMLDivElement>(null);
  const layout = useLayoutFor(box, wide);
  const rows = limit ? snap.rows.slice(0, limit) : snap.rows;
  const upTo = snap.lap?.current ?? null;
  const stewards = useMemo(() => stewardsByCode(snap.raceControl, upTo), [snap.raceControl, upTo]);

  // ---- motion: glide to the new order, flash what changed -----------------
  const refs = useRef(new Map<string, HTMLDivElement>());
  const prev = useRef(new Map<string, { top: number; position: number; best: string; fastest: boolean }>());
  useLayoutEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const seen = new Map<string, { top: number; position: number; best: string; fastest: boolean }>();
    for (const r of snap.rows) {
      const el = refs.current.get(r.code);
      if (!el) continue;
      const top = el.offsetTop;
      const was = prev.current.get(r.code);
      seen.set(r.code, { top, position: r.position, best: r.best, fastest: r.bestFastest });
      if (!was || reduced) continue;
      if (was.top !== top) {
        el.animate([{ transform: `translateY(${was.top - top}px)` }, { transform: "translateY(0)" }], { duration: 520, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
      }
      const flash =
        r.bestFastest && (!was.fastest || was.best !== r.best)
          ? "var(--f1-fastest)"
          : r.position < was.position
            ? "var(--f1-personal)"
            : r.position > was.position
              ? "var(--down)"
              : null;
      if (flash) {
        el.animate([{ backgroundColor: `color-mix(in srgb, ${flash} 26%, transparent)` }, { backgroundColor: "transparent" }], { duration: 1400, easing: "ease-out" });
      }
    }
    prev.current = seen;
  }, [snap, layout]);

  // The columns, by what fits. Past "medium" the driver column stops at a
  // sensible width and the time columns share what's left, so no gulf opens
  // between name and numbers. Short of "wide", the reader picks Gaps
  // (interval, gap) or Sectors (S1–S3 with their mini-sectors) for the middle;
  // last and best laps stay in both.
  const [picked, setPicked] = useState<"gaps" | "sectors">("gaps");
  const view = layout === "wide" ? "both" : picked;
  const t = layout === "narrow" ? "minmax(3.6rem,1fr)" : layout === "medium" ? "minmax(4rem,1fr)" : "minmax(4.2rem,1fr)";
  const sec = layout === "narrow" ? "minmax(2.9rem,1fr)" : "minmax(3.9rem,1fr)";
  const showName = layout === "roomy" || layout === "wide";
  const showStops = race && layout !== "narrow";
  const gaps = view !== "sectors";
  const sectors = view !== "gaps";

  type Col = { key: string; head: string; w: string; cell: (r: LiveRow) => React.ReactNode };
  const lastCol: Col = {
    key: "last",
    head: "Last",
    w: t,
    cell: (r) => (
      <span className="font-mono text-[11px] tabular-nums text-right" style={{ color: MARK_COLOUR[r.lastMark] }}>
        {r.last || "—"}
      </span>
    ),
  };
  const bestCol: Col = {
    key: "best",
    head: "Best",
    w: t,
    cell: (r) => (
      <span className="font-mono text-[11px] tabular-nums text-right" style={r.bestFastest ? { color: "var(--f1-fastest)" } : undefined}>
        {r.best || "—"}
      </span>
    ),
  };
  const middle: Col[] = [];
  if (gaps) {
    if (race)
      middle.push(
        {
          key: "int",
          head: "Interval",
          w: t,
          cell: (r) => <span className="font-mono text-[11.5px] tabular-nums text-right">{r.position === 1 ? "Leader" : r.interval || "—"}</span>,
        },
        {
          key: "gap",
          head: "Gap",
          w: t,
          cell: (r) => <span className="font-mono text-[11px] tabular-nums text-right text-ink-soft">{r.position === 1 ? (snap.lap ? `L${snap.lap.current}` : "—") : r.gap || "—"}</span>,
        },
      );
    else middle.push({ key: "gap", head: "Gap", w: t, cell: (r) => <span className="font-mono text-[11px] tabular-nums text-right text-ink-soft">{r.position === 1 ? "—" : r.gap || "—"}</span> });
  }
  // Last and best: everywhere but a phone's gaps (there the gaps come first).
  if (layout !== "narrow" || !gaps) middle.push(lastCol);
  if (layout !== "narrow" || (!race && gaps)) middle.push(bestCol);
  if (sectors) for (const i of [0, 1, 2]) middle.push({ key: `s${i}`, head: `S${i + 1}`, w: sec, cell: (r) => <Sector s={r.sectors[i]} /> });
  const columns: Col[] = [
    ...middle,
    {
      key: "tyre",
      head: "Tyre",
      w: layout === "narrow" ? "1.6rem" : "minmax(3rem,0.7fr)",
      cell: (r) => (
        <span className={`flex items-center gap-1 ${layout === "narrow" ? "justify-center" : "justify-end"}`}>
          {r.tyre ? (
            <>
              <TyreIcon compound={r.tyre.compound} fresh={r.tyre.fresh} size={16} />
              {layout !== "narrow" && <span className="font-mono text-[10px] tabular-nums text-ink-soft w-[1.3rem] text-left">{r.tyre.laps}</span>}
            </>
          ) : (
            <span className="text-ink-faint">—</span>
          )}
        </span>
      ),
    },
    ...(showStops ? [{ key: "pits", head: "Pits", w: "minmax(1.8rem,0.4fr)", cell: (r: LiveRow) => <span className="font-mono text-[11px] tabular-nums text-right text-ink-soft">{r.stops}</span> }] : []),
  ];
  const driverW = layout === "wide" ? "minmax(10rem,1.5fr)" : layout === "roomy" ? (sectors ? "minmax(4.5rem,0.8fr)" : "minmax(8rem,1.4fr)") : "minmax(0,1fr)";
  const cols = `${layout === "narrow" || layout === "medium" ? "1.5rem" : "1.6rem"} ${driverW} ${columns.map((c) => c.w).join(" ")}`;
  const gapX = layout === "narrow" ? "gap-x-2" : "gap-x-2.5";

  return (
    <div ref={box}>
      {layout !== "wide" && onFocus && (
        <div className="flex justify-end mb-2">
          <div className="inline-flex rounded-full border hairline p-0.5 gap-0.5" role="tablist" aria-label="Show">
            {(
              [
                ["gaps", "Gaps"],
                ["sectors", "Sectors"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={picked === v}
                onClick={() => setPicked(v)}
                className={`rounded-full px-2.5 h-6 font-sans text-[11px] font-semibold transition-colors ${picked === v ? "text-[color:var(--paper)]" : "text-ink-soft hover:text-ink"}`}
                style={picked === v ? { background: "var(--ink)" } : undefined}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className={`grid ${gapX} items-center font-label text-[9.5px] text-ink-faint pb-1.5 px-2.5`} style={{ gridTemplateColumns: cols }}>
        <span>P</span>
        <span>Driver</span>
        {columns.map((c) => (
          <span key={c.key} className={c.key === "tyre" && layout === "narrow" ? "text-center" : "text-right"}>
            {c.head}
          </span>
        ))}
      </div>
      <div className="relative">
        {rows.map((r) => {
          const mine = fav.codes.has(r.code) || (fav.team !== "" && r.team === fav.team);
          const faded = r.out || (r.knockedOut && !race);
          const focused = focus === r.code;
          return (
            <div key={r.code} className="border-t hairline">
              <div
                ref={(el) => {
                  if (el) refs.current.set(r.code, el);
                  else refs.current.delete(r.code);
                }}
                className={`grid ${gapX} items-center rounded-lg px-2.5 my-[2px] text-[12px] relative ${sectors ? "py-[5px]" : "py-[4px]"} ${faded ? "opacity-45" : ""} ${onFocus ? "cursor-pointer hover:bg-[var(--card-bg)]" : ""}`}
                style={{ gridTemplateColumns: cols, ...(mine || focused ? { background: `color-mix(in srgb, ${r.colour} ${focused ? 20 : 11}%, transparent)` } : {}) }}
                onClick={onFocus ? () => onFocus(r.code) : undefined}
                aria-current={focused || undefined}
              >
                {focused && <span className="absolute left-0.5 top-1.5 bottom-1.5 w-[3px] rounded-full" style={{ background: r.colour }} aria-hidden="true" />}
                <span className="font-mono text-[11px] tabular-nums text-ink-soft pl-0.5">{r.position}</span>
                <span className={`flex items-center min-w-0 overflow-hidden ${layout === "narrow" || layout === "medium" ? "gap-1.5" : "gap-2"}`}>
                  <span className="w-[3px] h-3.5 rounded-full shrink-0" style={{ background: r.colour }} />
                  {/* the team's mark where there's room (the colour bar says it anyway) */}
                  {layout !== "narrow" && layout !== "medium" && <TeamGlyph team={r.team} colour={r.colour} />}
                  <DriverName code={r.code} className={`flex items-baseline gap-2 overflow-hidden ${layout === "narrow" || layout === "medium" ? "min-w-[2.1rem]" : "min-w-[2.4rem]"}`}>
                    <span className="font-sans font-bold tracking-[0.02em] shrink-0">{r.code}</span>
                    {showName && !(layout === "roomy" && sectors) && <span className="font-sans text-ink-soft truncate min-w-0">{r.name}</span>}
                  </DriverName>
                  <Status r={r} race={race} running={snap.running} />
                  <StewardMarks s={stewards.get(r.code)} code={r.code} compact={layout === "narrow" || layout === "medium"} />
                </span>
                {columns.map((c) => (
                  <span key={c.key} className="min-w-0 flex justify-end">
                    {c.cell(r)}
                  </span>
                ))}
              </div>
              {snap.cutoff !== null && r.position === snap.cutoff && (
                <div className="relative h-0 border-t border-dashed" style={{ borderColor: "var(--down)" }}>
                  <span className="absolute right-0 -top-[7px] font-label text-[9px] px-1 bg-[var(--paper)]" style={{ color: "var(--down)" }}>
                    Drop zone
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
