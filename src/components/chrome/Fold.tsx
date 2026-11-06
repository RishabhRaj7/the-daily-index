"use client";

import { useState } from "react";

// Something that opens in place, under its own line, rather than in a pop-up.
// `phoneOnly`: closed on a phone and always open from `md`, for things a phone
// has no room to print by default. Otherwise closed at every width. A fold whose
// contents turn out empty (a source that isn't answering) isn't shown at all
// (.fold-body:empty in globals.css).

export default function Fold({
  label,
  openLabel = "Show less",
  phoneOnly = false,
  className = "",
  children,
}: {
  label: string;
  openLabel?: string;
  phoneOnly?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`fold ${phoneOnly ? "fold-phone" : ""} ${className}`} data-open={open || undefined}>
      <button type="button" className="fold-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? openLabel : label}
        <span aria-hidden="true">{open ? "↑" : "↓"}</span>
      </button>
      <div className="fold-body">{children}</div>
    </div>
  );
}
