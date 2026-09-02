import type { F1Standing } from "@/lib/types";

export default function FavoriteDriverCard({
  standing,
  accentColor,
}: {
  standing: F1Standing;
  accentColor?: string;
}) {
  return (
    <div
      className="border hairline rounded-sm p-4 bg-card-bg"
      style={accentColor ? { borderLeft: `4px solid ${accentColor}` } : undefined}
    >
      <div className="font-label text-[10px] text-ink-soft mb-1">Your Driver</div>
      <div className="flex items-baseline justify-between">
        <span className="font-headline text-xl font-semibold">{standing.name}</span>
        <span
          className="font-mono text-xs px-1.5 py-0.5 rounded-sm"
          style={{
            backgroundColor: accentColor ?? "var(--ink-soft)",
            color: "var(--paper)",
          }}
        >
          {standing.code}
        </span>
      </div>
      <div className="text-xs text-ink-soft mb-2">{standing.team}</div>
      <dl className="grid grid-cols-3 gap-2 text-center">
        <div>
          <dt className="text-[10px] text-ink-soft">Position</dt>
          <dd className="font-mono text-lg">P{standing.position}</dd>
        </div>
        <div>
          <dt className="text-[10px] text-ink-soft">Points</dt>
          <dd className="font-mono text-lg">{standing.points}</dd>
        </div>
        <div>
          <dt className="text-[10px] text-ink-soft">Wins</dt>
          <dd className="font-mono text-lg">{standing.wins}</dd>
        </div>
      </dl>
    </div>
  );
}
