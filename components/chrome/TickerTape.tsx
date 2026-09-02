import type { TrendingTopic } from "@/lib/types";

export default function TickerTape({ topics }: { topics: TrendingTopic[] }) {
  const items = [...topics, ...topics];

  return (
    <div className="border-y hairline overflow-hidden bg-card-bg">
      <div className="flex whitespace-nowrap py-2 marquee-track w-max">
        {items.map((t, i) => (
          <span
            key={`${t.id}-${i}`}
            className="inline-flex items-center gap-2 px-6 font-label text-xs tracking-wide"
          >
            <span
              className={
                t.platform === "x"
                  ? "text-masthead-red"
                  : "text-up"
              }
            >
              {t.platform === "x" ? "X" : "REDDIT"}
            </span>
            <span className="font-body normal-case text-ink-soft text-sm">
              {t.label}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
