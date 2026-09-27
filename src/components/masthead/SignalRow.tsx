import type { Edition, WeatherNow } from "@/lib/types";
import WeatherIcon from "@/components/widgets/WeatherIcon";

// The signal row under the masthead: one card per desk — markets, the next
// Grand Prix, the sky, the word of the day — each in its section's colour
// and each a shortcut down to that section. Static on purpose: the day's
// numbers at a glance, nothing scrolling past.

function until(iso: string): string | null {
  const ms = Date.parse(iso) - Date.now();
  if (Number.isNaN(ms)) return null;
  if (ms <= 0) return "this weekend";
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor(ms / 3_600_000) % 24;
  return d > 0 ? `${d}d ${h}h` : `${h}h`;
}

function Pct({ value }: { value: number }) {
  return (
    <span className={`font-mono text-[12px] font-semibold ${value >= 0 ? "text-up" : "text-down"}`}>
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
      className="group relative flex flex-col gap-1.5 rounded-2xl border px-4 py-3.5 min-w-0 overflow-hidden transition-transform duration-300 hover:-translate-y-0.5"
    >
      <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full" style={{ background: hue }} />
      <span className="flex items-center justify-between font-label text-[9px]" style={{ color: hue }}>
        {label}
        <span className="text-ink-faint transition-transform duration-300 group-hover:translate-y-0.5" aria-hidden="true">
          ↓
        </span>
      </span>
      {children}
    </a>
  );
}

export default function SignalRow({ edition, weather }: { edition: Edition; weather?: WeatherNow | null }) {
  const indices = edition.markets.indices;
  const lead = indices.find((i) => /nifty 50/i.test(i.name)) ?? indices[0];
  const second = indices.find((i) => /s&p/i.test(i.name)) ?? indices.find((i) => i !== lead);
  const next = edition.f1?.nextRace;
  const w = weather ?? edition.weather;
  const word = edition.wordOfDay;

  const cards: React.ReactNode[] = [];
  if (lead) {
    cards.push(
      <Card key="mk" i={cards.length} href="#market-pulse" hue="var(--hue-markets)" label="Markets">
        <span className="flex items-baseline gap-2 min-w-0">
          <span className="font-display font-bold text-[1.7rem] leading-none truncate">
            {lead.level.toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </span>
          <Pct value={lead.changePct} />
        </span>
        <span className="font-sans text-[12px] text-ink-soft truncate">
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
      <Card key="f1" i={cards.length} href="#paddock-notes" hue="var(--hue-f1)" label={`F1 · Round ${next.round}`}>
        <span className="font-display font-bold text-[1.7rem] leading-none truncate" suppressHydrationWarning>
          {t ?? next.country}
        </span>
        <span className="font-sans text-[12px] text-ink-soft truncate">Lights out · {next.name}</span>
      </Card>,
    );
  }
  if (w) {
    cards.push(
      <Card key="wx" i={cards.length} href="#sky-report" hue="var(--hue-sky)" label={w.city}>
        <span className="flex items-center gap-2">
          <span className="font-display font-bold text-[1.7rem] leading-none">{w.tempC}°</span>
          <span style={{ color: "var(--hue-sky)" }}>
            <WeatherIcon code={w.weatherCode} size={22} />
          </span>
        </span>
        <span className="font-sans text-[12px] text-ink-soft truncate">
          {w.condition} · AQI {w.aqi}
        </span>
      </Card>,
    );
  }
  if (word?.word) {
    cards.push(
      <Card key="wd" i={cards.length} href="#word-of-the-day" hue="var(--hue-world)" label="Word of the day">
        <span className="font-headline italic text-[1.55rem] leading-none truncate">{word.word}</span>
        <span className="font-sans text-[12px] text-ink-soft truncate">
          {word.partOfSpeech}
          {word.pronunciation ? ` · ${word.pronunciation}` : ""}
        </span>
      </Card>,
    );
  }
  if (cards.length === 0) return null;

  return (
    <div className="max-w-[1240px] mx-auto px-4 sm:px-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">{cards}</div>
    </div>
  );
}
