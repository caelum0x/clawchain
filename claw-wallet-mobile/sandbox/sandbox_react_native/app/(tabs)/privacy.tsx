import { useState } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  ScrollView,
  Alert,
} from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useWallet } from "@/contexts/WalletContext";
import { useTheme } from "@/hooks/useThemeColor";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { parseAmount, CHAIN_CONFIG } from "@/constants/chain";

type Tab = "shield" | "unshield";

export default function PrivacyScreen() {
  const [tab, setTab] = useState<Tab>("shield");
  const [amount, setAmount] = useState("");
  const {
    balance,
    shieldedBalance,
    shield: doShield,
    unshield: doUnshield,
    isLoading,
  } = useWallet();
  const { colors } = useTheme();

  const parsedAmount = parseFloat(amount);
  const canSubmit = parsedAmount > 0 && !isLoading;

  const handleSubmit = async () => {
    try {
      const uclawAmount = parseAmount(amount);
      let txHash: string;

      if (tab === "shield") {
        txHash = await doShield(uclawAmount);
      } else {
        txHash = await doUnshield(uclawAmount);
      }

      Alert.alert(
        tab === "shield" ? "Tokens Shielded" : "Tokens Unshielded",
        `TX Hash: ${txHash.slice(0, 16)}...`,
        [{ text: "OK", onPress: () => setAmount("") }]
      );
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Balance Overview */}
        <View style={styles.balances}>
          <Card style={styles.balanceCard}>
            <ThemedText type="caption" style={{ color: colors.textSecondary }}>
              Public Balance
            </ThemedText>
            <ThemedText style={styles.balanceAmount}>{balance}</ThemedText>
            <ThemedText
              type="caption"
              style={{ color: Colors.primary, fontWeight: "600" }}
            >
              CLAW
            </ThemedText>
          </Card>
          <Card style={styles.balanceCard}>
            <ThemedText type="caption" style={{ color: colors.textSecondary }}>
              Shielded Balance
            </ThemedText>
            <ThemedText style={styles.balanceAmount}>
              {shieldedBalance}
            </ThemedText>
            <ThemedText
              type="caption"
              style={{ color: Colors.accent, fontWeight: "600" }}
            >
              CLAW (ZK)
            </ThemedText>
          </Card>
        </View>

        {/* Tab Switcher */}
        <View
          style={[styles.tabBar, { backgroundColor: colors.inputBackground }]}
        >
          <TabButton
            title="Shield"
            active={tab === "shield"}
            onPress={() => {
              setTab("shield");
              setAmount("");
            }}
            colors={colors}
          />
          <TabButton
            title="Unshield"
            active={tab === "unshield"}
            onPress={() => {
              setTab("unshield");
              setAmount("");
            }}
            colors={colors}
          />
        </View>

        {/* Explanation */}
        <Card
          style={[
            styles.infoCard,
            {
              backgroundColor:
                tab === "shield"
                  ? Colors.accent + "0D"
                  : Colors.primary + "0D",
              borderColor:
                tab === "shield"
                  ? Colors.accent + "33"
                  : Colors.primary + "33",
            },
          ]}
        >
          <ThemedText type="caption" style={{ color: colors.textSecondary }}>
            {tab === "shield"
              ? "Shielding converts public CLAW tokens into private, zero-knowledge protected tokens. Shielded tokens cannot be traced on the public ledger."
              : "Unshielding converts private tokens back to public CLAW. A ZK proof is generated to verify the withdrawal without revealing transaction history."}
          </ThemedText>
        </Card>

        {/* Amount Input */}
        <Card style={styles.formCard}>
          <ThemedText style={styles.label}>
            Amount to {tab === "shield" ? "Shield" : "Unshield"}
          </ThemedText>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.inputBackground,
                color: colors.text,
                borderColor: colors.border,
              },
            ]}
            placeholder="0.00"
            placeholderTextColor={colors.textSecondary}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
          />
          <ThemedText type="caption" style={{ color: colors.textSecondary, marginTop: Spacing.xs }}>
            Available:{" "}
            {tab === "shield" ? balance : shieldedBalance}{" "}
            {CHAIN_CONFIG.displayDenom}
          </ThemedText>
        </Card>

        <Button
          title={
            tab === "shield"
              ? "Shield Tokens"
              : "Unshield Tokens"
          }
          onPress={handleSubmit}
          disabled={!canSubmit}
          loading={isLoading}
          size="lg"
          style={{ marginTop: Spacing.md }}
        />
      </ScrollView>
    </ThemedView>
  );
}

function TabButton({
  title,
  active,
  onPress,
  colors,
}: {
  title: string;
  active: boolean;
  onPress: () => void;
  colors: any;
}) {
  return (
    <Button
      title={title}
      onPress={onPress}
      variant={active ? "primary" : "secondary"}
      size="sm"
      style={{ flex: 1, marginHorizontal: 2 }}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    padding: Spacing.md,
    paddingTop: Spacing.md,
  },
  balances: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  balanceCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  balanceAmount: {
    fontSize: 22,
    fontWeight: "700",
    marginVertical: 2,
  },
  tabBar: {
    flexDirection: "row",
    borderRadius: BorderRadius.md,
    padding: 3,
    marginBottom: Spacing.md,
  },
  infoCard: {
    marginBottom: Spacing.md,
  },
  formCard: {
    marginBottom: Spacing.sm,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: Spacing.xs,
  },
  input: {
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 4,
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
  },
});
