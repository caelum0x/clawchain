import { useState, useCallback } from "react";

export interface BarChartDatum {
  label: string;
  value: number;
  color?: string;
}

interface BarChartProps {
  data: BarChartDatum[];
  width?: number;
  height?: number;
  title?: string;
}

export default function BarChart({
  data,
  width = 600,
  height = 300,
  title,
}: BarChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const padding = { top: 30, right: 20, bottom: 50, left: 55 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  if (data.length === 0) {
    return (
      <div className="chart-container">
        {title && (
          <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>{title}</h4>
        )}
        <p style={{ color: "var(--text2)", fontSize: 13 }}>No data available</p>
      </div>
    );
  }

  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const yMax = maxVal * 1.15; // leave room for labels above bars

  // Y-axis ticks
  const yTickCount = 5;
  const yTicks: number[] = [];
  for (let i = 0; i <= yTickCount; i++) {
    yTicks.push((yMax * i) / yTickCount);
  }

  const barGap = Math.max(4, chartW * 0.02);
  const barWidth = (chartW - barGap * (data.length + 1)) / data.length;
  const effectiveBarWidth = Math.min(barWidth, 60);
  const totalBarSpace =
    effectiveBarWidth * data.length + barGap * (data.length + 1);
  const xOffset = padding.left + (chartW - totalBarSpace) / 2 + barGap;

  const defaultColor = "var(--accent, #38bdf8)";

  const formatYLabel = (v: number) => {
    if (Math.abs(v) >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
    if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}K`;
    return v.toFixed(v % 1 === 0 ? 0 : 1);
  };

  const handleMouseEnter = useCallback((index: number) => {
    setHoveredIndex(index);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredIndex(null);
  }, []);

  return (
    <div className="chart-container">
      {title && (
        <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>{title}</h4>
      )}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={title ?? "Bar chart"}
      >
        {/* Grid lines */}
        {yTicks.map((tick, i) => {
          const y = padding.top + chartH - (tick / yMax) * chartH;
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
          const y = padding.top + chartH - (tick / yMax) * chartH;
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

        {/* Bars */}
        {data.map((d, i) => {
          const barH = (d.value / yMax) * chartH;
          const x = xOffset + i * (effectiveBarWidth + barGap);
          const y = padding.top + chartH - barH;
          const isHovered = hoveredIndex === i;
          const barColor = d.color || defaultColor;

          return (
            <g
              key={`bar-${i}`}
              onMouseEnter={() => handleMouseEnter(i)}
              onMouseLeave={handleMouseLeave}
              data-testid="bar-chart-bar"
            >
              {/* Bar */}
              <rect
                x={x}
                y={y}
                width={effectiveBarWidth}
                height={barH}
                rx={3}
                fill={barColor}
                opacity={isHovered ? 1 : 0.85}
                style={{ transition: "opacity 0.15s" }}
              />

              {/* Value label above bar */}
              <text
                x={x + effectiveBarWidth / 2}
                y={y - 6}
                textAnchor="middle"
                fontSize={10}
                fill="var(--text, #e2e8f0)"
                fontWeight={isHovered ? 700 : 500}
                opacity={isHovered ? 1 : 0.7}
              >
                {formatYLabel(d.value)}
              </text>

              {/* X-axis label */}
              <text
                x={x + effectiveBarWidth / 2}
                y={padding.top + chartH + 16}
                textAnchor="middle"
                fontSize={10}
                fill="var(--text2, #94a3b8)"
                fontWeight={isHovered ? 600 : 400}
              >
                {d.label.length > 8 ? d.label.slice(0, 8) + ".." : d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
