"use client";

import { useEffect, useState } from "react";
import type { OddsMarket, RatesPanel } from "@/lib/types";
import { policyMarket } from "@/lib/odds-pick";

// One thin row under Market Pulse's region tabs: what money costs and which
// way foreign money is moving. RBI repo and Fed funds with their next
// decision and what the prediction markets expect of it, the US 10-year,
// and FII/DII net buying. A part that didn't arrive is simply left out.

const TZ = "Asia/Kolkata";
const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: TZ });
const crore = (n: number) => `${n >= 0 ? "+" : "−"}₹${Math.abs(Math.round(n)).toLocaleString("en-IN")} cr`;

function Expect({ m }: { m?: OddsMarket }) {
  if (!m) return null;
  const name = m.lead.name === "Yes" ? "yes" : m.lead.name.replace(/^Fed maintains rate$/i, "No change").toLowerCase();
  return (
    <span className="block font-mono text-[10px] mt-0.5" style={{ color: "var(--hue-poll)" }} title={`${m.title} · ${m.source}`}>
      market: {name} {Math.round(m.lead.prob)}%{m.vol < 50_000 ? " (thin market)" : ""}
    </span>
  );
}

function Cell({ label, value, children }: { label: string; value: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="min-w-0 pr-3 py-3 lg:px-4 lg:first:pl-0 lg:border-l hairline lg:first:border-l-0">
      <div className="font-label text-[9px] text-ink-soft">{label}</div>
      <div className="font-display font-bold text-[1.35rem] leading-none tabular-nums mt-1">{value}</div>
      <div className="font-mono text-[10px] text-ink-soft mt-1 leading-snug">{children}</div>
    </div>
  );
}

export default function RatesRow({ markets = [] }: { markets?: OddsMarket[] }) {
  const [rates, setRates] = useState<RatesPanel | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/rates", { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<RatesPanel>) : null))
      .then((d) => d && setRates(d))
      .catch(() => {});
    return () => controller.abort();
  }, []);
  if (!rates || (!rates.repo && !rates.fed && !rates.us10y && !rates.flows)) return null;
  const { repo, fed, us10y, flows } = rates;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 border-y hairline mt-5" data-reveal>
      {repo && (
        <Cell label="RBI repo rate" value={`${repo.rate.toFixed(2)}%`}>
          {repo.next ? `Next decision ${day(repo.next)}` : "Next decision not announced"}
          <Expect m={policyMarket(markets, "rbi", repo.next)} />
        </Cell>
      )}
      {fed && (
        <Cell label="Fed funds target" value={`${fed.lower.toFixed(2)}–${fed.upper.toFixed(2)}%`}>
          {fed.move ? `${fed.move === "cut" ? "Cut" : "Raised"} ${day(fed.since)}` : `Held since ${day(fed.since)}`}
          {fed.next ? ` · next ${day(fed.next)}` : ""}
          <Expect m={policyMarket(markets, "fed", fed.next)} />
        </Cell>
      )}
      {us10y && (
        <Cell label="US 10-year yield" value={`${us10y.yield.toFixed(2)}%`}>
          {us10y.change != null && Math.abs(us10y.change) >= 0.01 ? (
            <span className={us10y.change > 0 ? "text-down" : "text-up"}>
              {us10y.change > 0 ? "▲" : "▼"} {Math.abs(us10y.change).toFixed(2)} pts today
            </span>
          ) : (
            "Flat today"
          )}
          <span className="block mt-0.5">Higher yields pull money out of India</span>
        </Cell>
      )}
      {flows && (
        <Cell
          label={`Foreign money · ${day(flows.date)}`}
          value={<span className={flows.fii >= 0 ? "text-up" : "text-down"}>{crore(flows.fii)}</span>}
        >
          FIIs net; Indian funds (DIIs) {crore(flows.dii)}
          {flows.month && (
            <span className="block mt-0.5">
              {new Date(`${flows.date}T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: TZ })} so far ({flows.month.days} days): FII {crore(flows.month.fii)}
            </span>
          )}
        </Cell>
      )}
    </div>
  );
}
