import type { Edition, WeatherNow } from "@/lib/types";
import WeatherIcon from "@/components/widgets/WeatherIcon";
import { cityMinutes, isNight, skyClock } from "@/lib/sky";

// The signal row under the masthead: the three numbers you look up every day —
// markets, the next Grand Prix, the sky — each in its section's colour and each
// a shortcut down to that section. Static on purpose: nothing scrolling past. A
// phone prints the number alone, so nothing is ever cut off; the line of detail
// under it starts at a tablet's width.

export function until(iso: string): string | null {
  const ms = Date.parse(iso) - Date.now();
  if (Number.isNaN(ms)) return null;
  if (ms <= 0) return "this weekend";
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor(ms / 3_600_000) % 24;
  return d > 0 ? `${d}d ${h}h` : `${h}h`;
}

function Pct({ value }: { value: number }) {
  return (
    <span className={`font-mono text-[12px] font-semibold whitespace-nowrap ${value >= 0 ? "text-up" : "text-down"}`}>
      {value >= 0 ? "▲" : "▼"} {Math.abs(value).toFixed(2)}%
    </span>
  );
}

function Card({
  href,
  hue,
  label,
  children,
  i,
}: {
  href: string;
  hue: string;
  label: string;
  children: React.ReactNode;
  i: number;
}) {
  return (
    <a
      href={href}
      data-reveal
      style={{
        ["--reveal-i" as string]: i,
        ["--card-hue" as string]: hue,
        background: `color-mix(in srgb, ${hue} 9%, var(--paper))`,
        borderColor: `color-mix(in srgb, ${hue} 28%, transparent)`,
      }}
      className="group relative flex flex-col gap-0.5 md:gap-1 rounded-xl border pl-3.5 pr-2 py-2 md:pl-4 md:pr-3 md:py-2.5 min-w-0 overflow-hidden transition-transform duration-300 hover:-translate-y-0.5"
    >
      <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full" style={{ background: hue }} />
      <span className="flex items-center justify-between gap-1 font-label text-[11px]" style={{ color: hue }}>
        <span className="truncate">{label}</span>
        <span className="text-ink-faint transition-transform duration-300 group-hover:translate-y-0.5" aria-hidden="true">
          ↓
        </span>
      </span>
      {children}
    </a>
  );
}

const DETAIL = "hidden md:block font-sans text-[12px] text-ink-soft";
const NUMBER = "font-display font-bold text-[1.3rem] md:text-[1.5rem] leading-none";

export default function SignalRow({ edition, weather }: { edition: Edition; weather?: WeatherNow | null }) {
  const indices = edition.markets.indices;
  const lead = indices.find((i) => /nifty 50/i.test(i.name)) ?? indices[0];
  const second = indices.find((i) => /s&p/i.test(i.name)) ?? indices.find((i) => i !== lead);
  const next = edition.f1?.nextRace;
  const w = weather ?? edition.weather;

  const cards: React.ReactNode[] = [];
  if (lead) {
    cards.push(
      <Card key="mk" i={cards.length} href="#market-pulse" hue="var(--hue-markets)" label="Markets">
        <span className="flex flex-wrap items-baseline gap-x-2 min-w-0">
          <span className={NUMBER}>{lead.level.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
          <Pct value={lead.changePct} />
        </span>
        <span className={DETAIL}>
          {lead.name}
          {second && (
            <>
              {" · "}
              {second.name} <Pct value={second.changePct} />
            </>
          )}
        </span>
      </Card>,
    );
  }
  if (next) {
    const t = until(next.date);
    cards.push(
      <Card key="f1" i={cards.length} href="#paddock-notes" hue="var(--hue-f1)" label={`F1 · R${next.round}`}>
        <span className={NUMBER} suppressHydrationWarning>
          {t ?? next.country}
        </span>
        <span className={DETAIL}>Lights out · {next.name}</span>
      </Card>,
    );
  }
  if (w) {
    // Weather only exists after the client fetch, so reading the clock here
    // cannot disagree with the server render.
    const night = isNight(w, skyClock(w, cityMinutes(w.utcOffsetSeconds)));
    const condition = night && w.night ? w.night.condition : w.condition;
    cards.push(
      <Card key="wx" i={cards.length} href="#sky-report" hue="var(--hue-sky)" label={w.city}>
        <span className="flex items-center gap-2">
          <span className={NUMBER}>{w.tempC}°</span>
          <span style={{ color: "var(--hue-sky)" }}>
            <WeatherIcon code={w.weatherCode} size={20} night={night} />
          </span>
        </span>
        <span className={DETAIL}>
          {condition}
          {typeof w.tempMax === "number" && typeof w.tempMin === "number" ? ` · ${w.tempMax}°/${w.tempMin}°` : ""} · AQI {w.aqi}
        </span>
      </Card>,
    );
  }
  if (cards.length === 0) return null;

  return (
    <div className="page-wrap px-4 sm:px-6 mt-1.5">
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cards.length}, minmax(0, 1fr))` }}>
        {cards}
      </div>
    </div>
  );
}
