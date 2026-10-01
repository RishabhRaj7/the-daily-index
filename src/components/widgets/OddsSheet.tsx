"use client";

import { useEffect, useState } from "react";
import type { OddsMarket } from "@/lib/types";
import Sheet from "@/components/extras/Sheet";
import { compactMoney, ladderLine, SUBJECT_LABEL, SUBJECT_SECTION } from "@/lib/odds-pick";
import { SECTION_META } from "@/lib/sections";
import OddsChart, { pinsFor, SERIES_COLORS, type ChartSeries } from "@/components/odds/OddsChart";
import { HitLadder, Move } from "@/components/odds/OddsCard";
import { useStar } from "@/components/odds/odds-context";

// The whole of one market, readable here without a VPN:
//   the favourite's chance and how it moved today and this week
//   every contender's line over a day, a week, a month or all time, with
//     numbered pins where the week's news lines up with a jump
//   why it moved: one sentence when the move is big (AI, grounded only in
//     the headlines), then the dated headlines themselves
//   the field with where each stood a day ago, the money, when it
//     settles, the other site's price, and how it's decided
// A star keeps it on the reader's watchlist. The link out to the exchange
// stays small: in India it needs a VPN.

type Range = "1d" | "1w" | "1m" | "all";
interface WhyItem {
  title: string;
  source: string;
  url: string;
  at: string;
}

const date = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const ago = (iso: string) => {
  const h = (Date.now() - Date.parse(iso)) / 3_600_000;
  return h < 1 ? `${Math.max(1, Math.round(h * 60))}m ago` : h < 24 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)}d ago`;
};

export default function OddsSheet({ market: m, why, watched = false, onClose }: { market: OddsMarket; why?: string; watched?: boolean; onClose: () => void }) {
  const hue = SECTION_META[SUBJECT_SECTION[m.subject] ?? "straw-poll"]?.hue ?? "var(--hue-poll)";
  const [range, setRange] = useState<Range>("1w");
  // Each range's lines, kept by range, so switching back is instant and a new one shows as loading.
  const [byRange, setByRange] = useState<Partial<Record<Range, ChartSeries[]>>>({});
  const series = byRange[range] ?? null;
  const [news, setNews] = useState<{ items: WhyItem[]; why: string | null } | null>(null);
  const [starred, toggleStar] = useStar(m);

  // The lines: the leader and up to three more (a ladder: the closest calls).
  const lines = (m.hit ? [...m.outcomes].sort((a, b) => Math.abs(a.prob - 50) - Math.abs(b.prob - 50)) : m.outcomes)
    .filter((o) => (m.source === "Polymarket" ? o.token : o.ticker))
    .slice(0, m.binary ? 1 : 4);
  const refs = lines.map((o) => `${o.name}~${m.source === "Polymarket" ? o.token : o.ticker}`).join("|");
  useEffect(() => {
    const controller = new AbortController();
    const q = new URLSearchParams({ id: m.id, range, o: refs, ...(m.series ? { series: m.series } : {}) });
    fetch(`/api/odds/history?${q}`, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ series: ChartSeries[] }>) : { series: [] }))
      .then((d) => setByRange((had) => ({ ...had, [range]: d.series })))
      .catch((e) => {
        if (!controller.signal.aborted) setByRange((had) => ({ ...had, [range]: [] }));
        return e;
      });
    return () => controller.abort();
  }, [m.id, m.series, range, refs]);

  // The week's news on the question; a sentence on why when it moved a lot.
  const bigMove = Math.abs(m.lead.move ?? 0) >= 5 ? (m.lead.move ?? 0) : Math.abs(m.lead.week ?? 0) >= 8 ? (m.lead.week ?? 0) : 0;
  useEffect(() => {
    const controller = new AbortController();
    const q = new URLSearchParams({ id: m.id, q: m.title, lead: m.hit ? "" : m.lead.name, move: String(bigMove), days: Math.abs(m.lead.move ?? 0) >= 5 ? "2" : "7" });
    fetch(`/api/odds/why?${q}`, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ items: WhyItem[]; why: string | null }>) : { items: [], why: null }))
      .then(setNews)
      .catch(() => setNews({ items: [], why: null }));
    return () => controller.abort();
  }, [m.id, m.title, bigMove, m.lead.move]);

  const pins = series && news ? pinsFor(series[0], news.items) : [];
  const max = Math.max(...m.outcomes.map((o) => o.prob), 1);
  const leader = m.lead.name === "Yes" ? "Yes" : m.lead.name;

  return (
    <Sheet title={m.title} kicker={`Straw Poll · ${SUBJECT_LABEL[m.subject]}${why ? ` · ${why}` : ""}`} onClose={onClose} width={820} hue={hue}>
      {/* The reading. */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        {m.hit ? (
          <p className="font-headline text-[1.25rem] leading-snug max-w-[34rem]">{ladderLine(m)}</p>
        ) : (
          <div className="flex items-end gap-4">
            <span className="font-display font-extrabold text-[3.4rem] leading-[0.85] tabular-nums" style={{ color: "var(--section-hue)" }}>
              {Math.round(m.lead.prob)}%
            </span>
            <span className="pb-1">
              <span className="block font-sans font-semibold text-[16px] leading-tight">{leader}</span>
              <span className="flex gap-3 mt-1 font-mono text-[10.5px] text-ink-soft">
                {m.lead.move != null && Math.abs(m.lead.move) >= 1 ? (
                  <span>
                    <Move v={m.lead.move} /> today
                  </span>
                ) : (
                  <span>flat today</span>
                )}
                {m.lead.week != null && Math.abs(m.lead.week) >= 1 && (
                  <span>
                    <Move v={m.lead.week} /> this week
                  </span>
                )}
              </span>
            </span>
          </div>
        )}
        {watched && !starred ? (
          <span className="chip h-8 text-[12px] gap-1.5" title="One of your watchlist's questions (edit it under Straw Poll)" style={{ borderColor: "var(--section-hue)", color: "var(--section-hue)" }}>
            ★ On your watchlist
          </span>
        ) : (
          <button
            type="button"
            onClick={toggleStar}
            aria-pressed={starred}
            className="chip h-8 text-[12px] gap-1.5"
            style={starred ? { background: "var(--section-hue)", borderColor: "var(--section-hue)", color: "var(--paper)" } : undefined}
          >
            {starred ? "★ Starred" : "☆ Watch this"}
          </button>
        )}
      </div>

      {/* Every contender over time. */}
      <div className="mt-6">
        <div className="flex items-center justify-between gap-3 mb-2">
          <span className="font-label text-[9px] text-ink-soft">{m.binary ? "The chance" : m.hit ? "The closest calls" : "The front-runners"} over time</span>
          <span className="flex gap-1">
            {(["1d", "1w", "1m", "all"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                aria-pressed={range === r}
                className="font-mono text-[10.5px] rounded-full px-2.5 py-1 border hairline"
                style={range === r ? { background: "var(--ink)", color: "var(--paper)", borderColor: "var(--ink)" } : undefined}
              >
                {r === "all" ? "All" : r.toUpperCase()}
              </button>
            ))}
          </span>
        </div>
        <div className="rounded-2xl border hairline p-3 min-h-[250px]">
          {series === null ? (
            <div className="h-[240px] rounded-xl bg-card-bg animate-pulse" />
          ) : series.length === 0 ? (
            <p className="h-[240px] grid place-items-center font-sans text-[13px] text-ink-soft">No price history for this range yet.</p>
          ) : (
            <OddsChart series={series} pins={pins} range={range} height={240} />
          )}
        </div>
      </div>

      {/* Why it moved. */}
      <div className="mt-6">
        <div className="font-label text-[9px] text-ink-soft mb-2">{bigMove ? "Why it moved" : "In the news"}</div>
        {news === null ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-4 w-3/4 rounded bg-card-bg" />
            <div className="h-4 w-2/3 rounded bg-card-bg" />
          </div>
        ) : (
          <>
            {news.why && (
              <p className="font-headline text-[1.1rem] leading-snug mb-3 border-l-2 pl-3" style={{ borderColor: "var(--section-hue)" }}>
                {news.why}
              </p>
            )}
            {news.items.length === 0 ? (
              <p className="font-sans text-[13px] text-ink-soft">No news this week on this question.</p>
            ) : (
              <ul className="divide-y hairline">
                {[...news.items.filter((n) => pins.some((p) => p.title === n.title)), ...news.items.filter((n) => !pins.some((p) => p.title === n.title))].slice(0, 5).map((n) => {
                  const pin = pins.find((p) => p.title === n.title);
                  return (
                    <li key={n.url} className="py-2 grid grid-cols-[1.4rem_minmax(0,1fr)] gap-2 items-start">
                      <span className="pt-0.5">
                        {pin && (
                          <span className="grid place-items-center w-5 h-5 rounded-full border border-[color:var(--ink)] font-mono text-[10px] font-bold">{pin.n}</span>
                        )}
                      </span>
                      <a href={n.url} target="_blank" rel="noopener noreferrer" className="group min-w-0">
                        <span className="block font-sans text-[13.5px] leading-snug group-hover:underline decoration-dotted underline-offset-2">{n.title}</span>
                        <span className="block font-mono text-[10px] text-ink-faint mt-0.5">
                          {n.source} · {ago(n.at)}
                          {pin && (
                            <span className={pin.move > 0 ? "text-up" : "text-down"}>
                              {" "}
                              · {leader} {pin.move > 0 ? "▲" : "▼"} {Math.abs(Math.round(pin.move))} pts after
                            </span>
                          )}
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>

      {/* The field. */}
      <div className="mt-6">
        <div className="font-label text-[9px] text-ink-soft mb-2">{m.hit ? "Every level" : "The field"}</div>
        {m.hit ? (
          <HitLadder m={m} rows={10} size="lg" />
        ) : (
          <>
            <ul className="space-y-2.5">
              {m.outcomes.map((o, i) => {
                const d = o.prev != null ? o.prob - o.prev : null;
                return (
                  <li key={o.name} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_4.5rem] sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_5.5rem] items-center gap-3">
                    <span className={`flex items-center gap-1.5 min-w-0 text-[14px] ${i === 0 ? "font-semibold" : "text-ink-soft"}`}>
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: SERIES_COLORS[i] ?? "var(--ink-faint)" }} />
                      <span className="truncate">{o.name}</span>
                    </span>
                    <span className="relative h-2.5 rounded-full bg-[color:var(--rule)] overflow-hidden">
                      <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(o.prob / max) * 100}%`, background: SERIES_COLORS[i] ?? "var(--ink-faint)" }} />
                      {o.prev != null && <span className="absolute inset-y-[-2px] w-px bg-ink" style={{ left: `${(o.prev / max) * 100}%` }} title={`A day ago: ${o.prev}%`} />}
                    </span>
                    <span className="text-right">
                      <span className="font-display font-bold text-[1.25rem] leading-none tabular-nums">{Math.round(o.prob)}%</span>
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
            {m.outcomes.some((o) => o.prev != null) && <p className="font-mono text-[10px] text-ink-faint mt-2">The thin line marks where each stood a day ago.</p>}
          </>
        )}
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 mt-6 border-t hairline pt-4">
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
        <details className="mt-5 group">
          <summary className="font-label text-[9px] text-ink-soft cursor-pointer">How it&rsquo;s decided</summary>
          <p className="font-sans text-[13px] text-ink-soft leading-relaxed mt-2">
            {m.rules}
            {m.rules.length >= 400 ? "…" : ""}
          </p>
        </details>
      )}
      <p className="font-mono text-[10px] text-ink-faint mt-6 leading-relaxed">
        Prices are what traders pay for a share that pays $1 if it happens, read as a chance. News from Google News; the paper links stories to jumps by
        their timing, which suggests a cause but doesn&rsquo;t prove one. The paper reads prices; it takes no bets.{" "}
        <a href={m.url} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-ink">
          {m.source} ↗
        </a>{" "}
        (needs a VPN in India)
      </p>
    </Sheet>
  );
}
