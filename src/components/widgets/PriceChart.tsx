"use client";

import { useEffect, useRef } from "react";
import type { PriceBar } from "@/lib/types";

// A TradingView Lightweight Charts price chart in the paper's colours: an
// area (or candles) in the section's hue, volume as faint bars along the
// bottom, and the previous close as a dashed line. The library is loaded
// only when a chart is first opened.

type Mode = "area" | "candles" | "line";

/** "#27f4d2" + 0.3 → "rgba(39,244,210,0.3)"; other colours pass through. */
function alpha(color: string, a: number): string {
  const hex = color.trim().replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return color;
  const n = parseInt(hex, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// Canvas can't read CSS variables: resolve them from the element's context.
function token(el: Element, name: string, fallback: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim() || fallback;
}

// The library draws times in UTC; shift them so axis labels read in the
// reader's own time zone.
const localShift = () => -new Date().getTimezoneOffset() * 60;

export default function PriceChart({
  bars,
  mode = "area",
  previousClose = null,
  showVolume = false,
  height = 320,
  intraday = true,
  hue,
  trend,
  onHover,
  format,
  reference = null,
}: {
  /** A second price to mark (the tile's official rate): a dotted line with
   *  its own axis tag, and a dot where it was set when that's on the chart. */
  reference?: { price: number; label: string; t?: number } | null;
  bars: PriceBar[];
  mode?: Mode;
  previousClose?: number | null;
  showVolume?: boolean;
  height?: number;
  /** Show clock times on the axis (intraday ranges). */
  intraday?: boolean;
  /** Series colour; defaults to the section hue. */
  hue?: string;
  /** Colour the series by direction instead: green when the range rose,
   *  red when it fell, like the change beside it. */
  trend?: "up" | "down";
  /** Crosshair readout: the bar under the pointer, or null when it leaves. */
  onHover?: (bar: PriceBar | null) => void;
  format?: (price: number) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const hoverRef = useRef(onHover);
  useEffect(() => {
    hoverRef.current = onHover;
  }, [onHover]);

  useEffect(() => {
    const el = ref.current;
    if (!el || bars.length === 0) return;
    let disposed = false;
    let cleanup = () => {};

    import("lightweight-charts").then((lc) => {
      if (disposed || !ref.current) return;
      const ink = token(el, "--ink", "#111");
      const soft = token(el, "--ink-soft", "#666");
      const rule = token(el, "--rule", "#ddd");
      const up = token(el, "--up", "#00a870");
      const down = token(el, "--down", "#e5484d");
      const color = trend ? (trend === "up" ? up : down) : (hue ?? token(el, "--section-hue", token(el, "--accent", "#5200ff")));
      const shift = localShift();

      const chart = lc.createChart(el, {
        autoSize: true,
        layout: {
          background: { type: lc.ColorType.Solid, color: "transparent" },
          textColor: soft,
          fontFamily: token(document.body, "--ff-mono", "monospace"),
          fontSize: 11,
          attributionLogo: false,
        },
        grid: { vertLines: { visible: false }, horzLines: { color: alpha(rule, 0.6) || rule } },
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: showVolume ? 0.22 : 0.08 } },
        timeScale: { borderVisible: false, timeVisible: intraday, secondsVisible: false, fixLeftEdge: true, fixRightEdge: true },
        crosshair: {
          mode: lc.CrosshairMode.Magnet,
          vertLine: { color: soft, labelBackgroundColor: ink },
          horzLine: { color: soft, labelBackgroundColor: ink },
        },
        localization: format ? { priceFormatter: format } : undefined,
        handleScale: { axisPressedMouseMove: false },
      });

      const time = (t: number) => (t + shift) as import("lightweight-charts").UTCTimestamp;
      let series;
      if (mode === "candles") {
        series = chart.addSeries(lc.CandlestickSeries, {
          upColor: up,
          downColor: down,
          wickUpColor: up,
          wickDownColor: down,
          borderVisible: false,
        });
        series.setData(bars.map((b) => ({ time: time(b.t), open: b.o, high: b.h, low: b.l, close: b.c })));
      } else if (mode === "line") {
        series = chart.addSeries(lc.LineSeries, { color, lineWidth: 2, pointMarkersVisible: bars.length < 40 });
        series.setData(bars.map((b) => ({ time: time(b.t), value: b.c })));
      } else {
        series = chart.addSeries(lc.AreaSeries, {
          lineColor: color,
          lineWidth: 2,
          topColor: alpha(color, 0.35),
          bottomColor: alpha(color, 0.02),
          priceLineVisible: false,
        });
        series.setData(bars.map((b) => ({ time: time(b.t), value: b.c })));
      }
      if (previousClose !== null) {
        series.createPriceLine({
          price: previousClose,
          color: soft,
          lineWidth: 1,
          lineStyle: lc.LineStyle.Dashed,
          axisLabelVisible: false,
          title: "prev",
        });
      }
      if (reference) {
        const mark = token(el, "--hue-poll", "#f5c542");
        series.createPriceLine({
          price: reference.price,
          color: mark,
          lineWidth: 2,
          lineStyle: lc.LineStyle.Dotted,
          axisLabelVisible: true,
          axisLabelColor: mark,
          axisLabelTextColor: "#111",
          title: reference.label,
        });
        const at = reference.t;
        if (at != null && at >= bars[0].t && at <= bars[bars.length - 1].t) {
          // The bar the rate was set on (the last one at or before it).
          const bar = [...bars].reverse().find((b) => b.t <= at) ?? bars[0];
          lc.createSeriesMarkers(series, [
            { time: time(bar.t), position: "aboveBar", color: mark, shape: "circle", text: reference.label },
          ]);
        }
      }
      if (showVolume && bars.some((b) => b.v)) {
        const vol = chart.addSeries(lc.HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
        vol.priceScale().applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
        vol.setData(
          bars.map((b, i) => ({
            time: time(b.t),
            value: b.v ?? 0,
            color: alpha(b.c >= (bars[i - 1]?.c ?? b.o) ? up : down, 0.35),
          })),
        );
      }
      chart.timeScale().fitContent();

      const byTime = new Map(bars.map((b) => [b.t + shift, b]));
      chart.subscribeCrosshairMove((param) => {
        const t = typeof param.time === "number" ? param.time : null;
        hoverRef.current?.(t !== null ? (byTime.get(t) ?? null) : null);
      });

      cleanup = () => chart.remove();
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, [bars, mode, previousClose, showVolume, intraday, hue, trend, format, reference]);

  return <div ref={ref} style={{ height }} className="w-full" />;
}
