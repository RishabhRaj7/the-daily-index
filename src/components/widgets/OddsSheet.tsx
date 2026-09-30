"use client";

import { useEffect, useState } from "react";
import type { OddsMarket, PriceBar } from "@/lib/types";
import PriceChart from "./PriceChart";
import Sheet from "@/components/extras/Sheet";
import { compactMoney, SUBJECT_LABEL } from "@/lib/odds-pick";

// The whole of one market, readable here without a VPN: every contender's
// chance with where it stood a day ago, the money behind it, when it
// settles, how it is decided, and the other site's price. The link out to
// the exchange stays small: in India it needs a VPN.

const date = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

export default function OddsSheet({ market: m, why, onClose }: { market: OddsMarket; why?: string; onClose: () => void }) {
  const max = Math.max(...m.outcomes.map((o) => o.prob), 1);
  // A week of the favourite's chance (Polymarket's own history; the
  // paper's hourly snapshots for Kalshi).
  const [history, setHistory] = useState<PriceBar[] | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/odds/history?id=${encodeURIComponent(m.id)}${m.token ? `&token=${m.token}` : ""}`, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ points: Array<[number, number]> }>) : null))
      .then((d) => setHistory((d?.points ?? []).map(([t, p]) => ({ t: Math.floor(t / 1000), o: p, h: p, l: p, c: p }))))
      .catch(() => setHistory([]));
    return () => controller.abort();
  }, [m.id, m.token]);
  return (
    <Sheet title={m.title} kicker={`Straw Poll · ${SUBJECT_LABEL[m.subject]}${why ? ` · ${why}` : ""}`} onClose={onClose} width={720}>
      <ul className="space-y-3" style={{ ["--section-hue" as string]: "var(--hue-poll)" }}>
        {m.outcomes.map((o, i) => {
          const d = o.prev != null ? o.prob - o.prev : null;
          return (
            <li key={o.name} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_4.5rem] sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_5.5rem] items-center gap-3">
              <span className={`truncate text-[14px] ${i === 0 ? "font-semibold" : "text-ink-soft"}`}>{o.name === "Yes" ? "Yes" : o.name}</span>
              <span className="relative h-2.5 rounded-full bg-[color:var(--rule)] overflow-hidden">
                <span
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${(o.prob / max) * 100}%`, background: i === 0 ? "var(--hue-poll)" : "var(--ink-faint)", ["--bar-i" as string]: i }}
                />
                {o.prev != null && (
                  <span className="absolute inset-y-[-2px] w-px bg-ink" style={{ left: `${(o.prev / max) * 100}%` }} title={`A day ago: ${o.prev}%`} />
                )}
              </span>
              <span className="text-right">
                <span className="font-display font-bold text-[1.35rem] leading-none tabular-nums">{Math.round(o.prob)}%</span>
                {d != null && Math.abs(d) >= 1 && (
                  <span className={`block font-mono text-[10px] ${d > 0 ? "text-up" : "text-down"}`}>
                    {d > 0 ? "▲" : "▼"} {Math.abs(Math.round(d))}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="font-mono text-[10px] text-ink-faint mt-2">The thin line marks where each stood a day ago.</p>

      {history && history.length >= 6 && (
        <div className="mt-5">
          <div className="font-label text-[9px] text-ink-soft mb-1">
            {m.lead.name === "Yes" ? "Yes" : m.lead.name}, the past week
          </div>
          <div className="rounded-xl border hairline bg-card-bg p-2" style={{ ["--section-hue" as string]: "var(--hue-poll)" }}>
            <PriceChart bars={history} mode="line" height={150} intraday format={(p) => `${p.toFixed(0)}%`} />
          </div>
        </div>
      )}

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 mt-6">
        {[
          ["Traded today", `$${compactMoney(m.vol24)}`],
          ["Traded in all", `$${compactMoney(m.vol)}`],
          ["Settles", m.closes ? date(m.closes) : "—"],
          ["Price gap", m.spread != null ? `${m.spread} pts` : "—"],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="font-label text-[9px] text-ink-soft">{k}</dt>
            <dd className="font-mono text-[14px] tabular-nums mt-0.5">{v}</dd>
          </div>
        ))}
      </dl>

      {m.also && m.also.length > 0 && (
        <p className="font-sans text-[13px] mt-5">
          {m.also.map((a) => (
            <span key={a.source}>
              {a.source} has {a.name === "Yes" ? "yes" : a.name} at <strong>{Math.round(a.prob)}%</strong>.{" "}
            </span>
          ))}
        </p>
      )}
      {m.rules && (
        <div className="mt-5">
          <div className="font-label text-[9px] text-ink-soft mb-1">How it&rsquo;s decided</div>
          <p className="font-sans text-[13px] text-ink-soft leading-relaxed">{m.rules}{m.rules.length >= 400 ? "…" : ""}</p>
        </div>
      )}
      <p className="font-mono text-[10px] text-ink-faint mt-6 leading-relaxed">
        Prices are what traders pay for a share that pays $1 if it happens, read as a chance. The paper reads them; it takes no bets.{" "}
        <a href={m.url} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-ink">
          {m.source} ↗
        </a>{" "}
        (needs a VPN in India)
      </p>
    </Sheet>
  );
}
