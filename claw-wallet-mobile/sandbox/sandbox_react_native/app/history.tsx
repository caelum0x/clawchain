import { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { TransactionItem } from "@/components/TransactionItem";
import { useWallet } from "@/contexts/WalletContext";
import { useTheme } from "@/hooks/useThemeColor";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import type { Transaction } from "@/services/chain";

type Filter = "all" | "send" | "receive" | "shield" | "unshield";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "send", label: "Sent" },
  { key: "receive", label: "Received" },
  { key: "shield", label: "Shielded" },
  { key: "unshield", label: "Unshielded" },
];

export default function HistoryScreen() {
  const { transactions, refreshTransactions, isLoading } = useWallet();
  const { colors } = useTheme();
  const [filter, setFilter] = useState<Filter>("all");

  const filtered =
    filter === "all"
      ? transactions
      : transactions.filter((tx) => tx.type === filter);

  const onRefresh = useCallback(async () => {
    await refreshTransactions();
  }, [refreshTransactions]);

  const renderItem = useCallback(
    ({ item }: { item: Transaction }) => <TransactionItem tx={item} />,
    []
  );

  return (
    <ThemedView style={styles.container}>
      {/* Filter Bar */}
      <View style={styles.filterBar}>
        {FILTERS.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[
              styles.filterChip,
              {
                backgroundColor:
                  filter === key ? Colors.primary : colors.inputBackground,
              },
            ]}
            onPress={() => setFilter(key)}
            activeOpacity={0.7}
          >
            <ThemedText
              style={[
                styles.filterText,
                { color: filter === key ? "#FFFFFF" : colors.textSecondary },
              ]}
            >
              {label}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={(item) => item.hash}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <ThemedText
              type="caption"
              style={{ color: colors.textSecondary, textAlign: "center" }}
            >
              No {filter === "all" ? "" : filter + " "}transactions found.
            </ThemedText>
          </View>
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filterBar: {
    flexDirection: "row",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  filterChip: {
    paddingHorizontal: Spacing.sm + 4,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.full,
  },
  filterText: {
    fontSize: 13,
    fontWeight: "600",
  },
  list: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  empty: {
    paddingTop: Spacing.xxl,
  },
});
