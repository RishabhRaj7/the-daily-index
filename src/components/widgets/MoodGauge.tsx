import type { MarketIndex, MarketMood } from "@/lib/types";

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
// reading when the gauge scrolls in; the arc is split into five bands.
export default function MoodGauge({ mood, indices = [] }: { mood: MarketMood; indices?: MarketIndex[] }) {
  const angle = (mood.score / 100) * 180 - 90;
  const bands = 5;
  const r = 42;
  const cx = 50;
  const cy = 52;
  const arc = (i: number) => {
    const a0 = Math.PI + (i / bands) * Math.PI + 0.04;
    const a1 = Math.PI + ((i + 1) / bands) * Math.PI - 0.04;
    return `M ${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)}`;
  };
  const active = Math.min(bands - 1, Math.floor((mood.score / 100) * bands));

  return (
    <div className="module h-full flex flex-col" data-reveal>
      <div className="font-label text-[10px] text-ink-soft mb-4">Market mood</div>
      <svg viewBox="0 0 100 60" className="w-full max-w-[260px] mx-auto block overflow-visible">
        {Array.from({ length: bands }).map((_, i) => (
          <path
            key={i}
            d={arc(i)}
            fill="none"
            stroke={i === active ? "var(--section-hue, var(--accent))" : "var(--rule)"}
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
        <span className="font-display font-extrabold text-[2.6rem] leading-[0.85]">{mood.label}</span>
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
    </div>
  );
}
