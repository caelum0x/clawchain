/**
 * TaskManager — Browse and manage agent tasks.
 *
 * Displays tabs for "My Tasks", "Available", and "Active" tasks with
 * actions to accept and complete tasks. Uses the agent module REST API.
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Platform,
} from "react-native";
import { clawchainApi } from "../services/clawchain-api.js";

const COLORS = {
  primary: "#6C5CE7",
  accent: "#00D2FF",
  success: "#00B894",
  warning: "#FDCB6E",
  danger: "#E17055",
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

type TaskTab = "my" | "available" | "active";

interface TaskInfo {
  id: string;
  title: string;
  description: string;
  status: string;
  delegator: string;
  assignee: string;
  reward: string;
  createdAt: string;
}

const TAB_CONFIG: { label: string; value: TaskTab }[] = [
  { label: "My Tasks", value: "my" },
  { label: "Available", value: "available" },
  { label: "Active", value: "active" },
];

interface TaskManagerProps {
  address?: string | null;
  colorScheme?: "light" | "dark";
}

export function TaskManager({ address, colorScheme = "dark" }: TaskManagerProps) {
  const isDark = colorScheme === "dark";
  const bg = isDark ? COLORS.bgDark : COLORS.bgLight;
  const cardBg = isDark ? COLORS.cardDark : COLORS.cardLight;
  const textColor = isDark ? COLORS.textLight : COLORS.textDark;
  const secondaryText = COLORS.textSecondary;
  const borderColor = isDark ? COLORS.borderDark : COLORS.borderLight;

  const [tab, setTab] = useState<TaskTab>("available");
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const mountedRef = useRef(true);

  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      // In a full implementation, this would call different endpoints per tab.
      // For now, we query the agent endpoint for task data.
      const config = clawchainApi.getConfig();
      let url = `${config.rest}/clawchain/agent/v1/tasks`;
      if (tab === "my" && address) {
        url = `${config.rest}/clawchain/agent/v1/tasks_by_assignee/${address}`;
      } else if (tab === "active") {
        url += "?status=active";
      }
      const res = await fetch(url);
      if (!res.ok) {
        if (mountedRef.current) setTasks([]);
        return;
      }
      const data = await res.json();
      const raw = data.tasks ?? [];
      if (mountedRef.current) {
        setTasks(
          raw.map((t: Record<string, unknown>) => ({
            id: String(t.id ?? t.task_id ?? "0"),
            title: String(t.title ?? t.description ?? "Task"),
            description: String(t.description ?? ""),
            status: String(t.status ?? "pending"),
            delegator: String(t.delegator ?? ""),
            assignee: String(t.assignee ?? ""),
            reward: String(t.reward ?? "0"),
            createdAt: String(t.created_at ?? ""),
          }))
        );
      }
    } catch {
      if (mountedRef.current) setTasks([]);
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [tab, address]);

  useEffect(() => {
    mountedRef.current = true;
    fetchTasks();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchTasks]);

  const handleAcceptTask = (taskId: string) => {
    showAlert(
      "Accept Task",
      `Task #${taskId} accepted (simulated). In production this sends MsgAcceptTask.`
    );
  };

  const handleCompleteTask = (taskId: string) => {
    showAlert(
      "Complete Task",
      `Task #${taskId} marked complete (simulated). In production this sends MsgCompleteTask.`
    );
  };

  const statusColor = (status: string): string => {
    if (status === "completed") return COLORS.success;
    if (status === "active") return COLORS.accent;
    if (status === "pending") return COLORS.warning;
    if (status === "failed") return COLORS.danger;
    return COLORS.textSecondary;
  };

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      {/* Tab bar */}
      <View style={styles.tabRow}>
        {TAB_CONFIG.map((t) => (
          <TouchableOpacity
            key={t.value}
            style={[
              styles.tabButton,
              {
                backgroundColor: tab === t.value ? COLORS.primary : "transparent",
                borderColor: tab === t.value ? COLORS.primary : borderColor,
              },
            ]}
            onPress={() => setTab(t.value)}
            activeOpacity={0.7}
          >
            <Text
              style={{
                color: tab === t.value ? "#FFFFFF" : secondaryText,
                fontSize: 13,
                fontWeight: "600",
              }}
            >
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={fetchTasks} />
        }
      >
        {tasks.length === 0 && !isLoading && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>&#x1F4CB;</Text>
            <Text style={[styles.emptyTitle, { color: textColor }]}>
              No Tasks
            </Text>
            <Text style={[styles.emptySubtitle, { color: secondaryText }]}>
              {tab === "my"
                ? "You have no assigned tasks."
                : tab === "available"
                  ? "No tasks are currently available."
                  : "No active tasks found."}
            </Text>
          </View>
        )}

        {tasks.map((task) => (
          <View
            key={task.id}
            style={[styles.card, { backgroundColor: cardBg, borderColor }]}
          >
            <View style={styles.cardHeader}>
              <Text style={[styles.taskId, { color: secondaryText }]}>
                #{task.id}
              </Text>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: statusColor(task.status) + "1A" },
                ]}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: statusColor(task.status),
                  }}
                >
                  {task.status.toUpperCase()}
                </Text>
              </View>
            </View>

            <Text style={[styles.taskTitle, { color: textColor }]}>
              {task.title}
            </Text>
            {task.description && task.description !== task.title && (
              <Text
                style={[styles.taskDesc, { color: secondaryText }]}
                numberOfLines={2}
              >
                {task.description}
              </Text>
            )}

            <View style={styles.metaRow}>
              <Text style={[styles.metaText, { color: secondaryText }]}>
                Reward: {formatClaw(task.reward)} CLAW
              </Text>
              {task.delegator && (
                <Text style={[styles.metaText, { color: secondaryText }]}>
                  By: {truncate(task.delegator)}
                </Text>
              )}
            </View>

            {/* Actions */}
            {tab === "available" && task.status === "pending" && (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: COLORS.success + "1A" }]}
                onPress={() => handleAcceptTask(task.id)}
                activeOpacity={0.7}
              >
                <Text style={{ color: COLORS.success, fontWeight: "600", fontSize: 14 }}>
                  Accept Task
                </Text>
              </TouchableOpacity>
            )}
            {tab === "my" && task.status === "active" && (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: COLORS.primary + "1A" }]}
                onPress={() => handleCompleteTask(task.id)}
                activeOpacity={0.7}
              >
                <Text style={{ color: COLORS.primary, fontWeight: "600", fontSize: 14 }}>
                  Mark Complete
                </Text>
              </TouchableOpacity>
            )}
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
  return value.toFixed(2);
}

function truncate(addr: string): string {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 10)}...${addr.slice(-4)}`;
}

function showAlert(title: string, message: string): void {
  if (Platform.OS === "web") {
    globalThis.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 8,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  scroll: { padding: 16, paddingBottom: 32 },
  emptyState: { alignItems: "center", paddingVertical: 48 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: "600", marginBottom: 4 },
  emptySubtitle: { fontSize: 14, textAlign: "center", paddingHorizontal: 32 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  taskId: { fontSize: 13, fontWeight: "500" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  taskTitle: { fontSize: 16, fontWeight: "600", marginBottom: 4 },
  taskDesc: { fontSize: 13, lineHeight: 18, marginBottom: 8 },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  metaText: { fontSize: 12 },
  actionButton: {
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 4,
  },
});
