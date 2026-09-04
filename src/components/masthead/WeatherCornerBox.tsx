import type { WeatherNow } from "@/lib/types";
import WeatherIcon from "@/components/widgets/WeatherIcon";

export default function WeatherCornerBox({
  weather,
  live = false,
}: {
  weather: WeatherNow;
  live?: boolean;
}) {
  return (
    <div className="border hairline rounded-sm px-3 py-2 text-right flex items-center gap-3">
      <div className="text-ink-soft">
        <WeatherIcon code={weather.weatherCode} size={28} />
      </div>
      <div>
        <div className="font-label text-[10px] text-ink-soft flex items-center justify-end gap-1">
          {live && (
            <span className="w-1.5 h-1.5 rounded-full bg-up inline-block animate-pulse" />
          )}
          {weather.city}
        </div>
        <div className="font-mono text-lg leading-none">{weather.tempC}°C</div>
        <div className="text-xs text-ink-soft">{weather.condition}</div>
      </div>
    </div>
  );
}
