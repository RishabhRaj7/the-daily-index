"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// The paper's popup: a sheet that rises from the bottom on a phone and sits
// centred on a desktop, over a blurred page. Escape, the close button or a
// tap outside closes it, and the page behind stops scrolling while it is open.
//
// Closing plays the way out first (back down off a phone's bottom edge, a
// small sink and fade on a desktop, the backdrop fading with it) and only
// then tells the opener, so the sheet is still on screen to animate. With
// reduced motion it closes at once; a timer closes it if the animation's end
// never arrives.
//
// The sheet renders outside the page (a portal), so it would lose the colour
// of the section it was opened from; it reads that colour where it was opened
// and wears it, unless it is given one.

export default function Sheet({
  title,
  kicker,
  onClose,
  children,
  width = 820,
  hue,
}: {
  title: React.ReactNode;
  kicker?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
  /** Colour the sheet wears (its rule and accents), e.g. the section hue. */
  hue?: string;
}) {
  // The section's colour, read where the sheet was opened.
  const spot = useRef<HTMLSpanElement>(null);
  const [opener, setOpener] = useState<string | null>(null);
  useLayoutEffect(() => {
    const el = spot.current?.parentElement;
    const v = el ? getComputedStyle(el).getPropertyValue("--section-hue").trim() : "";
    if (v) setOpener(v);
  }, []);
  const colour = hue ?? opener;

  // Closing: play the way out, then tell the opener (once).
  const [closing, setClosing] = useState(false);
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const finished = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    window.clearTimeout(timer.current);
    onCloseRef.current();
  }, []);
  const close = useCallback(() => {
    if (closing || finished.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return finish();
    setClosing(true);
    timer.current = window.setTimeout(finish, 450);
  }, [closing, finish]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  return (
    <>
      <span ref={spot} hidden />
      {createPortal(
        <div
          className={`sheet-scale fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm animate-[fade-in_0.25s_ease]${closing ? " sheet-closing" : ""}`}
          onClick={close}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="sheet-panel relative w-full flex flex-col overflow-hidden bg-surface text-ink rounded-t-3xl sm:rounded-3xl border hairline shadow-[0_40px_120px_-30px_rgba(0,0,0,0.6)]"
            style={{ maxWidth: width, ...(colour ? { ["--section-hue" as string]: colour } : {}) }}
            onClick={(e) => e.stopPropagation()}
            onAnimationEnd={(e) => closing && e.target === e.currentTarget && finish()}
          >
            {/* the header stays put; the content scrolls under it */}
            <div className="shrink-0 px-5 sm:px-7 pt-6 sm:pt-7">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  {kicker && <div className="font-label text-[11px] text-ink-soft mb-1.5">{kicker}</div>}
                  <h2 className="font-display font-extrabold text-[clamp(1.8rem,5vw,2.6rem)] leading-[0.9]">{title}</h2>
                </div>
                <button type="button" onClick={close} className="icon-btn shrink-0" aria-label="Close">
                  <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                    <path d="M4 4l8 8M12 4l-8 8" />
                  </svg>
                </button>
              </div>
              <div className="h-[3px] mt-4 rounded-full" style={{ background: "var(--section-hue, var(--accent))" }} />
            </div>
            <div className="min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-7 pt-5 pb-5 sm:pb-7">{children}</div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
