"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { LapMark, LiveRow, LiveSector, LiveSnapshot, SegmentMark } from "@/lib/f1-live-types";
import { loadPersonalization, PERSONALIZATION_CHANGED_EVENT } from "@/lib/personalization";
import TyreIcon from "./TyreIcon";
import { teamLogo } from "@/lib/f1-assets";

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

const MARK_COLOUR: Record<LapMark, string> = {
  fastest: "var(--f1-fastest)",
  personal: "var(--f1-personal)",
  none: "inherit",
};

const SEGMENT_COLOUR: Record<SegmentMark, string> = {
  fastest: "var(--f1-fastest)",
  personal: "var(--f1-personal)",
  slower: "var(--f1-slower)",
  pit: "var(--f1-pit)",
  none: "var(--rule)",
};

type Layout = "narrow" | "medium" | "wide";

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
      setLayout(allowWide && w >= 820 ? "wide" : w >= 430 ? "medium" : "narrow");
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, allowWide]);
  return layout;
}

function Status({ r, race, running }: { r: LiveRow; race: boolean; running: boolean }) {
  // Once the flag has fallen everyone is in the pits; only the out and the
  // knocked out are worth a word.
  if (!running) return r.out ? <span className="font-label text-[8.5px] text-ink-faint">{race ? "DNF" : "Out"}</span> : !race && r.knockedOut ? <span className="font-label text-[8.5px] text-ink-faint">KO</span> : null;
  if (r.out) return <span className="font-label text-[8.5px] text-ink-faint">Out</span>;
  if (r.inPit) return <span className="rounded px-1 font-label text-[8.5px] text-white" style={{ background: "var(--f1-pit)" }}>Pit</span>;
  if (r.pitOut) return <span className="font-label text-[8.5px]" style={{ color: "var(--f1-pit)" }}>Out lap</span>;
  if (!race && r.knockedOut) return <span className="font-label text-[8.5px] text-ink-faint">KO</span>;
  return null;
}

function Sector({ s }: { s: LiveSector | undefined }) {
  if (!s) return <span />;
  return (
    <span className="flex flex-col items-end gap-[3px]">
      <span className="font-mono text-[11px] tabular-nums" style={{ color: MARK_COLOUR[s.mark] }}>
        {s.value || "—"}
      </span>
      {s.segments.length > 0 && (
        <span className="flex gap-[2px]" aria-hidden="true">
          {s.segments.map((g, i) => (
            <span key={i} className="w-[5px] h-[3px] rounded-[1px]" style={{ background: SEGMENT_COLOUR[g] }} />
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

  const cols =
    layout === "wide"
      ? race
        ? "1.6rem minmax(9rem,1fr) 4.8rem 4.8rem 5.2rem repeat(3, 5.4rem) 3.6rem 2.4rem"
        : "1.6rem minmax(9rem,1fr) 5.2rem 4.6rem 5.2rem repeat(3, 5.4rem) 3.6rem"
      : layout === "medium"
        ? race
          ? "1.5rem minmax(0,1fr) 4.2rem 4.2rem 4.6rem 3rem 1.6rem"
          : "1.5rem minmax(0,1fr) 4.6rem 4rem 4.6rem 3rem"
        : "1.5rem minmax(0,1fr) 4.4rem 3.9rem 1.6rem";
  const showLast = layout !== "narrow";
  const showSectors = layout === "wide";
  const showStops = race && layout !== "narrow";

  return (
    <div ref={box}>
      <div className="grid gap-x-2 items-center font-label text-[8.5px] text-ink-faint pb-1" style={{ gridTemplateColumns: cols }}>
        <span>P</span>
        <span>Driver</span>
        <span className="text-right">{race ? "Interval" : "Best"}</span>
        <span className="text-right">Gap</span>
        {showLast && <span className="text-right">Last lap</span>}
        {showSectors && ["S1", "S2", "S3"].map((s) => <span key={s} className="text-right">{s}</span>)}
        <span className={layout === "narrow" ? "text-center" : "text-right"}>Tyre</span>
        {showStops && <span className="text-right">Pits</span>}
      </div>
      <div className="relative">
        {rows.map((r) => {
          const mine = fav.codes.has(r.code) || (fav.team !== "" && r.team === fav.team);
          const faded = r.out || (r.knockedOut && !race);
          const focused = focus === r.code;
          return (
            <div key={r.code}>
              <div
                ref={(el) => {
                  if (el) refs.current.set(r.code, el);
                  else refs.current.delete(r.code);
                }}
                className={`grid gap-x-2 items-center border-t hairline text-[12px] relative ${showSectors ? "py-[7px]" : "py-[5px]"} ${faded ? "opacity-45" : ""} ${onFocus ? "cursor-pointer hover:bg-[var(--card-bg)]" : ""}`}
                style={{ gridTemplateColumns: cols, ...(mine || focused ? { background: `color-mix(in srgb, ${r.colour} ${focused ? 20 : 11}%, transparent)` } : {}) }}
                onClick={onFocus ? () => onFocus(r.code) : undefined}
                aria-current={focused || undefined}
              >
                {focused && <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full" style={{ background: r.colour }} aria-hidden="true" />}
                <span className="font-mono text-[11px] tabular-nums text-ink-soft pl-0.5">{r.position}</span>
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-[3px] h-3.5 rounded-full shrink-0" style={{ background: r.colour }} />
                  {layout !== "narrow" && <TeamGlyph team={r.team} colour={r.colour} />}
                  <span className="font-sans font-bold tracking-[0.02em]">{r.code}</span>
                  {showSectors && <span className="text-ink-soft truncate">{r.name}</span>}
                  <Status r={r} race={race} running={snap.running} />
                </span>
                <span className="font-mono text-[11.5px] tabular-nums text-right" style={!race && r.bestFastest ? { color: "var(--f1-fastest)" } : undefined}>
                  {race ? (r.position === 1 ? "Leader" : r.interval || "—") : r.best || "—"}
                </span>
                <span className="font-mono text-[11px] tabular-nums text-right text-ink-soft">
                  {race ? (r.position === 1 ? (snap.lap ? `L${snap.lap.current}` : "—") : r.gap || "—") : r.position === 1 ? "—" : r.gap || "—"}
                </span>
                {showLast && (
                  <span className="font-mono text-[11px] tabular-nums text-right" style={{ color: MARK_COLOUR[r.lastMark] }}>
                    {r.last || "—"}
                  </span>
                )}
                {showSectors && [0, 1, 2].map((i) => <Sector key={i} s={r.sectors[i]} />)}
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
                {showStops && <span className="font-mono text-[11px] tabular-nums text-right text-ink-soft">{r.stops}</span>}
              </div>
              {snap.cutoff !== null && r.position === snap.cutoff && (
                <div className="relative h-0 border-t border-dashed" style={{ borderColor: "var(--down)" }}>
                  <span className="absolute right-0 -top-[7px] font-label text-[8px] px-1 bg-[var(--paper)]" style={{ color: "var(--down)" }}>
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
