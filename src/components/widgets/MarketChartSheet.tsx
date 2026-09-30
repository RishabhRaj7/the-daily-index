"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PriceBar } from "@/lib/types";
import Sheet from "@/components/extras/Sheet";
import PriceChart from "./PriceChart";

// The detail view behind a market tile: a proper price chart over six
// ranges, area or candles, a readout that follows the pointer, and the
// range's numbers underneath.

type Range = "1D" | "5D" | "1M" | "6M" | "1Y" | "5Y";
const RANGES: Range[] = ["1D", "5D", "1M", "6M", "1Y", "5Y"];

interface ChartData {
  name: string;
  unit: string;
  bars: PriceBar[];
  previousClose: number | null;
  hasVolume: boolean;
  note?: string;
}

export interface ChartTarget {
  kind: "index" | "commodity" | "crypto";
  id: string;
  name: string;
  /** Small label above the name: "India", "Commodity · ₹", "Crypto · USDT". */
  kicker: string;
  /** Rupee / USDT prefix for prices. */
  prefix?: string;
}

function fmt(v: number, prefix = ""): string {
  const digits = Math.abs(v) >= 1000 ? 1 : Math.abs(v) >= 10 ? 2 : 3;
  return `${prefix}${v.toLocaleString(prefix === "₹" ? "en-IN" : "en-US", { maximumFractionDigits: digits, minimumFractionDigits: Math.min(digits, 2) })}`;
}

function when(t: number, range: Range): string {
  const d = new Date(t * 1000);
  return range === "1D" || range === "5D" || range === "1M"
    ? d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function compact(n: number): string {
  return n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });
}

export default function MarketChartSheet({ target, onClose }: { target: ChartTarget; onClose: () => void }) {
  const [range, setRange] = useState<Range>("1D");
  const [mode, setMode] = useState<"area" | "candles">("area");
  const [result, setResult] = useState<{ key: string; data: ChartData | null } | null>(null);
  const [hover, setHover] = useState<PriceBar | null>(null);
  const key = `${target.kind}:${target.id}:${range}`;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/chart?kind=${target.kind}&id=${target.id}&range=${range}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ChartData | null) => !cancelled && setResult({ key, data }))
      .catch(() => !cancelled && setResult({ key, data: null }));
    return () => {
      cancelled = true;
    };
  }, [target.kind, target.id, range, key]);

  const loading = result?.key !== key;
  const data = loading ? null : result?.data ?? null;
  const bars = useMemo(() => data?.bars ?? [], [data]);
  const prefix = target.prefix ?? "";
  const format = useCallback((p: number) => fmt(p, prefix), [prefix]);
  const onHover = useCallback((b: PriceBar | null) => setHover(b), []);

  const stats = useMemo(() => {
    if (bars.length === 0) return null;
    const first = bars[0];
    const last = bars[bars.length - 1];
    const base = range === "1D" && data?.previousClose ? data.previousClose : first.o;
    const change = last.c - base;
    return {
      last: last.c,
      change,
      changePct: (change / base) * 100,
      open: first.o,
      high: Math.max(...bars.map((b) => b.h)),
      low: Math.min(...bars.map((b) => b.l)),
      base,
      volume: data?.hasVolume ? bars.reduce((s, b) => s + (b.v ?? 0), 0) : null,
    };
  }, [bars, data, range]);

  const shown = hover ?? (bars.length ? bars[bars.length - 1] : null);
  const up = (stats?.change ?? 0) >= 0;

  return (
    <Sheet title={target.name} kicker={target.kicker} onClose={onClose} width={880}>
      {/* Readout: the price under the pointer, else the latest. */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <div className="font-display font-extrabold text-[clamp(2.2rem,6vw,3.2rem)] leading-none tabular-nums">
            {shown ? fmt(shown.c, prefix) : "—"}
          </div>
          <div className="font-mono text-[11px] text-ink-soft mt-1.5 min-h-[1em]">
            {hover
              ? `${when(hover.t, range)} · O ${fmt(hover.o, prefix)} H ${fmt(hover.h, prefix)} L ${fmt(hover.l, prefix)}`
              : data
                ? `${data.unit} · ${range === "1D" ? "today" : `past ${range.toLowerCase()}`}`
                : ""}
          </div>
        </div>
        {stats && (
          <span
            className={`rounded-full px-3 py-1 font-mono text-[13px] font-semibold ${up ? "bg-up" : "bg-down"}`}
            style={{ color: "var(--paper)" }}
          >
            {up ? "▲" : "▼"} {fmt(Math.abs(stats.change), prefix)} ({Math.abs(stats.changePct).toFixed(2)}%)
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mt-5">
        <div className="flex gap-1 rounded-full border hairline p-1" role="tablist" aria-label="Range">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={r === range}
              onClick={() => setRange(r)}
              className={`rounded-full px-3 py-1 font-mono text-[12px] transition-colors ${
                r === range ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-full border hairline p-1">
          {(["area", "candles"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={m === mode}
              onClick={() => setMode(m)}
              className={`rounded-full px-3 py-1 font-sans text-[12px] capitalize transition-colors ${
                m === mode ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="relative mt-4 rounded-2xl border hairline bg-card-bg p-2 sm:p-3">
        {loading ? (
          <div className="h-[340px] grid place-items-center">
            <span className="font-mono text-[11px] text-ink-soft animate-pulse">Drawing the chart…</span>
          </div>
        ) : bars.length === 0 ? (
          <div className="h-[340px] grid place-items-center text-center">
            <span className="font-headline italic text-ink-soft">No prices for this range right now.</span>
          </div>
        ) : (
          <PriceChart
            key={`${key}:${mode}`}
            bars={bars}
            mode={mode}
            previousClose={range === "1D" ? (data?.previousClose ?? null) : null}
            showVolume={Boolean(data?.hasVolume)}
            intraday={range === "1D" || range === "5D" || range === "1M"}
            height={340}
            onHover={onHover}
            format={format}
            trend={up ? "up" : "down"}
          />
        )}
      </div>

      {/* The range in numbers */}
      {stats && (
        <dl className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-3 mt-5">
          {[
            ["Open", fmt(stats.open, prefix)],
            ["High", fmt(stats.high, prefix)],
            ["Low", fmt(stats.low, prefix)],
            [range === "1D" ? "Prev close" : "Range start", fmt(stats.base, prefix)],
            ["Range", `${(((stats.high - stats.low) / stats.low) * 100).toFixed(2)}%`],
            stats.volume !== null ? ["Volume", compact(stats.volume)] : ["Bars", String(bars.length)],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="font-label text-[9px] text-ink-soft">{label}</dt>
              <dd className="font-mono text-[14px] tabular-nums mt-0.5 truncate">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {data?.note && <p className="font-sans text-[12px] text-ink-soft mt-4">{data.note}</p>}
    </Sheet>
  );
}
