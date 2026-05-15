interface MiniSparklineProps {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}

export default function MiniSparkline({
  values,
  width = 80,
  height = 24,
  color = "var(--accent, #38bdf8)",
}: MiniSparklineProps) {
  if (values.length === 0) {
    return (
      <svg
        data-testid="sparkline"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Sparkline"
      />
    );
  }

  const padY = 2;
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  const xStep = values.length > 1 ? width / (values.length - 1) : width / 2;

  const points = values.map((v, i) => {
    const x = values.length > 1 ? i * xStep : width / 2;
    const y = padY + (height - 2 * padY) - ((v - minVal) / range) * (height - 2 * padY);
    return `${x},${y}`;
  });

  return (
    <svg
      data-testid="sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Sparkline"
    >
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        data-testid="sparkline-line"
      />
    </svg>
  );
}
