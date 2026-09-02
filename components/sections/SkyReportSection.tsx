import type { WeatherNow } from "@/lib/types";
import SectionHeader from "@/components/story/SectionHeader";
import LiveBadge from "@/components/widgets/LiveBadge";
import WeatherIcon from "@/components/widgets/WeatherIcon";

export default function SkyReportSection({
  weather,
  live = false,
}: {
  weather: WeatherNow | null;
  live?: boolean;
}) {
  if (!weather) {
    return (
      <section id="sky-report" className="pb-8">
        <SectionHeader sectionKey="sky-report" />
        <p className="text-sm text-ink-soft italic">Weather data loading…</p>
      </section>
    );
  }

  return (
    <section id="sky-report" className="pb-8">
      <SectionHeader sectionKey="sky-report" />

      <div className="grid md:grid-cols-[1fr_220px] gap-6">
        <div>
          {/* Icon + headline row */}
          <div className="flex items-center gap-4 mb-3">
            <div className="text-ink shrink-0">
              <WeatherIcon code={weather.weatherCode} size={48} />
            </div>
            <div>
              <h3 className="font-headline text-2xl md:text-3xl font-semibold leading-tight">
                {weather.tempC}°C — {weather.condition}
              </h3>
              <p className="text-sm text-ink-soft italic mt-0.5">{weather.quip}</p>
            </div>
          </div>

          {/* Narrative */}
          <p className="text-[15px] md:text-base leading-relaxed">{weather.narrative}</p>
        </div>

        {/* Stats card */}
        <div className="border hairline rounded-sm p-4 bg-card-bg space-y-2 text-sm h-fit">
          {live && (
            <div className="flex justify-end -mt-1 -mb-1">
              <LiveBadge />
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-ink-soft">Sunrise</span>
            <span className="font-mono">{weather.sunrise}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-soft">Sunset</span>
            <span className="font-mono">{weather.sunset}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-soft">UV index</span>
            <span className="font-mono">{weather.uvIndex}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-soft">Air quality</span>
            <span className="font-mono">{weather.aqi} · {weather.aqiLabel}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
