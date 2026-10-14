import type { TyreCompound } from "@/lib/f1-live-types";

// A tyre as the strategy bars draw it: a small rounded square in the
// compound's colour with its initial, softly striped for a used set.

/** Each compound: its colour, the ink that reads on it, its letter and name. */
export const TYRE: Record<TyreCompound, { colour: string; ink: string; letter: string; name: string }> = {
  SOFT: { colour: "#ff3b4a", ink: "#fff", letter: "S", name: "Soft" },
  MEDIUM: { colour: "#ffd12e", ink: "#1a1a1a", letter: "M", name: "Medium" },
  HARD: { colour: "var(--tyre-hard)", ink: "var(--paper)", letter: "H", name: "Hard" },
  INTERMEDIATE: { colour: "#3ccf5a", ink: "#0d2414", letter: "I", name: "Intermediate" },
  WET: { colour: "#2f8cff", ink: "#fff", letter: "W", name: "Wet" },
  UNKNOWN: { colour: "var(--ink-faint)", ink: "var(--paper)", letter: "?", name: "Unknown" },
};

export default function TyreIcon({ compound, fresh = true, size = 18, title }: { compound: TyreCompound; fresh?: boolean; size?: number; title?: string }) {
  const t = TYRE[compound];
  // The same stripes for every used set of a compound, so one id serves them all (no hook: usable anywhere).
  const id = compound.toLowerCase();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={title ?? `${fresh ? "New" : "Used"} ${t.name.toLowerCase()}s`} className="shrink-0">
      {!fresh && (
        <defs>
          <pattern id={`used-${id}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill={t.colour} />
            <rect width="2.6" height="6" fill="var(--card-bg)" opacity="0.45" />
          </pattern>
        </defs>
      )}
      <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill={fresh ? t.colour : `url(#used-${id})`} />
      <text x="12" y="12" dy="0.36em" textAnchor="middle" fontSize="12" fontWeight="800" fontFamily="var(--font-mono)" fill={t.ink}>
        {t.letter}
      </text>
    </svg>
  );
}
