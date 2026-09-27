"use client";

import SettingsLink from "@/components/chrome/SettingsLink";
import type { WeatherNow } from "@/lib/types";
import SectionHeader from "@/components/story/SectionHeader";
import SunArc from "@/components/widgets/SunArc";
import WeatherIcon from "@/components/widgets/WeatherIcon";
import { isNight, moonPhase } from "@/lib/sky";
import { useSkyClock } from "@/lib/use-sky-clock";

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

/** Today's low → high, with a marker where the temperature sits now. */
function TempRange({ min, max, now }: { min: number; max: number; now: number }) {
  const span = Math.max(1, max - min);
  const at = Math.min(1, Math.max(0, (now - min) / span));
  return (
    <div className="flex items-center gap-3 font-mono text-[12px] tabular-nums">
      <span className="text-ink-soft">
        <span className="font-label text-[9px] mr-1">Low</span>
        {min}°
      </span>
      <span className="relative flex-1 h-1.5 rounded-full bg-card-bg min-w-[80px]">
        <span
          className="absolute inset-y-0 left-0 right-0 rounded-full opacity-40"
          style={{ background: "linear-gradient(90deg, var(--hue-tech), var(--section-hue, var(--accent)))" }}
        />
        <span
          className="absolute top-1/2 w-3 h-3 rounded-full border-2"
          style={{
            left: `calc(${at * 100}% - 6px)`,
            transform: "translateY(-50%)",
            background: "var(--paper)",
            borderColor: "var(--section-hue, var(--accent))",
          }}
          aria-label={`Now ${now}°`}
        />
      </span>
      <span className="text-ink-soft">
        {max}°<span className="font-label text-[9px] ml-1">High</span>
      </span>
    </div>
  );
}

function humidityLabel(h: number): string {
  if (h < 30) return "dry";
  if (h < 60) return "comfortable";
  if (h < 80) return "humid";
  return "muggy";
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

  return <SkyReading weather={weather} live={live} />;
}

function SkyReading({ weather, live }: { weather: WeatherNow; live: boolean }) {
  const clock = useSkyClock(weather);
  const night = isNight(weather, clock);
  const words = night && weather.night ? weather.night : weather;
  const moon = moonPhase();
  const hasRange = typeof weather.tempMin === "number" && typeof weather.tempMax === "number";

  return (
    <section
      id="sky-report"
      data-sky={night ? "night" : "day"}
      // After dark the section trades the sun's orange for moonlight.
      style={night ? { ["--section-hue" as string]: "var(--hue-night)" } : undefined}
    >
      <SectionHeader
        sectionKey="sky-report"
        folio={live ? <><span className="live-dot text-up" /> {night ? "tonight" : "live"}</> : undefined}
      />

      <div className="grid md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-10 items-start">
        <div data-reveal>
          <div className="font-label text-[11px] text-ink-soft">
            {weather.city} · {night ? "Tonight" : "Today"}
          </div>
          <div className="flex items-start gap-4 mt-2">
            <span className="font-display font-extrabold text-[clamp(6rem,17vw,11rem)] leading-[0.78] tracking-tight">
              {weather.tempC}°
            </span>
            <span className="float mt-2" style={{ color: "var(--section-hue, var(--accent))" }}>
              <WeatherIcon code={weather.weatherCode} size={72} night={night} />
            </span>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-4 font-mono text-[12px] text-ink-soft tabular-nums">
            {typeof weather.feelsLikeC === "number" && <span>Feels like {weather.feelsLikeC}°</span>}
            {typeof weather.humidity === "number" && <span>Humidity {weather.humidity}%</span>}
          </div>
          {hasRange && (
            <div className="mt-3 max-w-[26rem]">
              <TempRange min={weather.tempMin!} max={weather.tempMax!} now={weather.tempC} />
            </div>
          )}
          <h3 className="font-headline text-2xl md:text-3xl leading-tight mt-6">{words.condition}</h3>
          <p className="font-headline italic text-ink-soft mt-1">{words.quip}</p>
          <p className="font-body text-[16px] leading-relaxed mt-4 max-w-[52ch]">{words.narrative}</p>
        </div>

        <div className="module space-y-6" data-reveal>
          <SunArc sunrise={weather.sunrise} sunset={weather.sunset} clock={clock} />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 pt-5 border-t hairline">
            {typeof weather.humidity === "number" && (
              <Meter label="Humidity" value={weather.humidity} max={100} note={humidityLabel(weather.humidity)} />
            )}
            {night ? (
              <Meter label="Moonlight" value={Math.round(moon.illumination * 100)} max={100} note="% lit" />
            ) : (
              <Meter label="UV index" value={weather.uvIndex} max={11} note={uvLabel(weather.uvIndex)} />
            )}
            <Meter label="AQI" value={weather.aqi} max={300} note={weather.aqiLabel} />
          </div>
        </div>
      </div>
    </section>
  );
}
