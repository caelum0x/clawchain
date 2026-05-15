import { useEffect, useRef, useState } from "react";
import { useNotifications, type Notification, type NotificationCategory } from "../hooks/useNotifications.ts";
import { useNotificationPrefs, type NotificationPrefCategory } from "../hooks/useNotificationPrefs.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const CATEGORY_COLORS: Record<NotificationCategory, string> = {
  task: "var(--accent, #38bdf8)",
  message: "var(--purple, #a78bfa)",
  gpu: "var(--green, #4ade80)",
  privacy: "var(--yellow, #fbbf24)",
  transaction: "#60a5fa",
  governance: "#f472b6",
  validator: "#fb923c",
  staking: "#34d399",
};

const CATEGORY_BG: Record<NotificationCategory, string> = {
  task: "rgba(56,189,248,0.12)",
  message: "rgba(167,139,250,0.12)",
  gpu: "rgba(74,222,128,0.12)",
  privacy: "rgba(251,191,36,0.12)",
  transaction: "rgba(96,165,250,0.12)",
  governance: "rgba(244,114,182,0.12)",
  validator: "rgba(251,146,60,0.12)",
  staking: "rgba(52,211,153,0.12)",
};

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  task: "Task",
  message: "Msg",
  gpu: "GPU",
  privacy: "Priv",
  transaction: "Tx",
  governance: "Gov",
  validator: "Val",
  staking: "Stake",
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const bellBtnStyle: React.CSSProperties = {
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 36,
  height: 36,
  borderRadius: "var(--radius, 8px)",
  border: "1px solid var(--border, #334155)",
  background: "transparent",
  color: "var(--text2, #94a3b8)",
  fontSize: 18,
  cursor: "pointer",
  padding: 0,
  flexShrink: 0,
};

const badgeStyle: React.CSSProperties = {
  position: "absolute",
  top: -4,
  right: -4,
  minWidth: 18,
  height: 18,
  borderRadius: 9,
  background: "var(--red, #f87171)",
  color: "#fff",
  fontSize: 11,
  fontWeight: 700,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 5px",
  lineHeight: 1,
  animation: "notification-pulse 2s ease-in-out infinite",
};

const panelStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 8px)",
  right: 0,
  width: 380,
  maxHeight: 480,
  background: "var(--bg2, #111827)",
  border: "1px solid var(--border, #334155)",
  borderRadius: "var(--radius, 8px)",
  boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
  zIndex: 200,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const panelHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 16px",
  borderBottom: "1px solid var(--border, #334155)",
  flexShrink: 0,
};

const panelHeaderTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: "var(--text, #e2e8f0)",
};

const headerBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--accent, #38bdf8)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  padding: "4px 8px",
  borderRadius: 4,
};

const listStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: 0,
  margin: 0,
  listStyle: "none",
};

const itemStyle = (read: boolean): React.CSSProperties => ({
  display: "flex",
  gap: 10,
  padding: "10px 16px",
  borderBottom: "1px solid var(--border, #334155)",
  background: read ? "transparent" : "rgba(56,189,248,0.03)",
  cursor: "pointer",
  alignItems: "flex-start",
  transition: "background 0.12s",
});

const categoryBadgeStyle = (cat: NotificationCategory): React.CSSProperties => ({
  display: "inline-block",
  padding: "2px 6px",
  borderRadius: 4,
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.3px",
  color: CATEGORY_COLORS[cat],
  background: CATEGORY_BG[cat],
  flexShrink: 0,
  marginTop: 2,
});

const itemTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "var(--text, #e2e8f0)",
  lineHeight: 1.3,
};

const itemMsgStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--text2, #94a3b8)",
  lineHeight: 1.4,
  marginTop: 2,
};

const itemTimeStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text2, #94a3b8)",
  marginTop: 3,
  opacity: 0.7,
};

const unreadDotStyle: React.CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: "50%",
  background: "var(--accent, #38bdf8)",
  flexShrink: 0,
  marginTop: 5,
};

const emptyStyle: React.CSSProperties = {
  padding: "40px 16px",
  textAlign: "center",
  color: "var(--text2, #94a3b8)",
  fontSize: 13,
};

// ---------------------------------------------------------------------------
// Bell SVG (inline to avoid external dependencies)
// ---------------------------------------------------------------------------

function BellIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Gear SVG (settings icon)
// ---------------------------------------------------------------------------

function GearIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Settings panel styles
// ---------------------------------------------------------------------------

const settingsPanelStyle: React.CSSProperties = {
  padding: "12px 16px",
  borderBottom: "1px solid var(--border, #334155)",
};

const settingsRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "6px 0",
};

const settingsLabelStyle: React.CSSProperties = {
  fontSize: 13,
  color: "var(--text, #e2e8f0)",
  fontWeight: 500,
};

const CATEGORY_FULL_LABELS: Record<NotificationPrefCategory, string> = {
  task: "Tasks",
  message: "Messages",
  gpu: "GPU Compute",
  privacy: "Privacy",
  transaction: "Transactions",
  governance: "Governance",
  validator: "Validators",
  staking: "Staking",
};

// ---------------------------------------------------------------------------
// Toggle switch sub-component
// ---------------------------------------------------------------------------

function ToggleSwitch({ enabled, onToggle, label }: { enabled: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={enabled}
      aria-label={`Toggle ${label} notifications`}
      onClick={onToggle}
      style={{
        position: "relative",
        width: 36,
        height: 20,
        borderRadius: 10,
        border: "none",
        background: enabled ? "var(--accent, #38bdf8)" : "var(--bg3, #334155)",
        cursor: "pointer",
        padding: 0,
        transition: "background 0.15s",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: enabled ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.15s",
        }}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead, clearAll } =
    useNotifications();
  const { prefs, toggleCategory } = useNotificationPrefs();
  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleItemClick = (n: Notification) => {
    if (!n.read) markRead(n.id);
  };

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-block" }}>
      {/* Bell button */}
      <button
        style={bellBtnStyle}
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span style={badgeStyle}>{unreadCount > 99 ? "99+" : unreadCount}</span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={panelStyle}>
          {/* Header */}
          <div style={panelHeaderStyle}>
            <span style={panelHeaderTitleStyle}>Notifications</span>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <button
                style={headerBtnStyle}
                onClick={() => setShowSettings((v) => !v)}
                aria-label="Notification settings"
                title="Notification settings"
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background =
                    "var(--bg3, #1e293b)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
              >
                <GearIcon />
              </button>
              <button
                style={headerBtnStyle}
                onClick={markAllRead}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background =
                    "var(--bg3, #1e293b)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
              >
                Mark all read
              </button>
              <button
                style={{ ...headerBtnStyle, color: "var(--red, #f87171)" }}
                onClick={clearAll}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background =
                    "var(--bg3, #1e293b)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
              >
                Clear
              </button>
            </div>
          </div>

          {/* Settings panel */}
          {showSettings && (
            <div style={settingsPanelStyle}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text2, #94a3b8)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Category Preferences
              </div>
              {(["task", "message", "gpu", "privacy", "transaction", "governance", "validator", "staking"] as const).map((cat) => (
                <div key={cat} style={settingsRowStyle}>
                  <span style={settingsLabelStyle}>{CATEGORY_FULL_LABELS[cat]}</span>
                  <ToggleSwitch
                    enabled={prefs[cat]}
                    onToggle={() => toggleCategory(cat)}
                    label={CATEGORY_FULL_LABELS[cat]}
                  />
                </div>
              ))}
            </div>
          )}

          {/* List */}
          {(() => {
            const filtered = notifications.filter((n) => prefs[n.category]);
            return filtered.length === 0 ? (
            <div style={emptyStyle}>No notifications yet</div>
          ) : (
            <ul style={listStyle}>
              {filtered.map((n) => (
                <li
                  key={n.id}
                  style={itemStyle(n.read)}
                  onClick={() => handleItemClick(n)}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background =
                      "var(--bg3, #1e293b)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = n.read
                      ? "transparent"
                      : "rgba(56,189,248,0.03)";
                  }}
                >
                  {/* Unread dot */}
                  {!n.read ? (
                    <span style={unreadDotStyle} />
                  ) : (
                    <span style={{ width: 7, flexShrink: 0 }} />
                  )}

                  {/* Category badge */}
                  <span style={categoryBadgeStyle(n.category)}>
                    {CATEGORY_LABELS[n.category]}
                  </span>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={itemTitleStyle}>{n.title}</div>
                    <div style={itemMsgStyle}>{n.message}</div>
                    <div style={itemTimeStyle}>{relativeTime(n.timestamp)}</div>
                  </div>
                </li>
              ))}
            </ul>
          );
          })()}
        </div>
      )}
    </div>
  );
}
