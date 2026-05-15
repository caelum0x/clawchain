import { useState, useCallback } from "react";
import { useChainEvents, type ChainEvent } from "../hooks/useChainEvents.ts";
import { chainConfig } from "../lib/config.ts";
import { shortAddr } from "../lib/chain.ts";

const GPU_EVENT_TYPES = [
  "submit_compute_job",
  "update_job_status",
  "update_gpu_metrics",
  "lease_compute_resource",
  "settle_compute_job",
];

interface RecentEvent {
  id: number;
  type: string;
  height: number;
  summary: string;
  timestamp: number;
}

const MAX_RECENT = 5;
let eventCounter = 0;

function summarizeEvent(event: ChainEvent): string {
  const attrs = event.attributes;
  switch (event.type) {
    case "submit_compute_job": {
      const submitter = attrs.submitter || attrs.sender || "";
      const jobId = attrs.job_id || attrs.jobId || "";
      return `Job #${jobId} submitted${submitter ? ` by ${shortAddr(submitter)}` : ""}`;
    }
    case "update_job_status": {
      const jobId = attrs.job_id || attrs.jobId || "";
      const status = attrs.status || attrs.new_status || "updated";
      return `Job #${jobId} status: ${status}`;
    }
    case "update_gpu_metrics": {
      const provider = attrs.provider || attrs.address || "";
      return `GPU metrics updated${provider ? ` by ${shortAddr(provider)}` : ""}`;
    }
    case "lease_compute_resource": {
      const lessee = attrs.lessee || attrs.sender || "";
      const resourceId = attrs.resource_id || attrs.resourceId || "";
      return `Resource #${resourceId} leased${lessee ? ` by ${shortAddr(lessee)}` : ""}`;
    }
    case "settle_compute_job": {
      const jobId = attrs.job_id || attrs.jobId || "";
      const cost = attrs.cost || attrs.total_cost || "";
      return `Job #${jobId} settled${cost ? ` (${cost})` : ""}`;
    }
    default:
      return `${event.type} at block ${event.height}`;
  }
}

function formatEventType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function eventBadgeClass(type: string): string {
  switch (type) {
    case "submit_compute_job":
      return "info";
    case "lease_compute_resource":
      return "success";
    case "settle_compute_job":
      return "success";
    case "update_job_status":
      return "warning";
    case "update_gpu_metrics":
      return "";
    default:
      return "";
  }
}

interface LiveGPUStatusProps {
  activeLeaseCount?: number;
}

export default function LiveGPUStatus({ activeLeaseCount = 0 }: LiveGPUStatusProps) {
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([]);
  const [providerHeartbeats, setProviderHeartbeats] = useState<Map<string, number>>(new Map());
  const [totalJobsObserved, setTotalJobsObserved] = useState(0);

  const handleEvent = useCallback((event: ChainEvent) => {
    const recent: RecentEvent = {
      id: ++eventCounter,
      type: event.type,
      height: event.height,
      summary: summarizeEvent(event),
      timestamp: Date.now(),
    };

    setRecentEvents((prev) => [recent, ...prev].slice(0, MAX_RECENT));

    if (event.type === "submit_compute_job") {
      setTotalJobsObserved((n) => n + 1);
    }

    if (event.type === "update_gpu_metrics") {
      const provider = event.attributes.provider || event.attributes.address || "";
      if (provider) {
        setProviderHeartbeats((prev) => {
          const next = new Map(prev);
          next.set(provider, Date.now());
          return next;
        });
      }
    }
  }, []);

  // Build RPC URL for WebSocket: strip protocol prefix, use the host.
  const rpcHost = chainConfig.rpcEndpoint
    .replace(/^https?:\/\//, "")
    .replace(/\/?$/, "");

  const { connected } = useChainEvents({
    rpcUrl: rpcHost,
    eventTypes: GPU_EVENT_TYPES,
    onEvent: handleEvent,
    enabled: true,
  });

  const heartbeatProviders = Array.from(providerHeartbeats.entries());
  const now = Date.now();

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>Live GPU Activity</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: connected ? "var(--green)" : "var(--red)",
              boxShadow: connected ? "0 0 6px var(--green)" : "none",
              animation: connected ? "pulse-dot 2s ease-in-out infinite" : "none",
            }}
          />
          <span style={{ fontSize: 12, color: "var(--text2)" }}>
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>
      </div>

      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
        <div style={{
          background: "var(--bg3)", borderRadius: "var(--radius)", padding: "12px 16px",
          border: "1px solid var(--border)",
        }}>
          <div style={{ fontSize: 11, color: "var(--text2)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
            Active Leases
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--accent)" }}>
            {activeLeaseCount}
          </div>
        </div>
        <div style={{
          background: "var(--bg3)", borderRadius: "var(--radius)", padding: "12px 16px",
          border: "1px solid var(--border)",
        }}>
          <div style={{ fontSize: 11, color: "var(--text2)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
            Jobs Observed
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text)" }}>
            {totalJobsObserved}
          </div>
        </div>
        <div style={{
          background: "var(--bg3)", borderRadius: "var(--radius)", padding: "12px 16px",
          border: "1px solid var(--border)",
        }}>
          <div style={{ fontSize: 11, color: "var(--text2)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
            Providers Seen
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text)" }}>
            {heartbeatProviders.length}
          </div>
        </div>
      </div>

      {/* Provider heartbeats */}
      {heartbeatProviders.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 6, fontWeight: 500 }}>
            Provider Heartbeats
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {heartbeatProviders.map(([addr, ts]) => {
              const ago = Math.round((now - ts) / 1000);
              const fresh = ago < 60;
              return (
                <span
                  key={addr}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    background: "var(--bg)", borderRadius: "var(--radius)", padding: "4px 10px",
                    border: "1px solid var(--border)", fontSize: 12,
                  }}
                >
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: fresh ? "var(--green)" : "var(--yellow)",
                  }} />
                  <span className="mono">{shortAddr(addr)}</span>
                  <span style={{ color: "var(--text2)" }}>{ago}s ago</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent events feed */}
      <div>
        <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 6, fontWeight: 500 }}>
          Recent Events
        </div>
        {recentEvents.length === 0 ? (
          <div style={{
            color: "var(--text2)", fontSize: 13, padding: "16px 0", textAlign: "center",
          }}>
            {connected ? "Listening for GPU marketplace events..." : "Waiting for WebSocket connection..."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {recentEvents.map((evt, i) => (
              <div
                key={evt.id}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  background: "var(--bg)", borderRadius: "var(--radius)", padding: "8px 12px",
                  border: "1px solid var(--border)", fontSize: 13,
                  opacity: 1 - i * 0.12,
                  animation: i === 0 ? "event-slide-in 0.3s ease-out" : "none",
                }}
              >
                <span className={`badge ${eventBadgeClass(evt.type)}`} style={{ flexShrink: 0 }}>
                  {formatEventType(evt.type)}
                </span>
                <span style={{ flex: 1 }}>{evt.summary}</span>
                <span style={{ fontSize: 11, color: "var(--text2)", flexShrink: 0 }}>
                  Block {evt.height}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inline keyframes for the pulsing dot and slide-in animation */}
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes event-slide-in {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
