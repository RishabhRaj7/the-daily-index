import type { MarketIndex, MarketMood } from "@/lib/types";
import { moodZone, moodZones } from "@/lib/mood-zones";

/** "30 Sep, 10:33" in the reader's zone. */
function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Today's move per index as bars either side of zero, largest move full width. */
function Movers({ indices }: { indices: MarketIndex[] }) {
  const max = Math.max(...indices.map((i) => Math.abs(i.changePct)), 0.01);
  return (
    <div className="mt-6">
      <div className="font-label text-[9px] text-ink-soft mb-3">Today&rsquo;s moves</div>
      <ul className="space-y-2">
        {indices.map((idx, i) => {
          const up = idx.changePct >= 0;
          const pct = (Math.abs(idx.changePct) / max) * 50;
          return (
            <li key={idx.id} className="grid grid-cols-[5.2rem_minmax(0,1fr)_3.4rem] items-center gap-2 text-[11px]">
              <span className="truncate font-sans text-ink-soft">{idx.name}</span>
              <span className="relative h-2">
                <span className="absolute left-1/2 top-[-3px] bottom-[-3px] w-px bg-rule" />
                <span
                  className="absolute top-0 bottom-0 rounded-full bar-grow"
                  style={{
                    background: up ? "var(--up)" : "var(--down)",
                    width: `${pct}%`,
                    ...(up ? { left: "50%" } : { right: "50%", transformOrigin: "right center" }),
                    ["--bar-i" as string]: i,
                  }}
                />
              </span>
              <span className={`font-mono text-right ${up ? "text-up" : "text-down"}`}>
                {up ? "+" : "−"}
                {Math.abs(idx.changePct).toFixed(2)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Fear ⇄ greed as a half dial. The needle sweeps up from "fear" to today's
// reading when the gauge scrolls in. The arc is split at the publisher's own
// zone cut-offs, and the zone the reading sits in is lit in its colour (red
// for fear through green for greed), so the arc always agrees with the word.
export default function MoodGauge({
  mood,
  indices = [],
  title = "Market mood",
}: {
  mood: MarketMood;
  indices?: MarketIndex[];
  title?: string;
}) {
  const angle = (mood.score / 100) * 180 - 90;
  const zones = moodZones(mood);
  const lit = moodZone(mood);
  const r = 42;
  const cx = 50;
  const cy = 52;
  const arc = (from: number, to: number) => {
    const a0 = Math.PI + (from / 100) * Math.PI + 0.04;
    const a1 = Math.PI + (to / 100) * Math.PI - 0.04;
    return `M ${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)}`;
  };

  return (
    <div className="module h-full flex flex-col" data-reveal>
      <div className="font-label text-[10px] text-ink-soft mb-4">{title}</div>
      <svg viewBox="0 0 100 60" className="w-full max-w-[260px] mx-auto block overflow-visible">
        {zones.map((z) => (
          <path
            key={z.label}
            d={arc(z.from, z.to)}
            fill="none"
            stroke={z === lit ? z.color : "var(--rule)"}
            strokeWidth={7}
            strokeLinecap="round"
          />
        ))}
        <g className="gauge-needle" style={{ ["--needle" as string]: `${angle}deg` }}>
          <line x1={cx} y1={cy} x2={cx} y2={cy - r + 8} stroke="var(--ink)" strokeWidth={2} strokeLinecap="round" />
        </g>
        <circle cx={cx} cy={cy} r={3.5} fill="var(--ink)" />
      </svg>
      <div className="flex items-end justify-between mt-4">
        <span className="font-display font-extrabold text-[2.6rem] leading-[0.85]" style={lit.label === "Neutral" ? undefined : { color: lit.color }}>{mood.label}</span>
        <span className="font-mono text-sm text-ink-soft">{mood.score}/100</span>
      </div>
      <div className="flex justify-between font-label text-[8px] text-ink-faint mt-3">
        <span>Fear</span>
        <span>Neutral</span>
        <span>Greed</span>
      </div>
      {indices.length > 0 && <Movers indices={indices} />}
      <dl className="mt-auto pt-5 space-y-2 border-t hairline">
        {mood.inputs.map((i) => (
          <div key={i.label} className="flex justify-between text-xs gap-2">
            <dt className="text-ink-soft">{i.label}</dt>
            <dd className="font-mono text-right">{i.value}</dd>
          </div>
        ))}
      </dl>
      <p className="font-mono text-[10px] text-ink-faint mt-3 leading-snug">
        {mood.source ? (
          <>
            <a href={mood.source.url} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-ink">
              {mood.source.name}
            </a>
            {when(mood.source.asOf) && ` · ${when(mood.source.asOf)}`}
          </>
        ) : (
          "Our reading: the day's average move, breadth and volatility"
        )}
        {mood.stale && mood.asOf && ` · last read ${when(mood.asOf)}`}
      </p>
    </div>
  );
}
