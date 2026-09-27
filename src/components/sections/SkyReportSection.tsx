import SettingsLink from "@/components/chrome/SettingsLink";
import type { WeatherNow } from "@/lib/types";
import SectionHeader from "@/components/story/SectionHeader";
import SunArc from "@/components/widgets/SunArc";
import WeatherIcon from "@/components/widgets/WeatherIcon";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline py-1.5 border-b hairline last:border-b-0">
      <span className="font-label text-[10px] text-ink-soft">{label}</span>
      <span className="font-mono text-sm tabular-nums">{value}</span>
    </div>
  );
}

/** A labelled 0..max meter that fills in on reveal. */
function Meter({ label, value, max, note }: { label: string; value: number; max: number; note: string }) {
  const pct = Math.max(0.04, Math.min(1, value / max));
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-label text-[9px] text-ink-soft">{label}</span>
        <span className="font-mono text-[11px] text-ink-soft">{note}</span>
      </div>
      <div className="font-display font-bold text-[2rem] leading-none mt-1">{value}</div>
      <div className="h-1.5 rounded-full bg-card-bg mt-2 overflow-hidden">
        <div
          className="h-full rounded-full bar-grow"
          style={{ width: `${pct * 100}%`, background: "var(--section-hue, var(--accent))" }}
        />
      </div>
    </div>
  );
}

function uvLabel(uv: number): string {
  if (uv < 3) return "low";
  if (uv < 6) return "moderate";
  if (uv < 8) return "high";
  if (uv < 11) return "very high";
  return "extreme";
}

export default function SkyReportSection({
  weather,
  live = false,
  status = "ready",
  city,
}: {
  weather: WeatherNow | null;
  live?: boolean;
  status?: "loading" | "ready" | "failed";
  city?: string;
}) {
  if (!weather) {
    return (
      <section id="sky-report">
        <SectionHeader sectionKey="sky-report" />
        {status === "loading" ? (
          <div className="grid md:grid-cols-[1fr_220px] gap-6" aria-busy="true">
            <div>
              <div className="h-8 w-2/3 bg-card-bg mb-3 animate-pulse" />
              <div className="h-4 w-full bg-card-bg mb-2 animate-pulse" />
              <div className="h-4 w-5/6 bg-card-bg animate-pulse" />
              <p className="font-body italic text-xs text-ink-soft mt-3">
                Consulting the observatory for {city ?? "your city"}…
              </p>
            </div>
            <div className="border-t-2 border-ink pt-2">
              {["Sunrise", "Sunset", "UV index", "Air quality"].map((l) => (
                <Row key={l} label={l} value="—" />
              ))}
            </div>
          </div>
        ) : (
          <div className="border-l-2 border-accent pl-4 py-1">
            <p className="font-headline text-xl font-semibold leading-tight">
              The observatory didn&rsquo;t answer.
            </p>
            <p className="font-body text-sm text-ink-soft mt-1 leading-relaxed">
              We couldn&rsquo;t fetch conditions for{" "}
              <span className="font-mono">{city || "your home city"}</span> this time. If the city name
              looks off, fix it in{" "}
              <SettingsLink className="text-accent underline underline-offset-2">
                Settings
              </SettingsLink>
              ; otherwise the next refresh should sort it out. Look out of a window in the meantime.
            </p>
          </div>
        )}
      </section>
    );
  }

  return (
    <section id="sky-report">
      <SectionHeader
        sectionKey="sky-report"
        folio={live ? <><span className="live-dot text-up" /> live</> : undefined}
      />

      <div className="grid md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-10 items-start">
        <div data-reveal>
          <div className="font-label text-[11px] text-ink-soft">{weather.city}</div>
          <div className="flex items-start gap-4 mt-2">
            <span className="font-display font-extrabold text-[clamp(6rem,17vw,11rem)] leading-[0.78] tracking-tight">
              {weather.tempC}°
            </span>
            <span className="float mt-2" style={{ color: "var(--section-hue, var(--accent))" }}>
              <WeatherIcon code={weather.weatherCode} size={72} />
            </span>
          </div>
          <h3 className="font-headline text-2xl md:text-3xl leading-tight mt-5">{weather.condition}</h3>
          <p className="font-headline italic text-ink-soft mt-1">{weather.quip}</p>
          <p className="font-body text-[16px] leading-relaxed mt-4 max-w-[52ch]">{weather.narrative}</p>
        </div>

        <div className="module space-y-6" data-reveal>
          <SunArc sunrise={weather.sunrise} sunset={weather.sunset} />
          <div className="grid grid-cols-2 gap-6 pt-5 border-t hairline">
            <Meter label="UV index" value={weather.uvIndex} max={11} note={uvLabel(weather.uvIndex)} />
            <Meter label="Air quality" value={weather.aqi} max={300} note={weather.aqiLabel} />
          </div>
        </div>
      </div>
    </section>
  );
}
