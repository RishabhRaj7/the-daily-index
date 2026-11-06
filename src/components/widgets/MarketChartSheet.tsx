"use client";

import { ChartBarIcon, ChartLineIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PriceBar } from "@/lib/types";
import Sheet from "@/components/extras/Sheet";
import MoveArrow from "@/components/chrome/MoveArrow";
import PriceChart from "./PriceChart";

// The detail view behind a market card, simple enough to read at a glance: the
// price and its move, a thin line against a dashed start, one row of ranges, and
// a small toggle to candles. A finger or pointer on the chart reads that moment.
// Underneath, where the price sits in its day and its 52 weeks, and the few figures
// worth keeping. The move is measured from the same level as the card's (see startOf
// in lib/live/charts.ts), so the two agree. Gold and silver say what each line is.

type Range = "1D" | "5D" | "1M" | "6M" | "1Y" | "5Y";
const RANGES: Range[] = ["1D", "5D", "1M", "6M", "1Y", "5Y"];
const RANGE_WORDS: Record<Range, string> = { "1D": "today", "5D": "past 5 days", "1M": "past month", "6M": "past 6 months", "1Y": "past year", "5Y": "past 5 years" };

// A 1D chart on a closed day shows the last session: say which.
function sessionLabel(bars: PriceBar[]): string {
  const last = bars.at(-1);
  if (!last) return "today";
  const d = new Date(last.t * 1000);
  return d.toDateString() === new Date().toDateString()
    ? "today"
    : `last session, ${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}`;
}

interface ChartData {
  name: string;
  unit: string;
  bars: PriceBar[];
  previousClose: number | null;
  hasVolume: boolean;
  note?: string;
  /** The official rate the tile prints, when the chart's live line differs
   *  from it (gold and silver: IBJA's rate and when it was published). */
  reference?: { label: string; value: number; asOf: string };
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

/** "23,244.2 (+6.8%)": a level, and how far the price is from it. */
function fromLevel(level: number, price: number, prefix: string): string {
  const gap = (price / level - 1) * 100;
  return `${fmt(level, prefix)} (${gap >= 0 ? "+" : "−"}${Math.abs(gap).toFixed(1)}%)`;
}

/** One range of one market; undefined while it's on its way, null if it failed. */
function useChart(target: ChartTarget, range: Range): ChartData | null | undefined {
  const key = `${target.kind}:${target.id}:${range}`;
  const [result, setResult] = useState<{ key: string; data: ChartData | null } | null>(null);
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
  return result?.key === key ? result.data : undefined;
}

/** Where a price sits between a low and a high. */
function RangeBar({ label, low, high, at, format }: { label: string; low: number; high: number; at: number; format: (v: number) => string }) {
  const place = Math.min(100, Math.max(0, ((at - low) / Math.max(1e-9, high - low)) * 100));
  return (
    <div className="grid grid-cols-[4.25rem_auto_minmax(2rem,1fr)_auto] items-center gap-2.5 font-mono text-[12px] tabular-nums">
      <span className="font-sans text-ink-soft">{label}</span>
      <span>{format(low)}</span>
      <span className="relative h-1 rounded-full bg-[color:var(--rule)]" title={format(at)}>
        <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-[3px] h-3 rounded-full bg-ink" style={{ left: `${place}%` }} />
      </span>
      <span>{format(high)}</span>
    </div>
  );
}

export default function MarketChartSheet({ target, onClose }: { target: ChartTarget; onClose: () => void }) {
  const [range, setRange] = useState<Range>("1D");
  const [mode, setMode] = useState<"line" | "candles">("line");
  const [hover, setHover] = useState<PriceBar | null>(null);
  const data = useChart(target, range);
  const day = useChart(target, "1D");
  const year = useChart(target, "1Y");

  const loading = data === undefined;
  const bars = useMemo(() => data?.bars ?? [], [data]);
  const prefix = target.prefix ?? "";
  const format = useCallback((p: number) => fmt(p, prefix), [prefix]);
  const onHover = useCallback((b: PriceBar | null) => setHover(b), []);

  const start = bars.length ? (data?.previousClose ?? bars[0].o) : null;
  // At rest, the live price, whichever range is showing; the longer ranges' last
  // bar can be a few minutes behind it.
  const latest = day?.bars.at(-1)?.c ?? bars.at(-1)?.c ?? null;
  const price = hover?.c ?? latest;
  const change = price !== null && start ? price - start : null;
  const pct = change !== null && start ? (change / start) * 100 : null;
  // The chart's colour follows the range, not the point under the finger.
  const up = latest !== null && start ? latest >= start : true;
  const moveUp = (change ?? 0) >= 0;

  // The tile's official rate, drawn on the chart as a dotted line.
  const refData = data?.reference;
  const chartRef = useMemo(
    () => (refData ? { price: refData.value, label: "IBJA", t: Math.floor(Date.parse(refData.asOf) / 1000) } : null),
    [refData],
  );

  const dayRange = useMemo(() => {
    const b = day?.bars ?? [];
    return b.length ? { low: Math.min(...b.map((x) => x.l)), high: Math.max(...b.map((x) => x.h)), open: b[0].o, last: b[b.length - 1].c } : null;
  }, [day]);

  // The year behind it, whatever range is showing.
  const longView = useMemo(() => {
    const yb = year?.bars ?? [];
    if (yb.length < 60) return null;
    const closes = yb.map((b) => b.c);
    const last = dayRange?.last ?? closes[closes.length - 1];
    const avg = (n: number) => (closes.length >= n ? closes.slice(-n).reduce((a, b) => a + b, 0) / n : null);
    return { last, hi: Math.max(...yb.map((b) => b.h)), lo: Math.min(...yb.map((b) => b.l)), dma50: avg(50), dma200: avg(200) };
  }, [year, dayRange]);

  const volume = data?.hasVolume ? bars.reduce((s, b) => s + (b.v ?? 0), 0) : null;
  const words = range === "1D" ? sessionLabel(bars) : RANGE_WORDS[range];
  const figures: [string, string][] = [];
  if (dayRange) figures.push(["Open", fmt(dayRange.open, prefix)]);
  if (volume) figures.push(["Volume", compact(volume)]);
  if (longView?.dma50) figures.push(["50-day average", fromLevel(longView.dma50, longView.last, prefix)]);
  if (longView?.dma200) figures.push(["200-day average", fromLevel(longView.dma200, longView.last, prefix)]);

  return (
    <Sheet title={target.name} kicker={target.kicker} onClose={onClose} width={720}>
      {/* The price under the finger, else the latest, and its move. */}
      {data?.reference && <div className="font-label text-[11px] text-ink-soft mb-1">COMEX in rupees, live</div>}
      <div className="font-display font-extrabold text-[clamp(2.4rem,7vw,3.4rem)] leading-none tabular-nums">{price !== null ? fmt(price, prefix) : "—"}</div>
      <div className="font-mono text-[14px] mt-1.5 min-h-[1.5em] tabular-nums">
        {change !== null && pct !== null && (
          <span className={moveUp ? "text-up" : "text-down"}>
            <MoveArrow up={moveUp} size={13} /> {moveUp ? "+" : "−"}
            {fmt(Math.abs(change), prefix)} ({Math.abs(pct).toFixed(2)}%)
          </span>
        )}{" "}
        <span className="font-sans text-[13px] text-ink-soft">{hover ? when(hover.t, range) : words}</span>
      </div>

      {/* Chart */}
      <div className="relative mt-3">
        {loading ? (
          <div className="h-[300px] grid place-items-center">
            <span className="font-mono text-[11px] text-ink-soft animate-pulse">Drawing the chart…</span>
          </div>
        ) : bars.length === 0 ? (
          <div className="h-[300px] grid place-items-center text-center">
            <span className="font-headline italic text-ink-soft">No prices for this range right now.</span>
          </div>
        ) : (
          <PriceChart
            key={`${target.kind}:${target.id}:${range}:${mode}`}
            plain
            bars={bars}
            mode={mode}
            previousClose={data?.previousClose ?? null}
            showVolume={Boolean(data?.hasVolume)}
            intraday={range === "1D" || range === "5D" || range === "1M"}
            height={300}
            onHover={onHover}
            format={format}
            trend={up ? "up" : "down"}
            reference={chartRef}
          />
        )}
      </div>
      {start !== null && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-ink-soft mt-1">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 border-t border-dashed border-ink-faint" aria-hidden="true" />
            {range === "1D" ? "Previous close" : "Start of range"} {fmt(start, prefix)}
          </span>
          {data?.reference && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 border-t-2 border-dotted" style={{ borderColor: "var(--hue-poll)" }} aria-hidden="true" />
              IBJA rate, on the card: {fmt(data.reference.value, prefix)} ·{" "}
              {new Date(data.reference.asOf).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
      )}

      {/* One row of ranges, and how to draw them. */}
      <div className="flex items-center justify-between gap-2 mt-3">
        <div className="flex" role="group" aria-label="Range">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={r === range}
              onClick={() => {
                setHover(null);
                setRange(r);
              }}
              className={`rounded-full px-2.5 sm:px-3 min-h-9 font-mono text-[12px] transition-colors ${r === range ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"}`}
            >
              {r}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setMode((m) => (m === "line" ? "candles" : "line"))}
          className="icon-btn shrink-0"
          aria-label={mode === "line" ? "Show candles" : "Show a line"}
          title={mode === "line" ? "Show candles" : "Show a line"}
        >
          {mode === "line" ? <ChartBarIcon size={18} aria-hidden="true" /> : <ChartLineIcon size={18} aria-hidden="true" />}
        </button>
      </div>

      {/* Where it sits, and the few figures worth keeping. */}
      {(dayRange || longView) && (
        <div className="grid gap-2.5 mt-5 pt-4 border-t hairline">
          {dayRange && <RangeBar label="Day" low={dayRange.low} high={dayRange.high} at={dayRange.last} format={format} />}
          {longView && <RangeBar label="52 weeks" low={longView.lo} high={longView.hi} at={longView.last} format={format} />}
          {longView && (
            <p className="font-sans text-[12.5px] text-ink-soft m-0">
              {Math.abs((longView.last / longView.hi - 1) * 100).toFixed(1)}% below the 52-week high, {Math.abs((longView.last / longView.lo - 1) * 100).toFixed(1)}% above the low
            </p>
          )}
        </div>
      )}
      {figures.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 mt-4">
          {figures.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="font-label text-[11px] text-ink-soft">{label}</dt>
              <dd className="font-mono text-[13px] tabular-nums mt-0.5">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {data?.note && <p className="font-sans text-[12px] text-ink-soft mt-4">{data.note}</p>}
    </Sheet>
  );
}
