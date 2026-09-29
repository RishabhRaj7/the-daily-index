"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

// The paper's popup: a sheet that rises from the bottom on a phone and sits
// centred on a desktop, over a blurred page. Escape or a tap outside closes
// it, and the page behind stops scrolling while it is open.

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

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm animate-[fade-in_0.25s_ease]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-h-[94vh] overflow-y-auto bg-surface text-ink rounded-t-3xl sm:rounded-3xl border hairline shadow-[0_40px_120px_-30px_rgba(0,0,0,0.6)] p-5 sm:p-7 animate-[sheet-up_0.45s_var(--ease-out)]"
        style={{ maxWidth: width, ...(hue ? { ["--section-hue" as string]: hue } : {}) }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {kicker && <div className="font-label text-[10px] text-ink-soft mb-1.5">{kicker}</div>}
            <h2 className="font-display font-extrabold text-[clamp(1.8rem,5vw,2.6rem)] leading-[0.9]">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="icon-btn shrink-0" aria-label="Close">
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
        <div className="h-[3px] mt-4 mb-5 rounded-full" style={{ background: "var(--section-hue, var(--accent))" }} />
        {children}
      </div>
    </div>,
    document.body,
  );
}
