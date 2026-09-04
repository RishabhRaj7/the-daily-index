import type { MarketIndex } from "@/lib/types";
import SparklineChart from "./SparklineChart";

function Pct({ value }: { value: number | null }) {
  if (value == null) return <span className="font-mono text-xs text-ink-soft tabular-nums">—</span>;
  const positive = value >= 0;
  return (
    <span className={`font-mono text-xs tabular-nums ${positive ? "text-up" : "text-down"}`}>
      {positive ? "+" : "−"}
      {Math.abs(value).toFixed(2)}%
    </span>
  );
}

// One row of the markets table — set like a financial page, not a widget.
export default function MarketIndexCard({ index }: { index: MarketIndex }) {
  const positive = index.changePct >= 0;
  return (
    <li className="py-3 grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,1.4fr)_auto_repeat(3,4.2rem)_5rem] items-center gap-x-3 gap-y-1">
      <div className="min-w-0">
        <div className="font-label text-[9px] text-ink-soft">{index.market}</div>
        <div className="font-headline text-base font-semibold leading-tight truncate">{index.name}</div>
      </div>
      <div className="font-mono text-lg tabular-nums text-right">
        {index.level.toLocaleString("en-US", { maximumFractionDigits: 1 })}
      </div>
      <div className="text-right"><span className="font-label text-[8px] text-ink-soft sm:hidden mr-1">1D</span><Pct value={index.changePct} /></div>
      <div className="text-right"><span className="font-label text-[8px] text-ink-soft sm:hidden mr-1">7D</span><Pct value={index.change7d} /></div>
      <div className="text-right"><span className="font-label text-[8px] text-ink-soft sm:hidden mr-1">1M</span><Pct value={index.change1m} /></div>
      <div className="hidden sm:flex justify-end">
        <SparklineChart values={index.sparkline} positive={positive} />
      </div>
      <p className="col-span-full font-body text-xs text-ink-soft leading-relaxed">{index.narrative}</p>
    </li>
  );
}
