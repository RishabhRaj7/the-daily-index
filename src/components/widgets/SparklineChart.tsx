export default function SparklineChart({
  values,
  positive,
}: {
  values: number[];
  positive: boolean;
}) {
  const width = 120;
  const height = 32;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible w-20 h-6"
      preserveAspectRatio="none"
      role="img"
      aria-label={`7-day trend, ${positive ? "up" : "down"}`}
    >
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={positive ? "var(--up)" : "var(--down)"}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
