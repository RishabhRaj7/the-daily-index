import type { MarketIndex } from "@/lib/types";
import SparklineChart from "./SparklineChart";

function ChangePill({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null;
  const positive = value >= 0;
  return (
    <div className="flex flex-col items-center">
      <span className="font-label text-[9px] text-ink-soft">{label}</span>
      <span className={`font-mono text-[11px] ${positive ? "text-up" : "text-down"}`}>
        {positive ? "+" : ""}{value.toFixed(2)}%
      </span>
    </div>
  );
}

export default function MarketIndexCard({ index }: { index: MarketIndex }) {
  const positive = index.changePct >= 0;
  return (
    <div className="border hairline rounded-sm p-3 bg-card-bg">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-label text-[10px] text-ink-soft">{index.market}</div>
          <div className="font-headline text-lg font-semibold leading-tight">
            {index.name}
          </div>
        </div>
        <SparklineChart values={index.sparkline} positive={positive} />
      </div>

      <div className="flex items-baseline gap-2 mt-2">
        <span className="font-mono text-xl">
          {index.level.toLocaleString("en-US", { maximumFractionDigits: 1 })}
        </span>
        <span className={`font-mono text-sm ${positive ? "text-up" : "text-down"}`}>
          {positive ? "+" : ""}{index.changePct.toFixed(2)}%
        </span>
      </div>

      <div className="flex items-center gap-4 mt-2 pt-2 border-t hairline">
        <ChangePill label="1D" value={index.changePct} />
        <ChangePill label="7D" value={index.change7d} />
        <ChangePill label="1M" value={index.change1m} />
      </div>

      <p className="text-xs text-ink-soft mt-2 leading-relaxed">{index.narrative}</p>
    </div>
  );
}
