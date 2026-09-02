import type { StatItem } from "@/lib/types";

export default function StatCallout({ stats }: { stats: StatItem[] }) {
  return (
    <aside className="border hairline rounded-sm p-3 bg-card-bg w-full sm:float-right sm:ml-4 sm:mb-2 sm:w-40 sm:shrink-0 mb-3">
      <div className="font-label text-[10px] text-ink-soft mb-2">By the numbers</div>
      <dl className="flex flex-wrap gap-x-6 gap-y-2 sm:block sm:space-y-2">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="text-[11px] text-ink-soft leading-tight">{s.label}</dt>
            <dd className="font-mono text-base leading-tight">{s.value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
