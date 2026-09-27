import type { StatItem } from "@/lib/types";

export default function StatCallout({ stats }: { stats: StatItem[] }) {
  return (
    <dl className="flex flex-wrap gap-x-8 gap-y-3 border-l-2 pl-4 py-1" style={{ borderColor: "var(--section-hue, var(--accent))" }}>
      {stats.map((s) => (
        <div key={s.label}>
          <dt className="font-label text-[9px] text-ink-soft">{s.label}</dt>
          <dd className="font-display font-bold text-[1.9rem] leading-none mt-1">{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}
