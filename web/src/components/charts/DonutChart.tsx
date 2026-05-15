import { useState, useCallback } from "react";

export interface DonutChartDatum {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  data: DonutChartDatum[];
  size?: number;
  title?: string;
}

export default function DonutChart({
  data,
  size = 220,
  title,
}: DonutChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const total = data.reduce((s, d) => s + d.value, 0);

  if (data.length === 0 || total === 0) {
    return (
      <div className="chart-container">
        {title && (
          <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>{title}</h4>
        )}
        <p style={{ color: "var(--text2)", fontSize: 13 }}>No data available</p>
      </div>
    );
  }

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 10;
  const innerR = outerR * 0.6;
  const strokeWidth = outerR - innerR;
  const midR = (outerR + innerR) / 2;
  const circumference = 2 * Math.PI * midR;

  // Build segments using stroke-dasharray
  let cumulativeOffset = 0;
  const segments = data.map((d, i) => {
    const fraction = d.value / total;
    const dashLen = fraction * circumference;
    const gapLen = circumference - dashLen;
    const offset = -cumulativeOffset; // negative because dashoffset goes clockwise
    cumulativeOffset += dashLen;

    const isHovered = hoveredIndex === i;
    // For hover expansion, we slightly increase the radius
    const hoverMidR = isHovered ? midR + 4 : midR;
    const hoverCircum = 2 * Math.PI * hoverMidR;
    const hoverDash = fraction * hoverCircum;
    const hoverGap = hoverCircum - hoverDash;

    return {
      ...d,
      fraction,
      dashArray: isHovered
        ? `${hoverDash} ${hoverGap}`
        : `${dashLen} ${gapLen}`,
      dashOffset: isHovered
        ? -(cumulativeOffset - dashLen) * (hoverCircum / circumference)
        : offset,
      radius: isHovered ? hoverMidR : midR,
      strokeW: isHovered ? strokeWidth + 4 : strokeWidth,
      index: i,
    };
  });

  const handleMouseEnter = useCallback((index: number) => {
    setHoveredIndex(index);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredIndex(null);
  }, []);

  const formatTotal = (v: number) => {
    if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
    if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
    return v.toLocaleString();
  };

  return (
    <div className="chart-container">
      {title && (
        <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>{title}</h4>
      )}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <svg
          viewBox={`0 0 ${size} ${size}`}
          width={size}
          height={size}
          style={{ maxWidth: "100%" }}
          role="img"
          aria-label={title ?? "Donut chart"}
        >
          {segments.map((seg) => (
            <circle
              key={`seg-${seg.index}`}
              cx={cx}
              cy={cy}
              r={seg.radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={seg.strokeW}
              strokeDasharray={seg.dashArray}
              strokeDashoffset={seg.dashOffset}
              transform={`rotate(-90, ${cx}, ${cy})`}
              style={{ transition: "all 0.2s ease", cursor: "pointer" }}
              onMouseEnter={() => handleMouseEnter(seg.index)}
              onMouseLeave={handleMouseLeave}
              data-testid="donut-segment"
            />
          ))}
          {/* Center text */}
          <text
            x={cx}
            y={cy - 6}
            textAnchor="middle"
            fontSize={12}
            fill="var(--text2, #94a3b8)"
          >
            Total
          </text>
          <text
            x={cx}
            y={cy + 12}
            textAnchor="middle"
            fontSize={14}
            fontWeight={700}
            fill="var(--text, #e2e8f0)"
          >
            {formatTotal(total)}
          </text>
        </svg>

        {/* Legend */}
        <div className="donut-legend">
          {data.map((d, i) => {
            const pct = ((d.value / total) * 100).toFixed(1);
            return (
              <div
                key={`legend-${i}`}
                className="donut-legend-item"
                data-testid="donut-legend-item"
                onMouseEnter={() => handleMouseEnter(i)}
                onMouseLeave={handleMouseLeave}
                style={{
                  opacity: hoveredIndex !== null && hoveredIndex !== i ? 0.5 : 1,
                  transition: "opacity 0.15s",
                }}
              >
                <span
                  className="donut-legend-dot"
                  style={{ background: d.color }}
                />
                <span>
                  {d.label}: {pct}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
