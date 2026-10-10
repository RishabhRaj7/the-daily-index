"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { LiveSnapshot, TrackTone } from "@/lib/f1-live-types";
import { clockLeft } from "@/lib/use-f1-live";
import LiveTiming from "./LiveTiming";

// The Pit wall's timing card during a session: the same card, same place,
// carrying the running order live. Everything else live (race control in
// full, radio, strategy, the projected title fight, weather) waits on
// /f1/live, one tap away, so the section never grows.

const ROW_H = 29;
const BASE_ROWS = 8;

export const TONE: Record<TrackTone, { bg: string; fg: string }> = {
  green: { bg: "var(--f1-personal)", fg: "#fff" },
  yellow: { bg: "var(--f1-slower)", fg: "#111" },
  sc: { bg: "var(--f1-slower)", fg: "#111" },
  vsc: { bg: "var(--f1-slower)", fg: "#111" },
  red: { bg: "var(--down)", fg: "#fff" },
};

/** The session clock, ticking between reads. */
export function SessionClock({ snap, className = "" }: { snap: LiveSnapshot; className?: string }) {
  const [, setNow] = useState(0);
  useEffect(() => {
    if (!snap.clockRunning) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [snap.clockRunning]);
  const left = clockLeft(snap);
  if (!left) return null;
  return <span className={`font-mono tabular-nums ${className}`}>{left}</span>;
}

export function LiveDot({ running }: { running: boolean }) {
  return (
    <span className="relative inline-flex w-2 h-2 shrink-0" aria-hidden="true">
      {running && <span className="absolute inset-0 rounded-full animate-ping" style={{ background: "var(--hue-f1)", opacity: 0.6 }} />}
      <span className="relative w-2 h-2 rounded-full" style={{ background: running ? "var(--hue-f1)" : "var(--ink-faint)" }} />
    </span>
  );
}

export function sessionLine(s: LiveSnapshot): string {
  const what = s.partLabel ? `${s.session} · ${s.partLabel}` : s.session;
  if (s.lap && s.type === "Race") return `${what} · Lap ${s.lap.current}/${s.lap.total}`;
  return what;
}

export default function LiveCard({ snap }: { snap: LiveSnapshot }) {
  const [showAll, setShowAll] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(BASE_ROWS);
  useEffect(() => {
    const el = listRef.current;
    if (!el || showAll) return;
    const measure = () => setFit(Math.max(BASE_ROWS, Math.floor((el.clientHeight - 18) / ROW_H)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [showAll]);

  const latest = snap.raceControl?.[0];
  // Only a message from the last few minutes of the read earns the line.
  const fresh = latest && Date.parse(snap.at) - Date.parse(`${latest.utc.replace(/Z?$/, "Z")}`) < 4 * 60_000;
  const tone = TONE[snap.track.tone];
  const ended = !snap.running;

  return (
    <div className={`module self-stretch flex flex-col ${snap.running ? "on-air" : ""}`} data-reveal>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-label text-[10px] min-w-0">
          <LiveDot running={snap.running} />
          <span style={{ color: snap.running ? "var(--hue-f1)" : undefined }} className={snap.running ? "" : "text-ink-soft"}>
            {snap.running ? "Live" : snap.status === "Inactive" ? "Starting soon" : "Chequered flag"}
          </span>
          <span className="text-ink-soft truncate">{sessionLine(snap)}</span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {snap.track.tone !== "green" && snap.running && (
            <span className="rounded-full px-2 py-0.5 font-label text-[8.5px]" style={{ background: tone.bg, color: tone.fg }}>
              {snap.track.label}
            </span>
          )}
          {!ended && <SessionClock snap={snap} className="text-[11px] text-ink-soft" />}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-2 mt-1">
        <span className="font-headline text-[15px] leading-tight truncate">{snap.meeting}</span>
        <Link href="/f1/live" className="font-label text-[9.5px] text-ink-soft hover:text-ink shrink-0 group">
          Live centre <span className="inline-block transition-transform group-hover:translate-x-0.5">›</span>
        </Link>
      </div>

      <div ref={listRef} className={showAll ? "mt-3" : "relative flex-1 mt-3"} style={showAll ? undefined : { minHeight: BASE_ROWS * ROW_H + 18 }}>
        <div className={showAll ? "" : "absolute inset-x-0 top-0"}>
          <LiveTiming snap={snap} limit={showAll ? undefined : fit} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 mt-3">
        {snap.rows.length > fit ? (
          <button type="button" onClick={() => setShowAll((v) => !v)} className="font-sans text-[12px] font-semibold text-ink-soft hover:text-ink">
            {showAll ? "Show fewer" : `Show all ${snap.rows.length} drivers`}
          </button>
        ) : (
          <span />
        )}
        {fresh && latest && (
          <Link href="/f1/live#race-control" className="font-mono text-[10px] text-ink-soft hover:text-ink truncate min-w-0" title={latest.message}>
            <span className="font-label text-[8.5px] mr-1.5" style={{ color: latest.flag ? "var(--f1-slower)" : undefined }}>
              Race control
            </span>
            {latest.message.charAt(0) + latest.message.slice(1).toLowerCase()}
          </Link>
        )}
      </div>
    </div>
  );
}
