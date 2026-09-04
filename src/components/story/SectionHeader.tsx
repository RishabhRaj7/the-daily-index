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
  "plastic-points": (
    <svg viewBox="0 0 16 16" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3.5" width="14" height="9" rx="1.5" />
      <line x1="1" y1="7" x2="15" y2="7" />
      <rect x="3" y="9" width="3.5" height="2" rx="0.5" />
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

// Every section opens the same way: a heavy ink rule, then a header line
// with the section glyph, the name, a hairline, and an optional folio
// (section number / count) on the right. Identical on every section so the
// eye learns exactly where one ends and the next begins.
export default function SectionHeader({
  label,
  sectionKey,
  folio,
  sub,
}: {
  label?: string;
  sectionKey?: SectionKey;
  /** Right-aligned small print, e.g. "§ 3 · 5 stories". */
  folio?: string;
  /** One italic line beneath the name — the section's kicker/description. */
  sub?: string;
}) {
  const resolvedLabel = label ?? (sectionKey ? SECTION_META[sectionKey].label : "");
  const resolvedSub = sub;
  const icon = sectionKey ? ICONS[sectionKey] : null;

  return (
    <header className="section-head">
      <div className="flex items-center gap-2.5">
        {icon && <div className="text-masthead-red shrink-0 flex items-center">{icon}</div>}
        <h2 className="font-label text-[13px] sm:text-sm shrink-0 leading-none">{resolvedLabel}</h2>
        <div className="h-px flex-1 bg-rule" />
        {folio && (
          <span className="font-mono text-[10px] text-ink-soft shrink-0 leading-none">{folio}</span>
        )}
      </div>
      {resolvedSub && resolvedSub !== resolvedLabel && (
        <p className="font-headline italic text-[13px] text-ink-soft mt-1.5 leading-snug">{resolvedSub}</p>
      )}
    </header>
  );
}
