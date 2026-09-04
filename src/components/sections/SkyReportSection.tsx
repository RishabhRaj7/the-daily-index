import SettingsLink from "@/components/chrome/SettingsLink";
import type { WeatherNow } from "@/lib/types";
import SectionHeader from "@/components/story/SectionHeader";
import LiveBadge from "@/components/widgets/LiveBadge";
import WeatherIcon from "@/components/widgets/WeatherIcon";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline py-1.5 border-b hairline last:border-b-0">
      <span className="font-label text-[10px] text-ink-soft">{label}</span>
      <span className="font-mono text-sm tabular-nums">{value}</span>
    </div>
  );
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
          <div className="border-l-2 border-masthead-red pl-4 py-1">
            <p className="font-headline text-xl font-semibold leading-tight">
              The observatory didn&rsquo;t answer.
            </p>
            <p className="font-body text-sm text-ink-soft mt-1 leading-relaxed">
              We couldn&rsquo;t fetch conditions for{" "}
              <span className="font-mono">{city || "your home city"}</span> this time. If the city name
              looks off, fix it in{" "}
              <SettingsLink className="text-masthead-red underline underline-offset-2">
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
      <SectionHeader sectionKey="sky-report" />

      <div className="grid md:grid-cols-[1fr_220px] gap-6">
        <div>
          <div className="font-label text-[10px] text-ink-soft mb-2">{weather.city}</div>
          <div className="flex items-center gap-4 mb-3">
            <div className="text-ink shrink-0">
              <WeatherIcon code={weather.weatherCode} size={48} />
            </div>
            <div>
              <h3 className="font-headline text-2xl md:text-3xl font-semibold leading-tight">
                <span className="font-mono font-medium tabular-nums">{weather.tempC}°C</span> —{" "}
                {weather.condition}
              </h3>
              <p className="font-headline italic text-sm text-ink-soft mt-0.5">{weather.quip}</p>
            </div>
          </div>
          <p className="font-body text-[15px] md:text-base leading-relaxed">{weather.narrative}</p>
        </div>

        <div className="border-t-2 border-ink pt-2 h-fit">
          <div className="flex items-center justify-between pb-1">
            <span className="font-label text-[10px] text-ink-soft">Almanac</span>
            {live && <LiveBadge />}
          </div>
          <Row label="Sunrise" value={weather.sunrise} />
          <Row label="Sunset" value={weather.sunset} />
          <Row label="UV index" value={String(weather.uvIndex)} />
          <Row label="Air quality" value={`${weather.aqi} · ${weather.aqiLabel}`} />
        </div>
      </div>
    </section>
  );
}
