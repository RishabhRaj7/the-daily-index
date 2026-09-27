// A trend line that draws itself when its row scrolls in (see .stroke-draw),
// with a faint area under it and a dot on the latest value.
export default function SparklineChart({
  values,
  positive,
  className = "w-24 h-8",
}: {
  values: number[];
  positive: boolean;
  className?: string;
}) {
  const width = 120;
  const height = 32;
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * width,
    height - 2 - ((v - min) / range) * (height - 4),
  ]);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `0,${height} ${line} ${width},${height}`;
  const color = positive ? "var(--up)" : "var(--down)";
  const [lx, ly] = pts[pts.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`overflow-visible ${className}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Trend, ${positive ? "up" : "down"}`}
    >
      <polygon points={area} fill={color} opacity={0.1} />
      <polyline
        points={line}
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
      <circle cx={lx} cy={ly} r={2.5} fill={color} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
