import type { MarketMood } from "@/lib/types";

// Fear ⇄ greed as a half dial. The needle sweeps up from "fear" to today's
// reading when the gauge scrolls in; the arc is split into five bands.
export default function MoodGauge({ mood }: { mood: MarketMood }) {
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
    <div className="module" data-reveal>
      <div className="font-label text-[10px] text-ink-soft mb-3">Market mood</div>
      <svg viewBox="0 0 100 60" className="w-full max-w-[220px] mx-auto block overflow-visible">
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
      <div className="flex items-end justify-between mt-2">
        <span className="font-display font-extrabold text-[2rem] leading-none">{mood.label}</span>
        <span className="font-mono text-sm text-ink-soft">{mood.score}/100</span>
      </div>
      <dl className="mt-4 space-y-1.5 border-t hairline pt-3">
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
