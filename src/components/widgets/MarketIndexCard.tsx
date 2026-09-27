import type { MarketIndex } from "@/lib/types";
import SparklineChart from "./SparklineChart";

function Pct({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex flex-col">
      <span className="font-label text-[8px] text-ink-faint">{label}</span>
      {value == null ? (
        <span className="font-mono text-xs text-ink-soft">—</span>
      ) : (
        <span className={`font-mono text-xs tabular-nums ${value >= 0 ? "text-up" : "text-down"}`}>
          {value >= 0 ? "+" : "−"}
          {Math.abs(value).toFixed(2)}%
        </span>
      )}
    </div>
  );
}

// One index as a tile: the level large, today's move as a pill, the month
// as a line that draws itself in.
export default function MarketIndexCard({
  index,
  i = 0,
  live = false,
}: {
  index: MarketIndex;
  i?: number;
  /** Once live updates are flowing, a level that changes flashes once. */
  live?: boolean;
}) {
  const positive = index.changePct >= 0;
  return (
    <li
      className="module group h-full flex flex-col gap-3 transition-[transform,border-color] duration-300 hover:-translate-y-0.5 hover:border-[color:var(--section-hue)]"
      data-reveal
      style={{ ["--reveal-i" as string]: i }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-label text-[9px] text-ink-soft">{index.market}</div>
          <div className="font-sans font-semibold text-[15px] leading-tight truncate">{index.name}</div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold ${
            positive ? "bg-up text-paper" : "bg-down text-paper"
          }`}
        >
          {positive ? "▲" : "▼"} {Math.abs(index.changePct).toFixed(2)}%
        </span>
      </div>
      <div
        key={index.level}
        className={`font-display font-bold text-[2.5rem] leading-[0.85] tracking-tight ${live ? "animate-[tick-flash_1.2s_ease-out]" : ""}`}
      >
        {index.level.toLocaleString("en-US", { maximumFractionDigits: 1 })}
      </div>
      <SparklineChart values={index.sparkline} positive={positive} className="w-full h-12" />
      <div className="flex gap-5">
        <Pct label="7D" value={index.change7d} />
        <Pct label="1M" value={index.change1m} />
      </div>
      {index.narrative && <p className="font-body text-xs text-ink-soft leading-relaxed line-clamp-3">{index.narrative}</p>}
    </li>
  );
}
