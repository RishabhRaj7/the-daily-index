"use client";

import { useState, useSyncExternalStore } from "react";
import type { Commodity, MarketIndex, MarketMood, MarketRegion, Story } from "@/lib/types";
import SectionHeader from "@/components/story/SectionHeader";
import StoryArticle from "@/components/story/StoryArticle";
import MarketIndexCard from "@/components/widgets/MarketIndexCard";
import MoodGauge from "@/components/widgets/MoodGauge";
import SparklineChart from "@/components/widgets/SparklineChart";

// Market Pulse: the world's markets one region at a time. A row of region
// cards (each with its own mood) doubles as the tabs; the selected region
// opens as a mood gauge beside its four index tiles. Commodities follow, in
// rupees.

const REGIONS: MarketRegion[] = ["India", "US", "Europe", "Asia"];

// Regular trading hours on each region's lead exchange, local time.
// Exchange holidays are not known here, so a holiday reads as "open".
const SESSIONS: Record<MarketRegion, { tz: string; open: number; close: number }> = {
  India: { tz: "Asia/Kolkata", open: 9 * 60 + 15, close: 15 * 60 + 30 },
  US: { tz: "America/New_York", open: 9 * 60 + 30, close: 16 * 60 },
  Europe: { tz: "Europe/London", open: 8 * 60, close: 16 * 60 + 30 },
  Asia: { tz: "Asia/Tokyo", open: 9 * 60, close: 15 * 60 + 30 },
};

function isOpen(region: MarketRegion, at: number): boolean {
  const { tz, open, close } = SESSIONS[region];
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(at));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  if (get("weekday") === "Sat" || get("weekday") === "Sun") return false;
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  return minutes >= open && minutes < close;
}

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
  open,
  onSelect,
}: {
  region: MarketRegion;
  mood?: MarketMood;
  indices: MarketIndex[];
  selected: boolean;
  open: boolean | null;
  onSelect: () => void;
}) {
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
          <span className={`flex items-center gap-1 font-mono text-[10px] ${open ? "text-up" : "text-ink-faint"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${open ? "bg-up animate-pulse" : "bg-ink-faint"}`} />
            {open ? "open" : "closed"}
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
            style={{ width: `${Math.max(4, mood.score)}%`, background: "var(--section-hue, var(--accent))" }}
          />
        </span>
      )}
    </button>
  );
}

function CommodityTile({ c, i }: { c: Commodity; i: number }) {
  const up = c.changePct >= 0;
  const digits = c.priceInr >= 1000 ? 0 : 2;
  return (
    <li className="module flex flex-col gap-2" data-reveal style={{ ["--reveal-i" as string]: i }} title={c.note}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-sans font-semibold text-[14px] leading-tight">{c.name}</div>
          <div className="font-label text-[8px] text-ink-faint mt-0.5">₹ per {c.unit}</div>
        </div>
        <span className={`font-mono text-[11px] font-semibold ${up ? "text-up" : "text-down"}`}>
          {up ? "▲" : "▼"} {Math.abs(c.changePct).toFixed(2)}%
        </span>
      </div>
      <div className="font-display font-bold text-[1.7rem] leading-none tracking-tight tabular-nums">
        ₹{c.priceInr.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits })}
      </div>
      <SparklineChart values={c.sparkline} positive={up} className="w-full h-8" />
    </li>
  );
}

export default function MarketPulseSection({
  stories,
  indices,
  mood,
  moods = [],
  commodities = [],
  updatedAt = null,
}: {
  stories: Story[];
  indices: MarketIndex[];
  mood: MarketMood | null;
  moods?: MarketMood[];
  commodities?: Commodity[];
  /** When the live numbers last arrived; null until the first refresh. */
  updatedAt?: string | null;
}) {
  const [region, setRegion] = useState<MarketRegion>("India");
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

  return (
    <section id="market-pulse">
      <SectionHeader
        sectionKey="market-pulse"
        folio={
          indices.length > 0 ? (
            <>
              <span className="live-dot text-up" /> live{updated ? ` · ${updated}` : ""}
            </>
          ) : undefined
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
                open={minute === null ? null : isOpen(r, minute * 60_000)}
                onSelect={() => setRegion(r)}
              />
            ))}
          </div>

          <ul key={active} role="tabpanel" aria-label={`${active} markets`} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">
            {activeMood && (
              <li className="sm:col-span-2 lg:col-span-1 lg:row-span-2">
                <MoodGauge mood={activeMood} indices={activeIndices} title={`${active} mood`} />
              </li>
            )}
            {activeIndices.map((idx, i) => (
              <MarketIndexCard key={idx.id} index={idx} i={i + 1} live={updatedAt !== null} />
            ))}
          </ul>

          {commodities.length > 0 && (
            <div className="mt-12">
              <div className="flex items-baseline justify-between gap-4 mb-4">
                <h3 className="font-display font-bold text-[1.8rem] leading-none">Commodities in ₹</h3>
                <span className="font-mono text-[10px] text-ink-soft text-right">
                  International benchmarks in rupees · bullion incl. 6% import duty, before GST
                </span>
              </div>
              <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {commodities.map((c, i) => (
                  <CommodityTile key={c.id} c={c} i={i} />
                ))}
              </ul>
            </div>
          )}
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
