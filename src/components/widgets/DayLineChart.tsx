import type { DayLine } from "@/lib/types";

// The small line on a market card: the same day as the percentage beside it. The
// dashed line is where the day's move starts, and the colour says which side of it
// the price is on. A quiet day looks quiet: the scale never runs tighter than 0.6%
// of the price. A closed market shows its last session and says which; a line
// that isn't the card's own price (gold and silver, at IBJA's rate) names its source.
const WIDTH = 120;
const HEIGHT = 40;
const MIN_RANGE = 0.006;

export default function DayLineChart({ line, className = "" }: { line?: DayLine; className?: string }) {
  // Nothing yet (an edition printed before these lines): hold the card's shape.
  if (!line || line.points.length < 2) return <div className={`w-full ${className}`} aria-hidden="true" />;
  const { points, base } = line;
  let lo = Math.min(base, ...points);
  let hi = Math.max(base, ...points);
  const least = base * MIN_RANGE;
  if (hi - lo < least) {
    const mid = (hi + lo) / 2;
    lo = mid - least / 2;
    hi = mid + least / 2;
  }
  const x = (i: number) => (i / (points.length - 1)) * WIDTH;
  const y = (v: number) => 2 + ((hi - v) / (hi - lo)) * (HEIGHT - 4);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const up = last >= base;
  const color = up ? "var(--up)" : "var(--down)";
  const pct = Math.abs((last / base - 1) * 100).toFixed(2);
  const caption = [line.closed ? `Closed · ${line.closed}` : null, line.source ? `Line: ${line.source} in ₹` : null].filter(Boolean).join(" · ");
  return (
    <div className="w-full">
      <div className={`relative w-full ${className}`}>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full overflow-visible"
          role="img"
          aria-label={`${line.closed ? "Last session" : "Today"}: ${up ? "up" : "down"} ${pct}% from where it started`}
        >
          <line x1={0} x2={WIDTH} y1={y(base)} y2={y(base)} stroke="var(--ink-faint)" strokeWidth={1} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          <path
            d={d}
            fill="none"
            stroke={color}
            strokeWidth={1.75}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            pathLength={1}
            className="stroke-draw"
            style={{ ["--len" as string]: 1 }}
          />
        </svg>
        {/* In its own element, so the line's stretching can't squash it. */}
        <span
          className="absolute w-[7px] h-[7px] rounded-full -translate-x-1/2 -translate-y-1/2"
          style={{ left: "100%", top: `${(y(last) / HEIGHT) * 100}%`, background: color }}
          aria-hidden="true"
        />
      </div>
      {caption && <span className="block font-mono text-[11px] text-ink-faint mt-1">{caption}</span>}
    </div>
  );
}
