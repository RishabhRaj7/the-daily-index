"use client";

import { useSyncExternalStore } from "react";
import type { WeatherNow, WireBrief } from "@/lib/types";
import type { TravelState } from "@/lib/travel";
import { clearTravel } from "@/lib/travel";
import SectionHeader from "@/components/story/SectionHeader";
import WeatherIcon from "@/components/widgets/WeatherIcon";
import WeatherBlocks from "@/components/widgets/WeatherBlocks";
import TravelButton from "@/components/extras/TravelButton";
import { cityMinutes, isNight, skyClock } from "@/lib/sky";

// Postcard: travel mode. Printed at the top of the paper while the reader
// is away — the weather where they are, and the news of that city and the
// country (or, travelling inside India, the state) around it. Everything
// here is about the place, so it sits apart from the reader's own sections.

function subscribe(cb: () => void) {
  const id = window.setInterval(cb, 30_000);
  return () => window.clearInterval(id);
}
const now = () => Math.floor(Date.now() / 30_000);

function Headlines({ title, items }: { title: string; items: WireBrief[] }) {
  return (
    <div className="min-w-0">
      <h3 className="font-label text-[11px] pb-3 border-b-2" style={{ borderColor: "var(--section-hue)" }}>
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="font-headline italic text-ink-soft mt-4">Quiet today — nothing in the wires yet.</p>
      ) : (
        <ol className="story-grid">
          {items.map((b, i) => (
            <li key={b.url} className="grid grid-cols-[1.6rem_minmax(0,1fr)] gap-2 !py-3.5" data-reveal style={{ ["--reveal-i" as string]: i }}>
              <span className="font-display font-bold text-[1.3rem] leading-none text-ink-faint">{i + 1}</span>
              <span>
                <a href={b.url} target="_blank" rel="noopener noreferrer" className="group font-headline text-[1.12rem] leading-snug">
                  <span className="headline-link">{b.title}</span>
                </a>
                <span className="block font-mono text-[10px] text-ink-soft mt-1">
                  {b.domain}
                  {b.postedAgo ? ` · ${b.postedAgo}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function PostcardSection({
  travel,
  weather,
  refreshing = false,
}: {
  travel: TravelState;
  weather: WeatherNow | null;
  refreshing?: boolean;
}) {
  const { place } = travel;
  const tick = useSyncExternalStore(subscribe, now, () => null);
  const localTime =
    tick !== null && weather?.utcOffsetSeconds !== undefined
      ? (() => {
          const m = cityMinutes(weather.utcOffsetSeconds, tick * 30_000);
          return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
        })()
      : null;
  const night = weather && tick !== null ? isNight(weather, skyClock(weather, cityMinutes(weather.utcOffsetSeconds, tick * 30_000))) : false;
  const condition = weather ? (night && weather.night ? weather.night.condition : weather.condition) : null;

  return (
    <section id="postcard">
      <SectionHeader
        label="Postcard"
        folio={
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
              <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
            </svg>
            {place.city}
            {refreshing ? " · updating" : ""}
          </>
        }
      />

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-10 items-start">
        {/* Where you are: the place, its clock and its sky. */}
        <div className="space-y-5" data-reveal>
          <div>
            <div className="font-label text-[11px] text-ink-soft">
              From {place.region && place.region !== place.city ? `${place.region}, ` : ""}
              {place.country}
            </div>
            <div className="font-display font-extrabold uppercase text-[clamp(2.6rem,6vw,4rem)] leading-[0.85] mt-2" style={{ color: "var(--section-hue)" }}>
              {place.city}
            </div>
            {localTime && <div className="font-mono text-[12px] text-ink-soft mt-2">Local time {localTime}</div>}
          </div>

          {weather ? (
            <div className="module space-y-4">
              <div className="flex items-center gap-4">
                <span className="font-display font-extrabold text-[4.5rem] leading-[0.8]">{weather.tempC}°</span>
                <span style={{ color: "var(--section-hue)" }}>
                  <WeatherIcon code={weather.weatherCode} size={48} night={night} />
                </span>
                <span className="min-w-0">
                  <span className="block font-headline text-[1.2rem] leading-tight">{condition}</span>
                  <span className="block font-mono text-[11px] text-ink-soft mt-1 tabular-nums">
                    {typeof weather.tempMax === "number" && typeof weather.tempMin === "number"
                      ? `H ${weather.tempMax}° · L ${weather.tempMin}°`
                      : ""}
                    {typeof weather.humidity === "number" ? ` · ${weather.humidity}% hum.` : ""}
                  </span>
                  <span className="block font-mono text-[11px] text-ink-soft tabular-nums">
                    AQI {weather.aqi} {weather.aqiLabel.toLowerCase()}
                  </span>
                </span>
              </div>
              {weather.blocks && weather.blocks.length > 0 && (
                <div className="[&_ol]:!grid-cols-2">
                  <WeatherBlocks blocks={weather.blocks} compact />
                </div>
              )}
            </div>
          ) : (
            <div className="module h-40 animate-pulse" aria-busy="true" />
          )}

          <div className="flex flex-wrap items-start gap-2">
            <TravelButton label="Update location" />
            <button type="button" className="chip" onClick={() => clearTravel()}>
              I&rsquo;m home
            </button>
          </div>
        </div>

        {/* What is happening there. */}
        <div className="grid md:grid-cols-2 gap-x-10 gap-y-12">
          <Headlines title={`In ${place.city}`} items={travel.city} />
          <Headlines title={`Across ${place.wide}`} items={travel.area} />
        </div>
      </div>
    </section>
  );
}
