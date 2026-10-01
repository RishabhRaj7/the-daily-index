// A week of one chance as a small line, with a dot on today. The fill
// under it fades out, so a row of them reads as a texture, not a chart.

export default function Spark({
  points,
  width = 96,
  height = 30,
  color = "var(--section-hue)",
  className = "",
}: {
  points?: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}) {
  if (!points || points.length < 3) return <span className={className} style={{ width, height, display: "inline-block" }} aria-hidden="true" />;
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  // At least ten points of range, so a flat week looks flat.
  const span = Math.max(hi - lo, 10);
  const mid = (hi + lo) / 2;
  const y = (p: number) => height - 3 - ((p - (mid - span / 2)) / span) * (height - 6);
  const x = (i: number) => (i / (points.length - 1)) * (width - 4) + 1;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p).toFixed(1)}`).join(" ");
  const id = `spark-${Math.round(points[0] * 10)}-${points.length}-${Math.round(points[points.length - 1] * 10)}`;
  const last = points[points.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={`overflow-visible ${className}`} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${x(points.length - 1)} ${height} L${x(0)} ${height} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(points.length - 1)} cy={y(last)} r={2.4} fill={color} />
    </svg>
  );
}
