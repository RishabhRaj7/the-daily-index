"use client";

import { useState, useSyncExternalStore } from "react";
import type { Commodity, CryptoQuote, MarketIndex, MarketMood, MarketRegion, OddsMarket, Story } from "@/lib/types";
import SectionHeader from "@/components/story/SectionHeader";
import StoryArticle from "@/components/story/StoryArticle";
import MarketIndexCard from "@/components/widgets/MarketIndexCard";
import MoodGauge from "@/components/widgets/MoodGauge";
import SparklineChart from "@/components/widgets/SparklineChart";
import MarketChartSheet, { type ChartTarget } from "@/components/widgets/MarketChartSheet";
import IpoWatch from "@/components/widgets/IpoWatch";
import RatesRow from "@/components/widgets/RatesRow";
import StaleTag from "@/components/widgets/StaleTag";
import { moodZone } from "@/lib/mood-zones";
import { regionState, reopenLabel, type HolidayMap, type SessionState } from "@/lib/market-hours";

// Market Pulse: the world's markets one region at a time. A row of region
// cards (each with its own mood) doubles as the tabs; the selected region
// opens as a mood gauge beside its four index tiles. Commodities follow, in
// rupees.

const REGIONS: MarketRegion[] = ["India", "US", "Europe", "Asia"];

// Minute clock for the open/closed chips; null on the server so the first
// client render matches the HTML.
function subscribe(cb: () => void) {
  const id = window.setInterval(cb, 60_000);
  return () => window.clearInterval(id);
}
const minuteNow = () => Math.floor(Date.now() / 60_000);

function signed(v: number, digits = 2) {
  return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}%`;
}

function RegionTab({
  region,
  mood,
  indices,
  selected,
  session,
  now,
  onSelect,
}: {
  region: MarketRegion;
  mood?: MarketMood;
  indices: MarketIndex[];
  selected: boolean;
  /** Null on the server render, before the clock is known. */
  session: SessionState | null;
  now: number;
  onSelect: () => void;
}) {
  const open = session?.open ?? null;
  const avg = indices.reduce((s, i) => s + i.changePct, 0) / (indices.length || 1);
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={`text-left rounded-2xl border px-4 py-3 transition-[border-color,background-color,transform] duration-300 hover:-translate-y-0.5 ${
        selected ? "border-[color:var(--section-hue)]" : "hairline border-[color:var(--rule)]"
      }`}
      style={selected ? { background: "color-mix(in srgb, var(--section-hue) 10%, var(--paper))" } : undefined}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="font-label text-[10px]">{region}</span>
        {open !== null && (
          <span
            className={`flex items-center gap-1 font-mono text-[10px] whitespace-nowrap ${open ? "text-up" : "text-ink-faint"}`}
            title={session?.holiday ? `Closed for ${session.holiday}` : undefined}
          >
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${open ? "bg-up animate-pulse" : "bg-ink-faint"}`} />
            {open ? "open" : session?.nextOpen ? `opens ${reopenLabel(session.nextOpen, now)}` : "closed"}
          </span>
        )}
      </span>
      <span className="flex items-baseline justify-between gap-2 mt-2">
        <span className="font-display font-bold text-[1.35rem] leading-none truncate">{mood?.label ?? "—"}</span>
        <span className={`font-mono text-[12px] ${avg >= 0 ? "text-up" : "text-down"}`}>{signed(avg)}</span>
      </span>
      {mood && (
        <span className="block h-1 rounded-full bg-card-bg mt-2.5 overflow-hidden">
          <span
            className="block h-full rounded-full"
            style={{ width: `${Math.max(4, mood.score)}%`, background: moodZone(mood).color }}
          />
        </span>
      )}
    </button>
  );
}

/** A compact price tile (commodities in ₹, crypto in USDT) that opens its chart. */
function PriceTile({
  name,
  unit,
  price,
  changePct,
  sparkline,
  note,
  source,
  stale,
  asOf,
  i,
  onOpen,
}: {
  name: string;
  unit: string;
  price: string;
  changePct: number;
  sparkline: number[];
  note?: string;
  /** Publisher of the price, when it isn't the converted benchmark. */
  source?: string;
  stale?: boolean;
  asOf?: string;
  i: number;
  onOpen: () => void;
}) {
  const up = changePct >= 0;
  return (
    <li className="h-full" data-reveal style={{ ["--reveal-i" as string]: i }}>
      <button
        type="button"
        onClick={onOpen}
        title={note}
        className="module w-full h-full text-left flex flex-col gap-2 transition-[transform,border-color] duration-300 hover:-translate-y-0.5 hover:border-[color:var(--section-hue)]"
      >
        <span className="flex items-start justify-between gap-2 w-full">
          <span className="min-w-0">
            <span className="block font-sans font-semibold text-[14px] leading-tight">{name}</span>
            <span className="block font-label text-[8px] text-ink-faint mt-0.5">
              {unit}
              {source ? ` · ${source}` : ""}
            </span>
          </span>
          <span className={`font-mono text-[11px] font-semibold ${up ? "text-up" : "text-down"}`}>
            {up ? "▲" : "▼"} {Math.abs(changePct).toFixed(2)}%
          </span>
        </span>
        <span className="font-display font-bold text-[1.7rem] leading-none tracking-tight tabular-nums">{price}</span>
        <SparklineChart values={sparkline} positive={up} className="w-full h-8" />
        {stale && <StaleTag asOf={asOf} />}
      </button>
    </li>
  );
}

function inr(v: number): string {
  const digits = v >= 1000 ? 0 : 2;
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;
}

function usdt(v: number): string {
  return `${v.toLocaleString("en-US", { maximumFractionDigits: v >= 1000 ? 0 : 2 })}`;
}

export default function MarketPulseSection({
  stories,
  indices,
  mood,
  moods = [],
  commodities = [],
  crypto = [],
  holidays = {},
  oddsMarkets = [],
  updatedAt = null,
}: {
  stories: Story[];
  indices: MarketIndex[];
  mood: MarketMood | null;
  moods?: MarketMood[];
  commodities?: Commodity[];
  crypto?: CryptoQuote[];
  /** Exchange holidays, for open / reopens-at. */
  holidays?: HolidayMap;
  /** Prediction markets, for what traders expect of the next rate decision. */
  oddsMarkets?: OddsMarket[];
  /** When the live numbers last arrived; null until the first refresh. */
  updatedAt?: string | null;
}) {
  const [region, setRegion] = useState<MarketRegion>("India");
  const [chart, setChart] = useState<ChartTarget | null>(null);
  const minute = useSyncExternalStore(subscribe, minuteNow, () => null);
  const updated = updatedAt
    ? new Date(updatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : null;

  const regions = REGIONS.filter((r) => indices.some((i) => i.market === r));
  // An older edition carries one combined mood: it stands in for India.
  const moodFor = (r: MarketRegion) =>
    moods.find((m) => m.region === r) ?? (r === "India" && mood && !mood.region ? mood : undefined);
  const active = regions.includes(region) ? region : (regions[0] ?? "India");
  const activeIndices = indices.filter((i) => i.market === active);
  const activeMood = moodFor(active);
  const now = minute === null ? null : minute * 60_000;
  const sessionOf = (r: MarketRegion) => (now === null ? null : regionState(r, now, holidays));
  const activeSession = sessionOf(active);

  return (
    <section id="market-pulse">
      <SectionHeader
        sectionKey="market-pulse"
        folio={
          indices.length === 0 ? undefined : activeSession && !activeSession.open ? (
            <span title={activeSession.holiday ? `Closed for ${activeSession.holiday}` : undefined}>
              {active} closed{activeSession.holiday ? ` for ${activeSession.holiday}` : ""}
              {activeSession.nextOpen && now !== null ? ` · reopens ${reopenLabel(activeSession.nextOpen, now)}` : ""}
            </span>
          ) : (
            <>
              <span className="live-dot text-up" /> live{updated ? ` · ${updated}` : ""}
            </>
          )
        }
      />
      {indices.length > 0 ? (
        <>
          <div role="tablist" aria-label="Markets by region" className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-reveal>
            {regions.map((r) => (
              <RegionTab
                key={r}
                region={r}
                mood={moodFor(r)}
                indices={indices.filter((i) => i.market === r)}
                selected={r === active}
                session={sessionOf(r)}
                now={now ?? 0}
                onSelect={() => setRegion(r)}
              />
            ))}
          </div>

          <RatesRow markets={oddsMarkets} />

          <ul key={active} role="tabpanel" aria-label={`${active} markets`} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">
            {activeMood && (
              <li className="sm:col-span-2 lg:col-span-1 lg:row-span-2">
                <MoodGauge mood={activeMood} indices={activeIndices} title={`${active} mood`} />
              </li>
            )}
            {activeIndices.map((idx, i) => (
              <MarketIndexCard
                key={idx.id}
                index={idx}
                i={i + 1}
                live={updatedAt !== null}
                onOpen={() => setChart({ kind: "index", id: idx.id, name: idx.name, kicker: `${idx.market} · index` })}
              />
            ))}
          </ul>

          <IpoWatch />

          {(commodities.length > 0 || crypto.length > 0) && (
            <div className="mt-12">
              <div className="flex items-baseline justify-between gap-4 mb-4">
                <h3 className="font-display font-bold text-[1.8rem] leading-none">Commodities &amp; crypto</h3>
                <span className="font-mono text-[10px] text-ink-soft text-right">
                  {commodities.some((c) => c.source === "IBJA")
                    ? "Gold and silver at IBJA's published rate, before GST · other benchmarks in rupees · crypto in USDT · tap for a chart"
                    : "Benchmarks in rupees · bullion incl. 6% import duty, before GST · crypto in USDT · tap for a chart"}
                </span>
              </div>
              <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {commodities.map((c, i) => (
                  <PriceTile
                    key={c.id}
                    name={c.name}
                    unit={c.id === "usdinr" ? "₹ per USD" : `₹ per ${c.unit}`}
                    price={inr(c.priceInr)}
                    changePct={c.changePct}
                    sparkline={c.sparkline}
                    note={c.note}
                    source={c.source}
                    stale={c.stale}
                    asOf={c.asOf}
                    i={i}
                    onOpen={() => setChart({ kind: "commodity", id: c.id, name: c.name, kicker: "Commodity · ₹", prefix: "₹" })}
                  />
                ))}
                {crypto.map((c, i) => (
                  <PriceTile
                    key={c.id}
                    name={c.name}
                    unit={`${c.pair.replace("USDT", "")} / USDT · 24h`}
                    price={usdt(c.price)}
                    changePct={c.changePct}
                    sparkline={c.sparkline}
                    stale={c.stale}
                    asOf={c.asOf}
                    i={commodities.length + i}
                    onOpen={() => setChart({ kind: "crypto", id: c.id, name: `${c.name} (${c.pair.replace("USDT", "/USDT")})`, kicker: "Crypto · USDT" })}
                  />
                ))}
              </ul>
            </div>
          )}
          {chart && <MarketChartSheet target={chart} onClose={() => setChart(null)} />}
        </>
      ) : (
        <div className="border-l-2 border-accent pl-4 py-1">
          <p className="font-headline text-xl leading-tight">The tape is silent.</p>
          <p className="font-body text-sm text-ink-soft mt-1">
            Live index data didn&rsquo;t arrive this edition. The table returns on the next refresh.
          </p>
        </div>
      )}
      {stories.length > 0 && (
        <div className="story-grid mt-10">
          {stories.map((s) => (
            <StoryArticle key={s.id} story={s} />
          ))}
        </div>
      )}
    </section>
  );
}
