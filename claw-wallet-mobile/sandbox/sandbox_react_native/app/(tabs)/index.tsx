import { useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { TransactionItem } from "@/components/TransactionItem";
import { useWallet } from "@/contexts/WalletContext";
import { useTheme } from "@/hooks/useThemeColor";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { truncateAddress, CHAIN_CONFIG } from "@/constants/chain";

export default function HomeScreen() {
  const {
    account,
    balance,
    shieldedBalance,
    transactions,
    refreshBalance,
    refreshTransactions,
    isLoading,
  } = useWallet();
  const { colors } = useTheme();
  const router = useRouter();

  const onRefresh = useCallback(async () => {
    await Promise.all([refreshBalance(), refreshTransactions()]);
  }, [refreshBalance, refreshTransactions]);

  const recentTxs = transactions.slice(0, 5);

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} />
        }
      >
        {/* Balance Card */}
        <Card style={styles.balanceCard}>
          <ThemedText type="caption" style={{ color: colors.textSecondary }}>
            Total Balance
          </ThemedText>
          <View style={styles.balanceRow}>
            <ThemedText style={styles.balanceAmount}>{balance}</ThemedText>
            <ThemedText style={[styles.balanceDenom, { color: Colors.primary }]}>
              {CHAIN_CONFIG.displayDenom}
            </ThemedText>
          </View>
          {account && (
            <ThemedText
              type="mono"
              style={[styles.address, { color: colors.textSecondary }]}
            >
              {truncateAddress(account.address)}
            </ThemedText>
          )}
        </Card>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <QuickAction
            icon={"\u2191"}
            label="Send"
            color={Colors.primary}
            onPress={() => router.push("/(tabs)/send" as any)}
          />
          <QuickAction
            icon={"\u2193"}
            label="Receive"
            color={Colors.success}
            onPress={() => router.push("/(tabs)/receive" as any)}
          />
          <QuickAction
            icon={"\uD83D\uDEE1\uFE0F"}
            label="Shield"
            color={Colors.accent}
            onPress={() => router.push("/(tabs)/privacy" as any)}
          />
        </View>

        {/* Shielded Balance */}
        <Card style={styles.shieldedCard}>
          <View style={styles.shieldedRow}>
            <View>
              <ThemedText type="caption" style={{ color: colors.textSecondary }}>
                Shielded Balance
              </ThemedText>
              <View style={styles.balanceRow}>
                <ThemedText style={styles.shieldedAmount}>
                  {shieldedBalance}
                </ThemedText>
                <ThemedText
                  style={[styles.shieldedDenom, { color: Colors.accent }]}
                >
                  CLAW
                </ThemedText>
              </View>
            </View>
            <View style={styles.privacyBadge}>
              <ThemedText style={styles.privacyBadgeText}>ZK</ThemedText>
            </View>
          </View>
        </Card>

        {/* Recent Transactions */}
        <View style={styles.sectionHeader}>
          <ThemedText type="subtitle">Recent Activity</ThemedText>
          {transactions.length > 5 && (
            <TouchableOpacity onPress={() => router.push("/history" as any)}>
              <ThemedText style={{ color: Colors.primary, fontWeight: "600" }}>
                See All
              </ThemedText>
            </TouchableOpacity>
          )}
        </View>

        <Card padding={0}>
          {recentTxs.length > 0 ? (
            <View style={{ paddingHorizontal: Spacing.md }}>
              {recentTxs.map((tx) => (
                <TransactionItem key={tx.hash} tx={tx} />
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <ThemedText
                type="caption"
                style={{ color: colors.textSecondary, textAlign: "center" }}
              >
                No transactions yet.{"\n"}Send or receive CLAW to get started.
              </ThemedText>
            </View>
          )}
        </Card>
      </ScrollView>
    </ThemedView>
  );
}

function QuickAction({
  icon,
  label,
  color,
  onPress,
}: {
  icon: string;
  label: string;
  color: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity style={styles.quickAction} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.quickActionIcon, { backgroundColor: color + "1A" }]}>
        <ThemedText style={[styles.quickActionIconText, { color }]}>
          {icon}
        </ThemedText>
      </View>
      <ThemedText
        style={[styles.quickActionLabel, { color: colors.textSecondary }]}
      >
        {label}
      </ThemedText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    padding: Spacing.md,
    paddingTop: 60,
    paddingBottom: 32,
  },
  balanceCard: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    marginBottom: Spacing.md,
  },
  balanceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: Spacing.xs,
  },
  balanceAmount: {
    fontSize: 42,
    fontWeight: "700",
    letterSpacing: -1,
  },
  balanceDenom: {
    fontSize: 18,
    fontWeight: "600",
    marginLeft: Spacing.sm,
  },
  address: {
    marginTop: Spacing.sm,
    fontSize: 13,
  },
  quickActions: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
  quickAction: {
    alignItems: "center",
  },
  quickActionIcon: {
    width: 52,
    height: 52,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xs,
  },
  quickActionIconText: {
    fontSize: 22,
  },
  quickActionLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  shieldedCard: {
    marginBottom: Spacing.lg,
  },
  shieldedRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  shieldedAmount: {
    fontSize: 24,
    fontWeight: "700",
  },
  shieldedDenom: {
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 6,
  },
  privacyBadge: {
    backgroundColor: Colors.accent + "1A",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
  },
  privacyBadgeText: {
    color: Colors.accent,
    fontWeight: "700",
    fontSize: 14,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  emptyState: {
    padding: Spacing.xl,
  },
});
