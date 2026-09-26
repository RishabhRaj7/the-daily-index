import type { F1RosterEntry, F1Standing } from "@/lib/types";

// "Your Driver" card.
//
// Identity (name / code / team) comes from the static season roster, so the
// card can print the moment the sidebar mounts. The championship figures
// arrive with the drivers' standings part and fill the three stats in place —
// no layout shift, and the card never sits blank waiting on a slow endpoint.
export default function FavoriteDriverCard({
  standing = null,
  pendingDriver = null,
  accentColor,
}: {
  standing?: F1Standing | null;
  pendingDriver?: F1RosterEntry | null;
  accentColor?: string;
}) {
  const name = standing?.name ?? pendingDriver?.name ?? "";
  const code = standing?.code ?? pendingDriver?.code ?? "";
  const team = standing?.team ?? pendingDriver?.team ?? "";
  if (!name) return null;

  const stats: Array<{ label: string; value: string }> = [
    { label: "Position", value: standing ? `P${standing.position}` : "—" },
    { label: "Points", value: standing ? String(standing.points) : "—" },
    { label: "Wins", value: standing ? String(standing.wins) : "—" },
  ];

  return (
    <div
      className="paper-box"
      style={{
        paddingInline: "0.75rem",
        borderTop: "none",
        borderBottom: "none",
        ...(accentColor ? { borderLeft: `4px solid ${accentColor}`, backgroundColor: `${accentColor}18` } : {}),
      }}
    >
      <div className="font-label text-[10px] text-ink-soft mb-1">Your Driver</div>
      <div className="flex items-baseline justify-between">
        <span className="font-headline text-xl font-semibold">{name}</span>
        {code && (
          <span
            className="font-mono text-xs px-1.5 py-0.5 rounded-sm"
            style={{
              backgroundColor: accentColor ?? "var(--ink-soft)",
              color: "var(--paper)",
            }}
          >
            {code}
          </span>
        )}
      </div>
      <div className="text-xs text-ink-soft mb-2">{team}</div>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="text-[10px] text-ink-soft">{s.label}</dt>
            <dd
              className={`font-mono text-lg${standing ? "" : " text-ink-soft animate-pulse"}`}
            >
              {s.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
