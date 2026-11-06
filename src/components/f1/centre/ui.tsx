"use client";

import type { Icon } from "@phosphor-icons/react";

// The live centre's building blocks: one panel, one tile, one segmented
// switch, one clock — so every view on /f1/live is spaced and labelled alike. A
// panel, tile or choice can carry an icon, as the paper's cards do.

export const clock = (utc: string) =>
  new Date(/Z|[+-]\d{2}:?\d{2}$/.test(utc) ? utc : `${utc}Z`).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export function Panel({
  id,
  icon: Glyph,
  label,
  meta,
  children,
  className = "",
  scroll = false,
  action,
}: {
  id?: string;
  icon?: Icon;
  label: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** A feed: the panel keeps its height and the list scrolls inside it. */
  scroll?: boolean;
  /** A control on the header's right (a switch, a link). */
  action?: React.ReactNode;
}) {
  return (
    <section id={id} className={`rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4 sm:p-5 scroll-mt-32 min-w-0 flex flex-col ${className}`}>
      <header className="flex items-center justify-between gap-3 pb-3 mb-4 border-b hairline shrink-0 min-h-[2rem]">
        <h2 className="font-label text-[11px] tracking-[0.12em] shrink-0 flex items-center gap-1.5">
          {Glyph && <Glyph size={15} style={{ color: "var(--hue-f1)" }} aria-hidden="true" />}
          {label}
        </h2>
        {action ?? (meta && <span className="font-mono text-[11px] leading-snug text-ink-faint text-right min-w-0">{meta}</span>)}
      </header>
      {scroll ? <div className="min-h-0 flex-1 overflow-y-auto -mr-2 pr-2 [scrollbar-width:thin] overscroll-contain">{children}</div> : children}
    </section>
  );
}

export function Tile({ icon: Glyph, label, value, unit, tone }: { icon?: Icon; label: string; value: React.ReactNode; unit?: string; tone?: string }) {
  return (
    <div className="rounded-xl border hairline px-3 pt-2.5 pb-2 min-w-0" style={tone ? { borderColor: tone, background: `color-mix(in srgb, ${tone} 12%, transparent)` } : undefined}>
      <div className="font-label text-[11px] text-ink-faint flex items-center gap-1 min-w-0">
        {Glyph && <Glyph size={13} className="shrink-0" aria-hidden="true" />}
        <span className="truncate">{label}</span>
      </div>
      <div className="font-display font-extrabold text-[1.35rem] sm:text-[1.55rem] leading-none mt-1.5 tabular-nums truncate" style={tone ? { color: tone } : undefined}>
        {value}
        {unit && <span className="font-mono font-normal text-[11px] text-ink-soft ml-1">{unit}</span>}
      </div>
    </div>
  );
}

/** A row of choices, one on (filters, sub-views). Scrolls sideways on a phone rather than wrapping. */
export function Seg<T extends string>({
  value,
  options,
  onChange,
  label,
  size = "md",
}: {
  value: T;
  options: { value: T; label: string; count?: number; icon?: Icon }[];
  onChange: (v: T) => void;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div className="max-w-full overflow-x-auto [scrollbar-width:none] -mx-1 px-1">
      <div className="inline-flex rounded-full border hairline p-0.5 gap-0.5" role="tablist" aria-label={label}>
        {options.map((o) => {
          const on = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onChange(o.value)}
              className={`rounded-full whitespace-nowrap font-sans font-semibold transition-colors flex items-center gap-1.5 ${size === "sm" ? "px-2.5 h-7 text-[11.5px]" : "px-3.5 h-8 text-[12.5px]"} ${on ? "text-[color:var(--paper)]" : "text-ink-soft hover:text-ink"}`}
              style={on ? { background: "var(--ink)" } : undefined}
            >
              {o.icon && <o.icon size={14} weight={on ? "fill" : "regular"} aria-hidden="true" />}
              {o.label}
              {o.count !== undefined && <span className={`font-mono text-[11px] tabular-nums ${on ? "opacity-70" : "text-ink-faint"}`}>{o.count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-[11px] text-ink-faint py-6 text-center">{children}</p>;
}
