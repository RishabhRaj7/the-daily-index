import type { WeatherAlert } from "@/lib/types";

// Severe weather near the reader's places, at the top of the Sky Report:
// a watch, alert or warning from the IMD, the Central Water Commission or a
// state authority, via NDMA's Sachet. Nothing prints on a quiet day.

const TONE: Record<string, string> = {
  red: "var(--down)",
  warning: "var(--down)",
  orange: "var(--mood-fear)",
  alert: "var(--mood-fear)",
  watch: "#e0a800",
};

const time = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

export default function WeatherAlerts({ alerts }: { alerts: WeatherAlert[] }) {
  if (alerts.length === 0) return null;
  return (
    <ul className="mb-8 grid gap-2" aria-label="Weather alerts">
      {alerts.map((a) => {
        const tone = TONE[a.severity] ?? "var(--mood-fear)";
        return (
          <li
            key={`${a.place}-${a.type}-${a.area}`}
            className="rounded-xl border px-4 py-3 flex flex-wrap items-baseline gap-x-3 gap-y-1"
            style={{ borderColor: tone, background: `color-mix(in srgb, ${tone} 9%, transparent)` }}
          >
            <span className="font-label text-[10px] font-semibold" style={{ color: tone }}>
              {a.severity === "red" || a.severity === "orange" ? `${a.severity} level` : a.severity} · {a.place}
            </span>
            <span className="font-sans font-semibold text-[14px]">{a.type}</span>
            <span className="font-mono text-[10.5px] text-ink-soft">
              {a.until ? `until ${time(a.until)} IST` : ""}
              {a.source ? ` · ${a.source}` : ""}
            </span>
            {(a.message || a.area) && <span className="basis-full font-sans text-[12.5px] text-ink-soft">{a.message || a.area}</span>}
          </li>
        );
      })}
    </ul>
  );
}
