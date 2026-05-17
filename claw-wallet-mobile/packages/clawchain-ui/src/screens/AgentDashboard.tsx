/**
 * AgentDashboard — View registered agents, their status, and rewards.
 *
 * Displays a list of live agents from the ClawChain agent module with
 * status badges, capabilities, and task/reward statistics.
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { clawchainApi, type AgentInfo } from "../services/clawchain-api.js";

const COLORS = {
  primary: "#6C5CE7",
  success: "#00B894",
  warning: "#FDCB6E",
  danger: "#E17055",
  accent: "#00D2FF",
  textDark: "#1A1A2E",
  textLight: "#ECEDEE",
  textSecondary: "#9BA1A6",
  cardDark: "#1A1A2E",
  cardLight: "#FFFFFF",
  bgDark: "#0F0F1A",
  bgLight: "#F8F9FA",
  borderDark: "#2D2D44",
  borderLight: "#E1E8ED",
};

const STATUS_ICON: Record<string, string> = {
  active: "\u2705",
  inactive: "\u26AA",
  jailed: "\u274C",
};

interface AgentDashboardProps {
  colorScheme?: "light" | "dark";
}

export function AgentDashboard({ colorScheme = "dark" }: AgentDashboardProps) {
  const isDark = colorScheme === "dark";
  const bg = isDark ? COLORS.bgDark : COLORS.bgLight;
  const cardBg = isDark ? COLORS.cardDark : COLORS.cardLight;
  const textColor = isDark ? COLORS.textLight : COLORS.textDark;
  const secondaryText = COLORS.textSecondary;
  const borderColor = isDark ? COLORS.borderDark : COLORS.borderLight;

  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await clawchainApi.getAgents();
      if (mountedRef.current) setAgents(result);
    } catch {
      // Keep existing data on error
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  const totalRewards = agents.reduce(
    (sum, a) => sum + (parseInt(a.rewardsEarned, 10) || 0),
    0
  );
  const activeCount = agents.filter((a) => a.status === "active").length;

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refresh} />
        }
      >
        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
            <Text style={[styles.statValue, { color: COLORS.primary }]}>
              {agents.length}
            </Text>
            <Text style={[styles.statLabel, { color: secondaryText }]}>
              Total Agents
            </Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
            <Text style={[styles.statValue, { color: COLORS.success }]}>
              {activeCount}
            </Text>
            <Text style={[styles.statLabel, { color: secondaryText }]}>
              Active
            </Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
            <Text style={[styles.statValue, { color: COLORS.accent }]}>
              {formatClaw(String(totalRewards))}
            </Text>
            <Text style={[styles.statLabel, { color: secondaryText }]}>
              Total Rewards
            </Text>
          </View>
        </View>

        {/* Agent List */}
        {agents.length === 0 && !isLoading && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>&#x1F916;</Text>
            <Text style={[styles.emptyTitle, { color: textColor }]}>
              No Agents Registered
            </Text>
            <Text style={[styles.emptySubtitle, { color: secondaryText }]}>
              Register an agent to participate in the ClawChain agent economy.
            </Text>
          </View>
        )}

        {agents.map((agent) => (
          <View
            key={agent.address}
            style={[styles.card, { backgroundColor: cardBg, borderColor }]}
          >
            <View style={styles.cardHeader}>
              <View style={styles.agentNameRow}>
                <Text style={{ fontSize: 16, marginRight: 6 }}>
                  {STATUS_ICON[agent.status] ?? STATUS_ICON.inactive}
                </Text>
                <Text style={[styles.agentName, { color: textColor }]}>
                  {agent.name || "Unnamed Agent"}
                </Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor:
                      agent.status === "active"
                        ? COLORS.success + "1A"
                        : COLORS.textSecondary + "1A",
                  },
                ]}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color:
                      agent.status === "active"
                        ? COLORS.success
                        : COLORS.textSecondary,
                  }}
                >
                  {agent.status.toUpperCase()}
                </Text>
              </View>
            </View>

            <Text
              style={[styles.addressText, { color: secondaryText }]}
              numberOfLines={1}
            >
              {agent.address}
            </Text>

            {agent.capabilities.length > 0 && (
              <View style={styles.capsRow}>
                {agent.capabilities.map((cap) => (
                  <View
                    key={cap}
                    style={[styles.capBadge, { borderColor }]}
                  >
                    <Text style={[styles.capText, { color: secondaryText }]}>
                      {cap}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.agentStats}>
              <View style={styles.agentStat}>
                <Text style={[styles.agentStatValue, { color: textColor }]}>
                  {agent.tasksCompleted}
                </Text>
                <Text style={[styles.agentStatLabel, { color: secondaryText }]}>
                  Tasks
                </Text>
              </View>
              <View style={styles.agentStat}>
                <Text style={[styles.agentStatValue, { color: textColor }]}>
                  {formatClaw(agent.rewardsEarned)} CLAW
                </Text>
                <Text style={[styles.agentStatLabel, { color: secondaryText }]}>
                  Earned
                </Text>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function formatClaw(uclaw: string): string {
  const num = parseInt(uclaw, 10);
  if (isNaN(num)) return "0";
  const value = num / 1_000_000;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(2);
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 32 },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  statCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    alignItems: "center",
  },
  statValue: { fontSize: 20, fontWeight: "700", marginBottom: 2 },
  statLabel: { fontSize: 11, fontWeight: "500" },
  emptyState: { alignItems: "center", paddingVertical: 48 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: "600", marginBottom: 4 },
  emptySubtitle: { fontSize: 14, textAlign: "center", paddingHorizontal: 32 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  agentNameRow: { flexDirection: "row", alignItems: "center", flex: 1 },
  agentName: { fontSize: 16, fontWeight: "600" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  addressText: { fontSize: 12, fontFamily: "monospace", marginBottom: 8 },
  capsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  capBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  capText: { fontSize: 11, fontWeight: "500" },
  agentStats: { flexDirection: "row", gap: 16 },
  agentStat: {},
  agentStatValue: { fontSize: 14, fontWeight: "600" },
  agentStatLabel: { fontSize: 11 },
});
