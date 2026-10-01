"use client";

import { useEffect, useState } from "react";
import type { FlowDay, OddsMarket, RatesPanel } from "@/lib/types";
import { policyMarket } from "@/lib/odds-pick";
import Sheet from "@/components/extras/Sheet";
import OddsSheet from "./OddsSheet";

// One thin row under Market Pulse's region tabs: what money costs and who
// is buying Indian shares. RBI repo and Fed funds with their next decision
// and what traders on the prediction markets expect of it (a tap opens
// that market), the US 10-year, and the day's FII and DII trade: what each
// bought, sold and the net (a tap opens the month so far). A part that
// didn't arrive is simply left out.

const TZ = "Asia/Kolkata";
const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: TZ });
const crore = (n: number) => `${n >= 0 ? "+" : "−"}₹${Math.abs(Math.round(n)).toLocaleString("en-IN")} cr`;

/**
 * The prediction market's view of the next decision, set apart from the
 * published figures: a dashed box with an ODDS tag in Straw Poll's colour,
 * so it never reads as data ("ODDS · 84% hike 1-25bps on 7 Oct"). A tap
 * opens the market.
 */
function Expect({ m, on }: { m?: OddsMarket; on: string | null }) {
  const [open, setOpen] = useState(false);
  if (!m) return null;
  const name = m.lead.name === "Yes" ? "yes" : m.lead.name.replace(/^Fed maintains rate$/i, "No change").toLowerCase();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 w-full text-left rounded-md border border-dashed px-1.5 py-1 flex items-baseline gap-1.5 min-w-0 hover:bg-card-bg"
        style={{ borderColor: "color-mix(in srgb, var(--hue-poll) 60%, transparent)" }}
        title={`A forecast, not data: what traders on ${m.source} expect. ${m.title}`}
      >
        <span className="font-label text-[7.5px] rounded px-1 py-[1px] shrink-0" style={{ background: "var(--hue-poll)", color: "var(--paper)" }}>
          Odds
        </span>
        <span className="font-mono text-[10px] truncate" style={{ color: "var(--hue-poll)" }}>
          {Math.round(m.lead.prob)}% {name}
          {on ? ` on ${day(on)}` : ""}
          {m.vol < 50_000 ? " · thin" : ""}
        </span>
      </button>
      {open && <OddsSheet market={m} why="The next decision" onClose={() => setOpen(false)} />}
    </>
  );
}

/** A published figure: the number, where it comes from, and its context. */
function Cell({ label, source, value, children }: { label: string; source: string; value: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="min-w-0 pr-3 py-3 lg:px-4 lg:first:pl-0 lg:border-l hairline lg:first:border-l-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-label text-[9px] text-ink-soft truncate">{label}</span>
        <span className="font-mono text-[8.5px] text-ink-faint shrink-0">{source}</span>
      </div>
      <div className="font-display font-bold text-[1.35rem] leading-none tabular-nums mt-1">{value}</div>
      <div className="font-mono text-[10px] text-ink-soft mt-1 leading-snug">{children}</div>
    </div>
  );
}

const fmt = (n: number) => `₹${Math.abs(Math.round(n)).toLocaleString("en-IN")} cr`;

/** Bought against sold, as one split bar: green the buying, red the selling. */
function Split({ d, max }: { d: FlowDay; max: number }) {
  const total = d.buy + d.sell;
  if (total <= 0) return null;
  return (
    <span className="flex h-1.5 rounded-full overflow-hidden bg-[color:var(--rule)]" style={{ width: `${Math.max(30, (total / max) * 100)}%` }}>
      <span className="h-full" style={{ width: `${(d.buy / total) * 100}%`, background: "var(--up)" }} />
      <span className="h-full flex-1" style={{ background: "var(--down)", opacity: 0.85 }} />
    </span>
  );
}

function FlowLine({ who, d, max }: { who: string; d: FlowDay; max: number }) {
  return (
    <span className="grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-x-2">
      <span className="font-label text-[9px] text-ink-soft">{who}</span>
      <span className={`font-display font-bold text-[1.05rem] leading-none tabular-nums ${d.net >= 0 ? "text-up" : "text-down"}`}>
        {d.net >= 0 ? "+" : "−"}
        {fmt(d.net)}
      </span>
      <span />
      <span className="mt-1">
        <Split d={d} max={max} />
      </span>
    </span>
  );
}

/** The day in full, and the month so far day by day. */
function FlowsSheet({ flows, onClose }: { flows: NonNullable<RatesPanel["flows"]>; onClose: () => void }) {
  const { fii, dii } = flows;
  const peak = Math.max(1, ...flows.days.flatMap((d) => [Math.abs(d.fii), Math.abs(d.dii)]));
  const both = fii.net + dii.net;
  const story =
    fii.net < 0 && dii.net > 0
      ? `Foreign investors sold ${fmt(fii.net)} more than they bought; Indian funds bought ${fmt(dii.net)} more than they sold${dii.net >= -fii.net ? ", taking up all of it" : ", taking up part of it"}.`
      : fii.net > 0 && dii.net < 0
        ? `Foreign investors were net buyers (${fmt(fii.net)}); Indian funds sold ${fmt(dii.net)} into them.`
        : fii.net >= 0 && dii.net >= 0
          ? `Both bought: foreign investors ${fmt(fii.net)} net, Indian funds ${fmt(dii.net)}.`
          : `Both sold: foreign investors ${fmt(fii.net)} net, Indian funds ${fmt(dii.net)}.`;
  return (
    <Sheet title="Who bought India" kicker={`Market Pulse · cash market · ${day(flows.date)}`} onClose={onClose} width={680} hue="var(--hue-markets)">
      <p className="font-headline text-[1.15rem] leading-snug">{story}</p>
      <table className="w-full mt-5 font-mono text-[13px] tabular-nums">
        <thead>
          <tr className="font-label text-[9px] text-ink-soft text-right">
            <th className="text-left font-normal pb-2" />
            <th className="font-normal pb-2">Bought</th>
            <th className="font-normal pb-2">Sold</th>
            <th className="font-normal pb-2">Net</th>
          </tr>
        </thead>
        <tbody>
          {(
            [
              ["Foreign (FII/FPI)", fii],
              ["Indian funds (DII)", dii],
            ] as const
          ).map(([who, d]) => (
            <tr key={who} className="border-t hairline text-right">
              <td className="text-left font-sans text-[13px] py-2">{who}</td>
              <td className="py-2">{fmt(d.buy)}</td>
              <td className="py-2">{fmt(d.sell)}</td>
              <td className={`py-2 font-semibold ${d.net >= 0 ? "text-up" : "text-down"}`}>
                {d.net >= 0 ? "+" : "−"}
                {fmt(d.net)}
              </td>
            </tr>
          ))}
          <tr className="border-t hairline text-right text-ink-soft">
            <td className="text-left font-sans text-[13px] py-2">Together</td>
            <td />
            <td />
            <td className={`py-2 ${both >= 0 ? "text-up" : "text-down"}`}>
              {both >= 0 ? "+" : "−"}
              {fmt(both)}
            </td>
          </tr>
        </tbody>
      </table>

      {flows.days.length >= 2 && (
        <div className="mt-7">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-label text-[9px] text-ink-soft">
              {new Date(`${flows.date}T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", timeZone: TZ })}, day by day
            </span>
            <span className="flex gap-3 font-mono text-[10px] text-ink-soft">
              <span>
                <span className="inline-block w-2 h-2 rounded-sm mr-1 align-middle" style={{ background: "var(--hue-markets)" }} />
                FII
              </span>
              <span>
                <span className="inline-block w-2 h-2 rounded-sm mr-1 align-middle bg-ink-faint" />
                DII
              </span>
            </span>
          </div>
          {/* Two bars a day from a zero line: up is buying, down is selling. */}
          <div className="relative h-36 mt-3 flex items-stretch gap-1.5">
            <span className="absolute left-0 right-0 top-1/2 h-px bg-[color:var(--rule)]" />
            {flows.days.map((d) => (
              <span
                key={d.date}
                className="relative flex-1 flex gap-[2px]"
                title={`${day(d.date)} · FII ${d.fii >= 0 ? "+" : "−"}${fmt(d.fii)} · DII ${d.dii >= 0 ? "+" : "−"}${fmt(d.dii)}`}
              >
                {[d.fii, d.dii].map((v, i) => (
                  <span key={i} className="relative flex-1">
                    <span
                      className="absolute left-0 right-0 rounded-[2px]"
                      style={{
                        background: i === 0 ? "var(--hue-markets)" : "var(--ink-faint)",
                        height: `${(Math.abs(v) / peak) * 50}%`,
                        ...(v >= 0 ? { bottom: "50%" } : { top: "50%" }),
                      }}
                    />
                  </span>
                ))}
              </span>
            ))}
          </div>
          <div className="flex justify-between font-mono text-[10px] text-ink-faint mt-1">
            <span>{day(flows.days[0].date)}</span>
            <span>{day(flows.days[flows.days.length - 1].date)}</span>
          </div>
          {flows.month && (
            <p className="font-mono text-[11px] text-ink-soft mt-3">
              So far this month ({flows.month.days} trading days kept): FII {crore(flows.month.fii)} · DII {crore(flows.month.dii)}
            </p>
          )}
        </div>
      )}
      <p className="font-mono text-[10px] text-ink-faint mt-6 leading-relaxed">
        NSE&rsquo;s provisional figures for the cash market, out each evening. FIIs are foreign institutions; DIIs are Indian mutual funds,
        insurers and banks. When foreign money leaves and Indian funds take the other side, the index holds up far better than the
        foreign selling alone would suggest. The month fills in as the paper keeps each day.
      </p>
    </Sheet>
  );
}

function FlowCell({ flows }: { flows: NonNullable<RatesPanel["flows"]> }) {
  const [open, setOpen] = useState(false);
  const max = Math.max(flows.fii.buy + flows.fii.sell, flows.dii.buy + flows.dii.sell, 1);
  return (
    <div className="min-w-0 pr-3 py-3 lg:px-4 lg:border-l hairline">
      <button type="button" onClick={() => setOpen(true)} className="w-full text-left group">
        <span className="flex items-baseline justify-between gap-2">
          <span className="font-label text-[9px] text-ink-soft">Who&rsquo;s buying · {day(flows.date)}</span>
          <span className="font-mono text-[8.5px] text-ink-faint group-hover:text-ink">NSE · more ›</span>
        </span>
        <span className="grid gap-1.5 mt-1.5">
          <FlowLine who="FII" d={flows.fii} max={max} />
          <FlowLine who="DII" d={flows.dii} max={max} />
        </span>
        <span className="flex gap-3 font-mono text-[9px] text-ink-faint mt-1.5">
          <span>
            <span className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle" style={{ background: "var(--up)" }} />
            bought
          </span>
          <span>
            <span className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle" style={{ background: "var(--down)" }} />
            sold
          </span>
        </span>
      </button>
      {open && <FlowsSheet flows={flows} onClose={() => setOpen(false)} />}
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
        <Cell label="RBI repo rate" source="RBI" value={`${repo.rate.toFixed(2)}%`}>
          {repo.next ? `Next decision ${day(repo.next)}` : "Next decision not announced"}
          <Expect m={policyMarket(markets, "rbi", repo.next)} on={repo.next} />
        </Cell>
      )}
      {fed && (
        <Cell label="Fed funds target" source="FRED" value={`${fed.lower.toFixed(2)}–${fed.upper.toFixed(2)}%`}>
          {fed.move ? `${fed.move === "cut" ? "Cut" : "Raised"} ${day(fed.since)}` : `Held since ${day(fed.since)}`}
          {fed.next ? ` · next ${day(fed.next)}` : ""}
          <Expect m={policyMarket(markets, "fed", fed.next)} on={fed.next} />
        </Cell>
      )}
      {us10y && (
        <Cell label="US 10-year yield" source="Yahoo" value={`${us10y.yield.toFixed(2)}%`}>
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
      {flows && <FlowCell flows={flows} />}
      <p className="col-span-2 lg:col-span-4 font-mono text-[9.5px] text-ink-faint pb-2 -mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>Big numbers: the latest published figures, source top right.</span>
        <span className="inline-flex items-center gap-1">
          <span className="font-label text-[7.5px] rounded px-1 py-[1px]" style={{ background: "var(--hue-poll)", color: "var(--paper)" }}>
            Odds
          </span>
          in a dashed box: what prediction-market traders expect next, a forecast, not a fact.
        </span>
      </p>
    </div>
  );
}
