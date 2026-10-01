"use client";

import { useEffect, useMemo, useState } from "react";
import type { IpoDetail, IpoEntry, IpoStage, PriceBar } from "@/lib/types";
import Sheet from "@/components/extras/Sheet";
import PriceChart from "./PriceChart";
import { sortIpos } from "@/lib/ipo-order";
import { ipoDriver, ipoMood, type IpoMood } from "@/lib/ipo-mood";

// IPO watch: every live mainboard IPO as one slim row — name and size, a
// three-stop track (opens → closes → lists) filled up to today, and the GMP
// as a coloured pill (red under 20%, orange 20–30%, green 30%+). A row opens
// the whole story: subscription by category, the GMP trend, every date, the
// issue's details and its documents.

const STAGE: Record<IpoStage, string> = {
  upcoming: "Upcoming",
  open: "Open",
  closed: "Closed",
  listing: "Lists today",
  listed: "Listed",
};

function day(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

function todayIso(): string {
  return new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

/** GMP colour: red under 20%, orange 20–30%, green 30% and up. */
function gmpTone(pct: number | null): { bg: string; fg: string } {
  if (pct === null) return { bg: "var(--card-bg)", fg: "var(--ink-soft)" };
  if (pct >= 30) return { bg: "var(--up)", fg: "var(--paper)" };
  if (pct >= 20) return { bg: "#f59e0b", fg: "#1a1206" };
  return { bg: "var(--down)", fg: "var(--paper)" };
}

function GmpPill({ ipo, large = false }: { ipo: Pick<IpoEntry, "gmp" | "gmpPct">; large?: boolean }) {
  const tone = gmpTone(ipo.gmpPct);
  return (
    <span
      className={`inline-flex items-baseline gap-1 rounded-full font-mono font-semibold tabular-nums whitespace-nowrap ${
        large ? "px-3.5 py-1.5 text-[15px]" : "px-2.5 py-1 text-[12px]"
      }`}
      style={{ background: tone.bg, color: tone.fg }}
      title="Grey market premium — unofficial"
    >
      {ipo.gmpPct === null ? (
        "GMP —"
      ) : (
        <>
          {ipo.gmpPct >= 0 ? "+" : ""}
          {ipo.gmpPct.toFixed(1)}%
          <span className="opacity-75 font-normal">₹{ipo.gmp}</span>
        </>
      )}
    </span>
  );
}

function size(cr: number | null): string {
  if (cr === null) return "";
  return cr >= 1000 ? `₹${(cr / 1000).toFixed(cr >= 10_000 ? 0 : 1)}k Cr` : `₹${Math.round(cr)} Cr`;
}

/** Opens → closes → lists, filled up to today. */
function Track({ ipo }: { ipo: IpoEntry }) {
  const today = todayIso();
  const stops = [
    { label: "Opens", date: ipo.open },
    { label: "Closes", date: ipo.close },
    { label: "Lists", date: ipo.listing, est: ipo.listingEstimated },
  ];
  // Progress: each leg is a third of the track, filled by elapsed days.
  const legs = [
    [ipo.open, ipo.close],
    [ipo.close, ipo.listing],
  ] as const;
  let fill = 0;
  legs.forEach(([a, b], i) => {
    if (!a || !b) return;
    const t = Date.parse(today);
    const f = Math.min(1, Math.max(0, (t - Date.parse(a)) / Math.max(1, Date.parse(b) - Date.parse(a))));
    if (today >= a) fill = (i + f) / 2;
  });
  return (
    <div className="min-w-0">
      <div className="relative h-1.5 mx-1.5 mt-1 rounded-full bg-[color:var(--rule)]">
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${fill * 100}%`, background: "var(--section-hue, var(--accent))" }}
        />
        {stops.map((s, i) => {
          const reached = s.date !== null && today >= s.date;
          return (
            <span
              key={s.label}
              className="absolute top-1/2 w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
              style={{
                left: `${i * 50}%`,
                background: reached ? "var(--section-hue, var(--accent))" : "var(--paper)",
                borderColor: reached ? "var(--section-hue, var(--accent))" : "var(--ink-faint)",
              }}
            />
          );
        })}
      </div>
      <div className="grid grid-cols-3 mt-2 font-mono text-[10px] text-ink-soft">
        {stops.map((s, i) => (
          <span key={s.label} className={i === 0 ? "text-left" : i === 1 ? "text-center" : "text-right"}>
            <span className="text-ink-faint">{s.label} </span>
            {day(s.date)}
            {s.est ? "*" : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The bidding's mood: a word in its colour and a small thermometer. */
function MoodChip({ mood }: { mood: IpoMood }) {
  return (
    <span className="inline-flex items-center gap-1.5 align-middle" title={mood.line}>
      <span className="relative inline-block w-8 h-1.5 rounded-full bg-[color:var(--rule)] overflow-hidden">
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(8, mood.heat * 100)}%`, background: mood.color }} />
      </span>
      <span className="font-semibold" style={{ color: mood.label === "Warm" ? undefined : mood.color }}>
        {mood.label}
      </span>
    </span>
  );
}

// ---- the detail sheet ----------------------------------------------------------

function IpoSheet({ ipo, onClose }: { ipo: IpoEntry; onClose: () => void }) {
  const [detail, setDetail] = useState<IpoDetail | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/ipos/${ipo.id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: IpoDetail) => !cancelled && setDetail(d))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [ipo.id]);

  const d = detail ?? { ...ipo, subscriptionByCategory: [], subscriptionUpdated: null, facts: [], documents: [], gmpHistory: [], listingPerformance: null };
  const priceHigh = d.priceHigh;
  const estListing = priceHigh !== null && d.gmp !== null ? priceHigh + d.gmp : null;
  const total = d.subscriptionByCategory.find((s) => s.category === "Total")?.times;
  const maxTimes = Math.max(1, ...d.subscriptionByCategory.map((s) => s.times));
  const gmpBars: PriceBar[] = useMemo(
    () => d.gmpHistory.map((p) => ({ t: Date.parse(`${p.date}T00:00:00Z`) / 1000, o: p.gmp, h: p.gmp, l: p.gmp, c: p.gmp })),
    [d.gmpHistory],
  );
  const lp = d.listingPerformance;
  const mood = ipoMood(d, todayIso(), total);

  const headline: Array<[string, string]> = [
    ["Issue size", size(d.sizeCr) || "—"],
    ["Price band", d.priceLow !== null && priceHigh !== null ? (d.priceLow === priceHigh ? `₹${priceHigh}` : `₹${d.priceLow}–${priceHigh}`) : "—"],
    ["GMP", d.gmp !== null ? `₹${d.gmp} (${d.gmpPct?.toFixed(1)}%)` : "—"],
    ["Est. listing", estListing !== null ? `₹${estListing}` : "—"],
    ["Subscribed", total !== undefined ? `${total.toFixed(2)}×` : (d.subscription ?? "—")],
  ];
  const dates: Array<[string, string | null, boolean?]> = [
    ["Opens", d.open],
    ["Closes", d.close],
    ["Allotment", d.allotment, d.listingEstimated],
    ["Listing", d.listing, d.listingEstimated],
  ];

  return (
    <Sheet title={d.name} kicker={`IPO · ${STAGE[d.stage]}${d.symbol ? ` · NSE: ${d.symbol}` : ""}`} onClose={onClose} width={880}>
      {/* The five numbers that matter. */}
      <dl className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {headline.map(([label, value]) => (
          <div key={label} className="rounded-xl border hairline p-3">
            <dt className="font-label text-[9px] text-ink-soft">{label}</dt>
            <dd className="font-display font-bold text-[1.35rem] leading-tight mt-1 tabular-nums">
              {label === "GMP" && d.gmp !== null ? <GmpPill ipo={d} large /> : value}
            </dd>
          </div>
        ))}
      </dl>

      {/* Every date, as a stepper. */}
      <ol className="grid grid-cols-4 mt-6">
        {dates.map(([label, date, est], i) => {
          const reached = date !== null && todayIso() >= date;
          return (
            <li key={label} className="relative">
              <span
                className="absolute top-[7px] left-0 right-0 h-0.5"
                style={{ background: i === 0 ? "transparent" : "var(--rule)", right: "50%" }}
                aria-hidden
              />
              <span className="absolute top-[7px] left-1/2 right-0 h-0.5" style={{ background: i === 3 ? "transparent" : "var(--rule)" }} aria-hidden />
              <span
                className="relative mx-auto block w-4 h-4 rounded-full border-2"
                style={{
                  background: reached ? "var(--section-hue)" : "var(--surface)",
                  borderColor: reached ? "var(--section-hue)" : "var(--ink-faint)",
                }}
              />
              <div className="text-center mt-2">
                <div className="font-label text-[9px] text-ink-soft">{label}</div>
                <div className="font-mono text-[12px] mt-0.5">
                  {day(date)}
                  {est ? <span className="text-ink-faint">*</span> : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="grid md:grid-cols-2 gap-6 mt-8">
        {/* Subscription by category. */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="font-label text-[10px] text-ink-soft">Subscription</h3>
            <span className="font-mono text-[10px] text-ink-faint">{detail ? "NSE, live during bidding" : ""}</span>
          </div>
          {!detail && !failed ? (
            <div className="space-y-2 animate-pulse">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-5 rounded bg-card-bg" />
              ))}
            </div>
          ) : d.subscriptionByCategory.length === 0 ? (
            <p className="font-sans text-[13px] text-ink-soft">
              {d.stage === "upcoming" ? "Bidding hasn’t started yet." : "NSE hasn’t published category figures."}
            </p>
          ) : (
            <>
            {mood && (
              <div className="rounded-xl border hairline p-3 mb-4" style={{ borderColor: `color-mix(in srgb, ${mood.color} 55%, transparent)` }}>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-display font-bold text-[1.25rem] leading-none" style={{ color: mood.label === "Warm" ? undefined : mood.color }}>
                    {mood.label}
                  </span>
                  {mood.when && <span className="font-mono text-[10px] text-ink-soft">{mood.when}</span>}
                </div>
                <p className="font-sans text-[12.5px] text-ink-soft mt-1.5 leading-snug">
                  {mood.line} {ipoDriver(d.subscriptionByCategory)}
                </p>
              </div>
            )}
            <ul className="space-y-2.5">
              {d.subscriptionByCategory.map((s) => (
                <li key={s.category} className="grid grid-cols-[6.5rem_minmax(0,1fr)_3.8rem] items-center gap-2 text-[12px]">
                  <span className={`truncate ${s.category === "Total" ? "font-semibold" : "text-ink-soft"}`}>{s.category}</span>
                  <span className="h-2 rounded-full bg-card-bg overflow-hidden">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.max(2, (s.times / maxTimes) * 100)}%`,
                        background: s.times >= 1 ? "var(--section-hue)" : "var(--ink-faint)",
                      }}
                    />
                  </span>
                  <span className="font-mono text-right tabular-nums">{s.times.toFixed(2)}×</span>
                </li>
              ))}
            </ul>
            </>
          )}
        </section>

        {/* GMP trend (recorded once a day). */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="font-label text-[10px] text-ink-soft">GMP trend</h3>
            <span className="font-mono text-[10px] text-ink-faint">unofficial · ₹ per share</span>
          </div>
          {gmpBars.length >= 2 ? (
            <div className="rounded-xl border hairline bg-card-bg p-1.5">
              <PriceChart bars={gmpBars} mode="line" height={170} intraday={false} format={(p) => `₹${p.toFixed(0)}`} />
            </div>
          ) : (
            <p className="font-sans text-[13px] text-ink-soft">
              {d.gmp !== null
                ? `₹${d.gmp} today. The trend fills in as the paper records it each day.`
                : "No grey-market quote yet."}
            </p>
          )}
        </section>
      </div>

      {/* Listing day: how it actually opened. */}
      {lp && priceHigh !== null && (
        <section className="mt-8 rounded-2xl p-4" style={{ background: "color-mix(in srgb, var(--section-hue) 10%, var(--card-bg))" }}>
          <h3 className="font-label text-[10px] text-ink-soft mb-3">On the exchange</h3>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ["Listed at", lp.open],
              ["Day-one close", lp.close],
              ["Latest", lp.last],
            ].map(([label, v]) => (
              <div key={label as string}>
                <dt className="font-label text-[9px] text-ink-soft">{label}</dt>
                <dd className="font-mono text-[15px] tabular-nums">
                  {typeof v === "number" ? `₹${v.toFixed(1)}` : "—"}
                  {typeof v === "number" && (
                    <span className={`ml-1.5 text-[11px] ${v >= priceHigh ? "text-up" : "text-down"}`}>
                      {v >= priceHigh ? "+" : ""}
                      {(((v - priceHigh) / priceHigh) * 100).toFixed(1)}%
                    </span>
                  )}
                </dd>
              </div>
            ))}
            <div>
              <dt className="font-label text-[9px] text-ink-soft">vs GMP estimate</dt>
              <dd className="font-mono text-[15px] tabular-nums">
                {estListing !== null ? `${lp.open >= estListing ? "beat" : "missed"} by ₹${Math.abs(lp.open - estListing).toFixed(1)}` : "—"}
              </dd>
            </div>
          </dl>
        </section>
      )}

      {/* The issue in detail, and its papers. */}
      {d.facts.length > 0 && (
        <dl className="grid sm:grid-cols-2 gap-x-8 mt-8 border-t hairline">
          {d.facts.map((f) => (
            <div key={f.label} className="flex justify-between gap-4 py-2 border-b hairline text-[12px]">
              <dt className="text-ink-soft shrink-0">{f.label}</dt>
              <dd className="text-right line-clamp-2">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="flex flex-wrap items-center gap-2 mt-6">
        {d.documents.map((doc) => (
          <a key={doc.url} href={doc.url} target="_blank" rel="noopener noreferrer" className="chip h-8 text-[12px]">
            {doc.label} ↗
          </a>
        ))}
        {d.gmpUrl && (
          <a href={d.gmpUrl} target="_blank" rel="noopener noreferrer" className="chip h-8 text-[12px]">
            GMP source ↗
          </a>
        )}
      </div>
      <p className="font-sans text-[11px] text-ink-faint mt-5 leading-relaxed">
        * Worked out from SEBI&rsquo;s T+3 timeline until the exchange announces it. GMP is an unofficial grey-market
        quote and often misses the actual listing. Subscription and issue details are from NSE.
      </p>
    </Sheet>
  );
}

// ---- the strip -----------------------------------------------------------------

// The order lives in lib/ipo-order.ts: open, listing today, waiting to
// list, upcoming, just listed, each by its next date.
const SHOWN = 5;

export default function IpoWatch() {
  const [ipos, setIpos] = useState<IpoEntry[] | null>(null);
  const [open, setOpen] = useState<IpoEntry | null>(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/ipos")
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { ipos?: IpoEntry[] } | null) => !cancelled && setIpos(d?.ipos ?? []))
        .catch(() => !cancelled && setIpos([]));
    load();
    const id = window.setInterval(load, 15 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  if (!ipos || ipos.length === 0) return null;
  const sorted = sortIpos(ipos, todayIso());
  const visible = all ? sorted : sorted.slice(0, SHOWN);

  return (
    <div className="mt-12">
      <div className="flex items-baseline justify-between gap-4 mb-3">
        <h3 className="font-display font-bold text-[1.8rem] leading-none">IPO watch</h3>
        <span className="font-mono text-[10px] text-ink-soft text-right">
          Mainboard · GMP{" "}
          <span className="inline-block w-2 h-2 rounded-full align-middle" style={{ background: "var(--down)" }} /> &lt;20%{" "}
          <span className="inline-block w-2 h-2 rounded-full align-middle bg-[#f59e0b]" /> 20–30%{" "}
          <span className="inline-block w-2 h-2 rounded-full align-middle" style={{ background: "var(--up)" }} /> 30%+
        </span>
      </div>
      <ul className="module !p-0 overflow-hidden" data-reveal>
        {visible.map((ipo) => (
          <li key={ipo.id} className="border-t hairline first:border-t-0">
            <button
              type="button"
              onClick={() => setOpen(ipo)}
              className="w-full text-left grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_auto] items-center gap-x-6 gap-y-3 px-4 py-3.5 transition-colors hover:bg-[color:var(--card-bg)] focus-visible:bg-[color:var(--card-bg)]"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 font-label text-[8px] ${ipo.stage === "open" || ipo.stage === "listing" ? "" : "text-ink-soft border hairline"}`}
                    style={ipo.stage === "open" || ipo.stage === "listing" ? { background: "var(--section-hue)", color: "var(--paper)" } : undefined}
                  >
                    {STAGE[ipo.stage]}
                  </span>
                  <span className="font-sans font-semibold text-[14px] truncate">{ipo.name}</span>
                </span>
                <span className="block font-mono text-[11px] text-ink-soft mt-1">
                  {size(ipo.sizeCr) || "size tbc"}
                  {(() => {
                    const mood = ipo.stage === "open" || ipo.stage === "closed" ? ipoMood(ipo, todayIso()) : null;
                    if (mood)
                      return (
                        <>
                          {" · "}
                          {ipo.subscription} subscribed{mood.when && ipo.stage === "open" ? ` (${mood.when.toLowerCase()})` : ""} · <MoodChip mood={mood} />
                        </>
                      );
                    return ipo.subscription && ipo.stage !== "upcoming" ? ` · ${ipo.subscription} subscribed` : "";
                  })()}
                </span>
              </span>
              <span className="col-span-2 row-start-2 md:col-span-1 md:row-start-1 md:col-start-2">
                <Track ipo={ipo} />
              </span>
              <span className="row-start-1 col-start-2 md:col-start-3 justify-self-end">
                <GmpPill ipo={ipo} />
              </span>
            </button>
          </li>
        ))}
      </ul>
      {sorted.length > SHOWN && (
        <button type="button" onClick={() => setAll((v) => !v)} className="font-sans text-[12px] font-semibold text-ink-soft hover:text-ink mt-3">
          {all ? "Show fewer" : `Show all ${sorted.length} IPOs`}
        </button>
      )}
      {open && <IpoSheet ipo={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
