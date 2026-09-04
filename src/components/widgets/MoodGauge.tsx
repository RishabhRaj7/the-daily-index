import type { MarketMood } from "@/lib/types";

export default function MoodGauge({ mood }: { mood: MarketMood }) {
  // semicircle gauge, 0-100 mapped to -90deg..90deg
  const angle = (mood.score / 100) * 180 - 90;
  const radius = 42;
  const cx = 50;
  const cy = 50;
  const needleX = cx + radius * Math.sin((angle * Math.PI) / 180);
  const needleY = cy - radius * Math.cos((angle * Math.PI) / 180);

  return (
    <div className="paper-box">
      <div className="font-label text-[10px] text-ink-soft mb-2">Market Mood</div>
      <svg viewBox="0 0 100 60" className="w-full max-w-[180px]">
        <path
          d="M 8 50 A 42 42 0 0 1 92 50"
          fill="none"
          stroke="var(--rule)"
          strokeWidth={8}
          strokeLinecap="round"
        />
        <line
          x1={cx}
          y1={cy}
          x2={needleX}
          y2={needleY}
          stroke="var(--masthead-red)"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r={3} fill="var(--masthead-red)" />
      </svg>
      <div className="flex items-baseline justify-between mt-1">
        <span className="font-headline text-2xl font-semibold">{mood.label}</span>
        <span className="font-mono text-sm text-ink-soft">{mood.score}/100</span>
      </div>
      <dl className="mt-3 space-y-1">
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
