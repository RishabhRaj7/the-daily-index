"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { LiveSnapshot, TrackModel } from "@/lib/f1-live-types";
import TrackMap from "./TrackMap";
import { TeamGlyph } from "./LiveTiming";
import TyreIcon from "./TyreIcon";
import { LiveDot, sessionLine } from "./LiveCard";

// The map, enlarged: the track filling the screen with the field on it, the
// running order beside it (tap a name to follow that driver's mini-sectors).
// Esc, the close button or a tap outside put it away.

export default function MapSheet({
  model,
  snap,
  focus,
  onFocus,
  onClose,
}: {
  model: TrackModel;
  snap: LiveSnapshot;
  focus: string | null;
  onFocus: (code: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const race = snap.type === "Race";
  return createPortal(
    <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm animate-[fade-in_0.2s_ease] p-2 sm:p-5" onClick={onClose} role="dialog" aria-modal="true" aria-label={`${model.name} map`}>
      <div
        className="relative h-full w-full max-w-[1500px] mx-auto rounded-3xl border hairline bg-[var(--surface)] text-ink overflow-hidden flex flex-col animate-[sheet-up_0.4s_var(--ease-out)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 px-5 py-4 border-b hairline">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-label text-[9.5px] text-ink-soft">
              <LiveDot running={snap.running} />
              {sessionLine(snap)}
            </div>
            <div className="font-display font-extrabold uppercase text-[1.6rem] leading-none mt-1 truncate">{snap.meeting}</div>
          </div>
          <button type="button" onClick={onClose} className="icon-btn" aria-label="Close the map">
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </header>
        <div className="flex-1 min-h-0 grid lg:grid-cols-[minmax(0,1fr)_17rem]">
          {/* the map fits the space both ways, whatever the circuit's shape */}
          <div className="relative min-h-[60vh] lg:min-h-0">
            <TrackMap model={model} snap={snap} focus={focus} onFocus={onFocus} big className="absolute inset-3 sm:inset-6" />
          </div>
          <aside className="hidden lg:block border-l hairline overflow-y-auto p-4">
            <div className="font-label text-[9px] text-ink-faint mb-2">Running order · tap to follow</div>
            <ol>
              {snap.rows.map((r) => {
                const on = r.code === focus;
                return (
                  <li key={r.code}>
                    <button
                      type="button"
                      onClick={() => onFocus(r.code)}
                      className={`w-full grid grid-cols-[1.4rem_minmax(0,1fr)_auto_auto] items-center gap-2 rounded-lg px-2 py-[5px] text-left text-[12px] ${r.out || (snap.running && r.inPit) ? "opacity-50" : ""}`}
                      style={on ? { background: `color-mix(in srgb, ${r.colour} 20%, transparent)` } : undefined}
                    >
                      <span className="font-mono text-[11px] text-ink-soft tabular-nums">{r.position}</span>
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="w-[3px] h-3.5 rounded-full shrink-0" style={{ background: r.colour }} />
                        <TeamGlyph team={r.team} colour={r.colour} />
                        <span className="font-sans font-bold">{r.code}</span>
                        {snap.running && r.inPit && <span className="font-label text-[8px]" style={{ color: "var(--f1-pit)" }}>Pit</span>}
                      </span>
                      <span className="font-mono text-[10.5px] tabular-nums text-ink-soft">{race ? (r.position === 1 ? "Leader" : r.interval) : r.best}</span>
                      {r.tyre ? <TyreIcon compound={r.tyre.compound} fresh={r.tyre.fresh} size={14} /> : <span />}
                    </button>
                  </li>
                );
              })}
            </ol>
            <p className="font-mono text-[9.5px] text-ink-faint mt-4 leading-relaxed">Cars are placed from F1&rsquo;s timing loops and gaps — accurate to a corner or so. Exact positions are F1 TV&rsquo;s alone.</p>
          </aside>
        </div>
      </div>
    </div>,
    document.body,
  );
}
