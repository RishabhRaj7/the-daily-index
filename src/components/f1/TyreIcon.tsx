import type { TyreCompound } from "@/lib/f1-live-types";

// A tyre as the timing screens draw it: the compound's colour as the
// sidewall ring, its initial in the middle. A used set wears a fainter ring.

export const TYRE: Record<TyreCompound, { colour: string; letter: string; name: string }> = {
  SOFT: { colour: "#ff3b4a", letter: "S", name: "Soft" },
  MEDIUM: { colour: "#ffd12e", letter: "M", name: "Medium" },
  HARD: { colour: "var(--tyre-hard)", letter: "H", name: "Hard" },
  INTERMEDIATE: { colour: "#3ccf5a", letter: "I", name: "Intermediate" },
  WET: { colour: "#2f8cff", letter: "W", name: "Wet" },
  UNKNOWN: { colour: "var(--ink-faint)", letter: "?", name: "Unknown" },
};

export default function TyreIcon({ compound, fresh = true, size = 18, title }: { compound: TyreCompound; fresh?: boolean; size?: number; title?: string }) {
  const t = TYRE[compound];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={title ?? `${fresh ? "New" : "Used"} ${t.name.toLowerCase()}s`} className="shrink-0">
      <circle cx="12" cy="12" r="10.25" fill="var(--paper)" stroke={t.colour} strokeWidth="3.5" opacity={fresh ? 1 : 0.55} />
      <circle cx="12" cy="12" r="10.25" fill="none" stroke="var(--ink)" strokeOpacity="0.12" strokeWidth="0.5" />
      <text x="12" y="12" dy="0.36em" textAnchor="middle" fontSize="10.5" fontWeight="700" fontFamily="var(--font-mono)" fill={t.colour} opacity={fresh ? 1 : 0.7}>
        {t.letter}
      </text>
    </svg>
  );
}
