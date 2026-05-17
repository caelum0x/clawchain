import { View, StyleSheet, TouchableOpacity } from "react-native";
import { ThemedText } from "./ThemedText";
import { useTheme } from "@/hooks/useThemeColor";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { formatAmount, truncateAddress } from "@/constants/chain";
import type { Transaction } from "@/services/chain";

interface TransactionItemProps {
  tx: Transaction;
  onPress?: (tx: Transaction) => void;
}

const TX_ICONS: Record<Transaction["type"], string> = {
  send: "\u2191",      // ↑
  receive: "\u2193",   // ↓
  shield: "\uD83D\uDEE1\uFE0F",    // shield emoji
  unshield: "\uD83D\uDD13",  // unlock emoji
  delegate: "\u2194",  // ↔
  unknown: "\u2022",   // •
};

const TX_LABELS: Record<Transaction["type"], string> = {
  send: "Sent",
  receive: "Received",
  shield: "Shielded",
  unshield: "Unshielded",
  delegate: "Delegated",
  unknown: "Transaction",
};

export function TransactionItem({ tx, onPress }: TransactionItemProps) {
  const { colors } = useTheme();

  const isOutgoing = tx.type === "send" || tx.type === "shield";
  const amountColor = isOutgoing ? Colors.danger : Colors.success;
  const amountPrefix = isOutgoing ? "-" : "+";
  const displayAmount = formatAmount(tx.amount);

  const counterparty =
    tx.type === "send" || tx.type === "shield"
      ? tx.to
        ? truncateAddress(tx.to)
        : "Shielded Pool"
      : tx.from
        ? truncateAddress(tx.from)
        : "Shielded Pool";

  const timeAgo = getTimeAgo(tx.timestamp);

  return (
    <TouchableOpacity
      style={[styles.container, { borderBottomColor: colors.border }]}
      onPress={() => onPress?.(tx)}
      activeOpacity={0.7}
    >
      <View
        style={[
          styles.icon,
          {
            backgroundColor: isOutgoing
              ? "rgba(225, 112, 85, 0.12)"
              : "rgba(0, 184, 148, 0.12)",
          },
        ]}
      >
        <ThemedText style={styles.iconText}>{TX_ICONS[tx.type]}</ThemedText>
      </View>

      <View style={styles.details}>
        <ThemedText style={styles.label}>{TX_LABELS[tx.type]}</ThemedText>
        <ThemedText type="caption" style={{ color: colors.textSecondary }}>
          {counterparty} {"\u00B7"} {timeAgo}
        </ThemedText>
      </View>

      <View style={styles.amountContainer}>
        <ThemedText style={[styles.amount, { color: amountColor }]}>
          {amountPrefix}{displayAmount}
        </ThemedText>
        <ThemedText type="caption" style={{ color: colors.textSecondary }}>
          CLAW
        </ThemedText>
      </View>
    </TouchableOpacity>
  );
}

function getTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm,
  },
  iconText: {
    fontSize: 18,
  },
  details: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  amountContainer: {
    alignItems: "flex-end",
  },
  amount: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
});
