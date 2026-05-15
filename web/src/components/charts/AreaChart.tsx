import { useState, useRef, useCallback } from "react";

export interface AreaChartDatum {
  label: string;
  value: number;
}

interface AreaChartProps {
  data: AreaChartDatum[];
  color?: string;
  height?: number;
  showGrid?: boolean;
}

export default function AreaChart({
  data,
  color = "var(--accent, #38bdf8)",
  height = 200,
  showGrid = true,
}: AreaChartProps) {
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    label: string;
    value: number;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const width = 600;
  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  if (data.length === 0) {
    return (
      <div className="chart-container" data-testid="area-chart">
        <p style={{ color: "var(--text2)", fontSize: 13 }}>No data available</p>
      </div>
    );
  }

  const values = data.map((d) => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;
  const yMin = minVal - range * 0.1;
  const yMax = maxVal + range * 0.1;
  const yRange = yMax - yMin || 1;

  // Y-axis ticks
  const yTickCount = 4;
  const yTicks: number[] = [];
  for (let i = 0; i <= yTickCount; i++) {
    yTicks.push(yMin + (yRange * i) / yTickCount);
  }

  // X positions
  const xStep = data.length > 1 ? chartW / (data.length - 1) : chartW / 2;

  // Map data to SVG points
  const points = data.map((d, i) => {
    const x = padding.left + (data.length > 1 ? i * xStep : chartW / 2);
    const y = padding.top + chartH - ((d.value - yMin) / yRange) * chartH;
    return { x, y, ...d };
  });

  // Line path
  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x},${p.y}`)
    .join(" ");

  // Area path (line + close along bottom)
  const areaPath = [
    `M ${points[0].x},${padding.top + chartH}`,
    `L ${points[0].x},${points[0].y}`,
    ...points.slice(1).map((p) => `L ${p.x},${p.y}`),
    `L ${points[points.length - 1].x},${padding.top + chartH}`,
    "Z",
  ].join(" ");

  // X-axis label stepping
  const maxXLabels = 8;
  const xLabelStep =
    data.length > maxXLabels ? Math.ceil(data.length / maxXLabels) : 1;

  const gradientId = `area-gradient-${Math.random().toString(36).slice(2, 8)}`;

  const formatYLabel = (v: number) => {
    if (Math.abs(v) >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
    if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}K`;
    return v.toFixed(v % 1 === 0 ? 0 : 2);
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current || points.length === 0) return;
      const rect = svgRef.current.getBoundingClientRect();
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

  return (
    <div className="chart-container" data-testid="area-chart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        role="img"
        aria-label="Area chart"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>

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
              fontSize={10}
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
              y={padding.top + chartH + 18}
              textAnchor="middle"
              fontSize={10}
              fill="var(--text2, #94a3b8)"
            >
              {d.label.length > 10 ? d.label.slice(0, 10) + ".." : d.label}
            </text>
          );
        })}

        {/* Gradient fill area */}
        <path
          d={areaPath}
          fill={`url(#${gradientId})`}
          data-testid="area-chart-fill"
        />

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          data-testid="area-chart-line"
        />

        {/* Data point dots */}
        {points.map((p, i) => (
          <circle
            key={`dot-${i}`}
            cx={p.x}
            cy={p.y}
            r={3}
            fill={color}
            data-testid="area-chart-point"
          />
        ))}

        {/* Tooltip */}
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
              x={tooltip.x - 50}
              y={tooltip.y - 32}
              width={100}
              height={24}
              rx={4}
              fill="var(--bg2, #111827)"
              stroke="var(--border, #334155)"
              strokeWidth={1}
              data-testid="area-chart-tooltip"
            />
            <text
              x={tooltip.x}
              y={tooltip.y - 16}
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
