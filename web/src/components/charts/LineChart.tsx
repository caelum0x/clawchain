import { useState, useRef, useCallback } from "react";

export interface LineChartDatum {
  label: string;
  value: number;
}

interface LineChartProps {
  data: LineChartDatum[];
  width?: number;
  height?: number;
  color?: string;
  showGrid?: boolean;
  title?: string;
}

export default function LineChart({
  data,
  width = 600,
  height = 300,
  color = "var(--accent, #38bdf8)",
  showGrid = true,
  title,
}: LineChartProps) {
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    label: string;
    value: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const padding = { top: 30, right: 20, bottom: 50, left: 55 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  if (data.length === 0) {
    return (
      <div className="chart-container" ref={containerRef}>
        {title && (
          <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>{title}</h4>
        )}
        <p style={{ color: "var(--text2)", fontSize: 13 }}>No data available</p>
      </div>
    );
  }

  const values = data.map((d) => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;
  // Add 10% padding to y-axis
  const yMin = minVal - range * 0.1;
  const yMax = maxVal + range * 0.1;
  const yRange = yMax - yMin || 1;

  // Generate y-axis tick values
  const yTickCount = 5;
  const yTicks: number[] = [];
  for (let i = 0; i <= yTickCount; i++) {
    yTicks.push(yMin + (yRange * i) / yTickCount);
  }

  // X positions
  const xStep = data.length > 1 ? chartW / (data.length - 1) : chartW / 2;

  // Map data to points
  const points = data.map((d, i) => {
    const x = padding.left + (data.length > 1 ? i * xStep : chartW / 2);
    const y =
      padding.top + chartH - ((d.value - yMin) / yRange) * chartH;
    return { x, y, ...d };
  });

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  // Area path (fill under the line)
  const areaPath = [
    `M ${points[0].x},${padding.top + chartH}`,
    `L ${points[0].x},${points[0].y}`,
    ...points.slice(1).map((p) => `L ${p.x},${p.y}`),
    `L ${points[points.length - 1].x},${padding.top + chartH}`,
    "Z",
  ].join(" ");

  // Show fewer x-axis labels if many data points
  const maxXLabels = 10;
  const xLabelStep =
    data.length > maxXLabels ? Math.ceil(data.length / maxXLabels) : 1;
  const rotateLabels = data.length > 6;

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!containerRef.current || points.length === 0) return;
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const scaleX = width / rect.width;
      const mouseX = (e.clientX - rect.left) * scaleX;

      // Find closest point
      let closest = points[0];
      let minDist = Math.abs(mouseX - closest.x);
      for (let i = 1; i < points.length; i++) {
        const dist = Math.abs(mouseX - points[i].x);
        if (dist < minDist) {
          minDist = dist;
          closest = points[i];
        }
      }

      setTooltip({
        x: closest.x,
        y: closest.y,
        label: closest.label,
        value: closest.value,
      });
    },
    [points, width],
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  const formatYLabel = (v: number) => {
    if (Math.abs(v) >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
    if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}K`;
    return v.toFixed(v % 1 === 0 ? 0 : 2);
  };

  return (
    <div className="chart-container" ref={containerRef}>
      {title && (
        <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>{title}</h4>
      )}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        role="img"
        aria-label={title ?? "Line chart"}
      >
        {/* Grid lines */}
        {showGrid &&
          yTicks.map((tick, i) => {
            const y =
              padding.top + chartH - ((tick - yMin) / yRange) * chartH;
            return (
              <line
                key={`grid-${i}`}
                x1={padding.left}
                y1={y}
                x2={padding.left + chartW}
                y2={y}
                stroke="var(--border, #334155)"
                strokeWidth={0.5}
                strokeDasharray="4,4"
              />
            );
          })}

        {/* Y-axis labels */}
        {yTicks.map((tick, i) => {
          const y =
            padding.top + chartH - ((tick - yMin) / yRange) * chartH;
          return (
            <text
              key={`ytick-${i}`}
              x={padding.left - 8}
              y={y + 4}
              textAnchor="end"
              fontSize={11}
              fill="var(--text2, #94a3b8)"
            >
              {formatYLabel(tick)}
            </text>
          );
        })}

        {/* X-axis labels */}
        {data.map((d, i) => {
          if (i % xLabelStep !== 0) return null;
          const x = padding.left + (data.length > 1 ? i * xStep : chartW / 2);
          return (
            <text
              key={`xlabel-${i}`}
              x={x}
              y={padding.top + chartH + (rotateLabels ? 20 : 18)}
              textAnchor={rotateLabels ? "end" : "middle"}
              fontSize={10}
              fill="var(--text2, #94a3b8)"
              transform={
                rotateLabels
                  ? `rotate(-35, ${x}, ${padding.top + chartH + 20})`
                  : undefined
              }
            >
              {d.label.length > 12 ? d.label.slice(0, 12) + "..." : d.label}
            </text>
          );
        })}

        {/* Area fill */}
        <path d={areaPath} fill={color} opacity={0.12} />

        {/* Line */}
        <polyline
          points={polylinePoints}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Data point dots */}
        {points.map((p, i) => (
          <circle
            key={`dot-${i}`}
            cx={p.x}
            cy={p.y}
            r={3}
            fill={color}
            data-testid="line-chart-point"
          />
        ))}

        {/* Tooltip crosshair + highlight */}
        {tooltip && (
          <>
            <line
              x1={tooltip.x}
              y1={padding.top}
              x2={tooltip.x}
              y2={padding.top + chartH}
              stroke="var(--text2, #94a3b8)"
              strokeWidth={1}
              strokeDasharray="3,3"
              opacity={0.5}
            />
            <circle cx={tooltip.x} cy={tooltip.y} r={5} fill={color} />
            <rect
              x={tooltip.x - 45}
              y={tooltip.y - 30}
              width={90}
              height={22}
              rx={4}
              fill="var(--bg2, #111827)"
              stroke="var(--border, #334155)"
              strokeWidth={1}
            />
            <text
              x={tooltip.x}
              y={tooltip.y - 15}
              textAnchor="middle"
              fontSize={11}
              fill="var(--text, #e2e8f0)"
              fontWeight={600}
            >
              {tooltip.label}: {tooltip.value.toFixed(2)}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}
