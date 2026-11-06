"use client";

import { ArrowRightIcon, CaretDownIcon, CaretUpIcon, type Icon } from "@phosphor-icons/react";
import { useState } from "react";
import Sheet from "@/components/extras/Sheet";
import { PHONE, useMedia } from "@/lib/use-media";

// Something the page keeps tucked away. On a phone it opens in a sheet that slides
// up, so there's nothing to collapse afterwards; on anything bigger it opens in
// place, under its own line.
//
// `phoneOnly`: a whole block a phone has no room to print by default (Trending,
// the Puzzle Desk), always printed from `md`. Because it stands in for a block of
// the section, on a phone it's a card of its own in the section's colour, with an
// icon, a title and a line (`hint`) on what's inside: unlike "See all 20 posts",
// which only adds to what's already showing and stays quiet text.
//
// Otherwise it's quiet text at every width (a card's own small print).
//
// A fold whose contents turn out empty (a source that isn't answering) isn't shown
// at all (.fold-body:empty in globals.css). So the contents stay mounted while
// closed, and move to the sheet while open.

export default function Fold({
  label,
  hint,
  icon: Glyph,
  openLabel,
  phoneOnly = false,
  className = "",
  children,
}: {
  label: string;
  /** What's inside, on the phone's card. */
  hint?: string;
  /** On the phone's card. */
  icon?: Icon;
  /** The quiet form's words while open in place. */
  openLabel?: string;
  phoneOnly?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const phone = useMedia(PHONE);
  const inSheet = phone && open;
  return (
    <div className={`fold ${phoneOnly ? "fold-phone" : ""} ${className}`} data-open={(open && !phone) || undefined}>
      {phoneOnly ? (
        <button type="button" className="fold-card" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {Glyph && <Glyph size={26} weight="duotone" className="fold-glyph" aria-hidden="true" />}
          <span className="min-w-0">
            <span className="block font-display font-extrabold text-[1.35rem] leading-none uppercase">{label}</span>
            {hint && <span className="block font-sans text-[12.5px] leading-[1.3] text-ink-soft mt-1">{hint}</span>}
          </span>
          <span className="fold-arrow" aria-hidden="true">
            <ArrowRightIcon size={16} weight="bold" />
          </span>
        </button>
      ) : (
        <button type="button" className="fold-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open && !phone ? (openLabel ?? "Show less") : label}
          {open && !phone ? <CaretUpIcon size={13} weight="bold" aria-hidden="true" /> : <CaretDownIcon size={13} weight="bold" aria-hidden="true" />}
        </button>
      )}
      {!inSheet && <div className="fold-body">{children}</div>}
      {inSheet && (
        <Sheet title={label} kicker={hint} onClose={() => setOpen(false)}>
          {children}
        </Sheet>
      )}
    </div>
  );
}
