import type { SectionKey } from "@/lib/types";
import { SECTION_META } from "@/lib/sections";

const ICONS: Partial<Record<SectionKey, React.ReactNode>> = {
  dateline: (
    <svg viewBox="0 0 16 16" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 2 C6.2 4.5 6.2 11.5 8 14" />
      <path d="M8 2 C9.8 4.5 9.8 11.5 8 14" />
      <line x1="2" y1="8" x2="14" y2="8" />
    </svg>
  ),
  "paddock-notes": (
    <svg viewBox="0 0 16 16" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="2" x2="3" y2="14" />
      <path d="M3 2 L13 4.5 L3 7" />
    </svg>
  ),
  "sky-report": (
    <svg viewBox="0 0 16 16" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="2.5" />
      <line x1="8" y1="1.5" x2="8" y2="3.5" />
      <line x1="8" y1="12.5" x2="8" y2="14.5" />
      <line x1="1.5" y1="8" x2="3.5" y2="8" />
      <line x1="12.5" y1="8" x2="14.5" y2="8" />
      <line x1="3.3" y1="3.3" x2="4.7" y2="4.7" />
      <line x1="11.3" y1="11.3" x2="12.7" y2="12.7" />
      <line x1="12.7" y1="3.3" x2="11.3" y2="4.7" />
      <line x1="4.7" y1="11.3" x2="3.3" y2="12.7" />
    </svg>
  ),
  "circuit-board": (
    <svg viewBox="0 0 16 16" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4.5" y="4.5" width="7" height="7" rx="0.5" />
      <line x1="7" y1="4.5" x2="7" y2="2" />
      <line x1="9" y1="4.5" x2="9" y2="2" />
      <line x1="7" y1="11.5" x2="7" y2="14" />
      <line x1="9" y1="11.5" x2="9" y2="14" />
      <line x1="4.5" y1="7" x2="2" y2="7" />
      <line x1="4.5" y1="9" x2="2" y2="9" />
      <line x1="11.5" y1="7" x2="14" y2="7" />
      <line x1="11.5" y1="9" x2="14" y2="9" />
    </svg>
  ),
  ledger: (
    <svg viewBox="0 0 16 16" className="w-[18px] h-[18px]" fill="currentColor" stroke="none">
      <line x1="2" y1="13.5" x2="14" y2="13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <rect x="2.5" y="9.5" width="2.5" height="4" rx="0.4" />
      <rect x="6.75" y="6.5" width="2.5" height="7" rx="0.4" />
      <rect x="11" y="3.5" width="2.5" height="10" rx="0.4" />
    </svg>
  ),
  "market-pulse": (
    <svg viewBox="0 0 16 16" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1,8 4.5,8 6,4 8,12 10,5.5 11.5,8 15,8" />
    </svg>
  ),
  grapevine: (
    <svg viewBox="0 0 16 16" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="12.5" r="1" />
      <line x1="8" y1="11.5" x2="8" y2="9.5" />
      <path d="M5 8 A4 4 0 0 1 11 8" />
      <path d="M2.5 5.5 A7 7 0 0 1 13.5 5.5" />
    </svg>
  ),
};

/** Splits "The Circuit Board" into words that rise one after another. */
export function RisingWords({ text }: { text: string }) {
  return (
    <>
      {text.split(" ").map((word, i, all) => (
        <span key={`${word}-${i}`} className="mask-rise" style={{ ["--rise-i" as string]: i }}>
          <span>
            {word}
            {i < all.length - 1 ? " " : ""}
          </span>
        </span>
      ))}
    </>
  );
}

// Every section opens the same way: a mono index line (number from a CSS
// counter, the section's glyph and its kicker), the section's own name set
// huge in the display face and rising out of a mask as it scrolls in, and a
// rule in the section's colour that draws itself across. The colour comes
// from --section-hue, set on the section wrapper, so the rest of the section
// (hover lines, links) wears it too.
export default function SectionHeader({
  label,
  sectionKey,
  folio,
  sub,
}: {
  label?: string;
  sectionKey?: SectionKey;
  /** Right-aligned small print, e.g. "live tape". */
  folio?: React.ReactNode;
  /** The kicker line above the name. */
  sub?: string;
}) {
  const meta = sectionKey ? SECTION_META[sectionKey] : null;
  const name = meta?.name ?? label?.split(" — ")[0] ?? "";
  const kicker = sub ?? meta?.kicker ?? label?.split(" — ")[1];
  const icon = sectionKey ? ICONS[sectionKey] : null;

  return (
    <header className="section-head" data-reveal="fade">
      <div className="flex items-center gap-2.5 font-mono text-[11px] text-ink-soft mb-3">
        <span className="section-number text-ink" aria-hidden="true" />
        <span className="h-px w-6 bg-rule" aria-hidden="true" />
        {icon && (
          <span className="shrink-0 flex items-center" style={{ color: "var(--section-hue, var(--accent))" }}>
            {icon}
          </span>
        )}
        {kicker && kicker !== name && <span className="uppercase tracking-wider truncate">{kicker}</span>}
        {folio && (
          <span className="ml-auto shrink-0 inline-flex items-center gap-1.5 uppercase tracking-wider">
            {folio}
          </span>
        )}
      </div>
      <h2 className="font-display font-extrabold text-[clamp(2.9rem,10vw,7.25rem)] leading-[0.84] -ml-[0.04em]">
        <RisingWords text={name} />
      </h2>
      <div className="mt-5 h-[3px] rule-draw" style={{ background: "var(--section-hue, var(--accent))" }} />
    </header>
  );
}
