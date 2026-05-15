import { Link } from "react-router-dom";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const navStyle: React.CSSProperties = {
  marginBottom: 16,
  fontSize: 14,
};

const olStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  listStyle: "none",
  margin: 0,
  padding: 0,
  gap: 0,
  flexWrap: "wrap",
};

const separatorStyle: React.CSSProperties = {
  margin: "0 8px",
  color: "var(--text2, #94a3b8)",
  userSelect: "none",
};

const linkStyle: React.CSSProperties = {
  color: "var(--accent, #38bdf8)",
  textDecoration: "none",
};

const currentStyle: React.CSSProperties = {
  color: "var(--text, #e2e8f0)",
  fontWeight: 600,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  const allItems: BreadcrumbItem[] = [{ label: "Home", to: "/" }, ...items];

  return (
    <nav aria-label="Breadcrumb" style={navStyle}>
      <ol style={olStyle}>
        {allItems.map((item, idx) => {
          const isLast = idx === allItems.length - 1;
          return (
            <li key={idx} style={{ display: "flex", alignItems: "center" }}>
              {idx > 0 && <span style={separatorStyle} aria-hidden="true">&gt;</span>}
              {isLast || !item.to ? (
                <span style={currentStyle} aria-current={isLast ? "page" : undefined}>
                  {item.label}
                </span>
              ) : (
                <Link to={item.to} style={linkStyle}>
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
