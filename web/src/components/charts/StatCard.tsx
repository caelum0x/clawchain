interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: "up" | "down" | "flat";
  trendValue?: string;
}

export default function StatCard({
  title,
  value,
  subtitle,
  trend,
  trendValue,
}: StatCardProps) {
  const trendArrow =
    trend === "up" ? "\u2191" : trend === "down" ? "\u2193" : trend === "flat" ? "\u2192" : "";

  return (
    <div className="stat-card" data-testid="stat-card">
      <div className="stat-title" data-testid="stat-title">{title}</div>
      <div className="stat-value" data-testid="stat-value">{value}</div>
      {subtitle && (
        <div style={{ fontSize: "0.8rem", color: "var(--text2)", marginTop: 2 }}>
          {subtitle}
        </div>
      )}
      {trend && trendValue && (
        <div className={`stat-trend ${trend}`}>
          {trendArrow} {trendValue}
        </div>
      )}
    </div>
  );
}
