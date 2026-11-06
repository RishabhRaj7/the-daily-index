"use client";

import { useState } from "react";

// Something that opens in place, under its own line, rather than in a pop-up.
//
// `phoneOnly`: a whole block a phone has no room to print by default (Trending,
// the Puzzle Desk), always open from `md`. Because it stands in for a block of the
// section, on a phone it's a card of its own in the section's colour, with a title
// and a line (`hint`) on what's inside: unlike "See all 20 posts", which only adds
// to what's already showing and stays quiet text.
//
// Otherwise it's quiet text and closed at every width (a card's own small print).
//
// A fold whose contents turn out empty (a source that isn't answering) isn't shown
// at all (.fold-body:empty in globals.css).

export default function Fold({
  label,
  hint,
  openLabel,
  phoneOnly = false,
  className = "",
  children,
}: {
  label: string;
  /** What's inside, on the phone's card. */
  hint?: string;
  /** The quiet form's words while open; the card keeps its title. */
  openLabel?: string;
  phoneOnly?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`fold ${phoneOnly ? "fold-phone" : ""} ${className}`} data-open={open || undefined}>
      {phoneOnly ? (
        <button type="button" className="fold-card" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <span className="min-w-0">
            <span className="block font-display font-extrabold text-[1.35rem] leading-none uppercase">{label}</span>
            {hint && <span className="block font-sans text-[12.5px] leading-[1.3] text-ink-soft mt-1">{hint}</span>}
          </span>
          <span className="fold-arrow" aria-hidden="true">
            {open ? "↑" : "↓"}
          </span>
        </button>
      ) : (
        <button type="button" className="fold-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? (openLabel ?? "Show less") : label}
          <span aria-hidden="true">{open ? "↑" : "↓"}</span>
        </button>
      )}
      <div className="fold-body">{children}</div>
    </div>
  );
}
