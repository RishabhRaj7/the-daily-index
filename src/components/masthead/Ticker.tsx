import type { Edition, WeatherNow } from "@/lib/types";

// The signal strip under the masthead: markets, the next Grand Prix and the
// sky, running right to left. Pauses under the pointer. Rendered twice so
// the loop is seamless.

function daysUntil(iso: string): number | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / 86_400_000);
}

export default function Ticker({ edition, weather }: { edition: Edition; weather?: WeatherNow | null }) {
  const items: Array<{ key: string; label: string; value: string; delta?: number }> = [];

  for (const idx of edition.markets.indices) {
    items.push({
      key: idx.id,
      label: idx.name,
      value: idx.level.toLocaleString("en-US", { maximumFractionDigits: 1 }),
      delta: idx.changePct,
    });
  }
  const next = edition.f1?.nextRace;
  if (next) {
    const d = daysUntil(next.date);
    items.push({
      key: "f1",
      label: next.name.replace(/Grand Prix/i, "GP"),
      value: d === null ? next.country : d <= 0 ? "race week" : `in ${d} day${d === 1 ? "" : "s"}`,
    });
  }
  const w = weather ?? edition.weather;
  if (w) items.push({ key: "wx", label: w.city, value: `${w.tempC}° ${w.condition}` });
  if (edition.wordOfDay?.word) items.push({ key: "wotd", label: "Word", value: edition.wordOfDay.word });

  if (items.length === 0) return null;

  const run = (copy: number) =>
    items.map((it) => (
      <span key={`${copy}-${it.key}`} className="inline-flex items-center gap-2 px-5" aria-hidden={copy > 0}>
        <span className="font-label text-[10px] opacity-70">{it.label}</span>
        <span className="font-mono text-[12px] font-medium">{it.value}</span>
        {it.delta !== undefined && (
          <span className="font-mono text-[12px] font-semibold">
            {it.delta >= 0 ? "▲" : "▼"} {Math.abs(it.delta).toFixed(2)}%
          </span>
        )}
        <span className="w-1 h-1 rounded-full bg-current opacity-40 ml-5" />
      </span>
    ));

  return (
    <div className="bg-signal text-signal-ink overflow-hidden select-none" role="marquee" aria-label="Today at a glance">
      <div className="marquee-track flex w-max py-2">
        {run(0)}
        {run(1)}
      </div>
    </div>
  );
}
