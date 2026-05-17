/**
 * PrivacyShield — Standalone shield/unshield component for shared use.
 *
 * This is a portable version of the PrivacyScreen that uses the
 * useBalance and usePrivacyShield hooks from the clawchain-ui package,
 * making it usable outside the sandbox app context.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from "react-native";
import { useBalance } from "../hooks/useBalance.js";
import { usePrivacyShield } from "../hooks/usePrivacyShield.js";

const COLORS = {
  primary: "#6C5CE7",
  accent: "#00D2FF",
  success: "#00B894",
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
  inputDark: "#16213E",
  inputLight: "#F1F3F5",
};

type Tab = "shield" | "unshield";

interface PrivacyShieldProps {
  address: string | null;
  colorScheme?: "light" | "dark";
}

export function PrivacyShield({
  address,
  colorScheme = "dark",
}: PrivacyShieldProps) {
  const isDark = colorScheme === "dark";
  const bg = isDark ? COLORS.bgDark : COLORS.bgLight;
  const cardBg = isDark ? COLORS.cardDark : COLORS.cardLight;
  const textColor = isDark ? COLORS.textLight : COLORS.textDark;
  const secondaryText = COLORS.textSecondary;
  const borderColor = isDark ? COLORS.borderDark : COLORS.borderLight;
  const inputBg = isDark ? COLORS.inputDark : COLORS.inputLight;

  const [tab, setTab] = useState<Tab>("shield");
  const [amount, setAmount] = useState("");

  const { balance, shieldedBalance, refresh: refreshBalance } = useBalance({
    address,
    refreshInterval: 15000,
  });

  const { shield, unshield, isLoading } = usePrivacyShield({
    address,
    onSuccess: (result, op) => {
      showAlert(
        op === "shield" ? "Tokens Shielded" : "Tokens Unshielded",
        `TX: ${result.txHash.slice(0, 20)}...${result.simulated ? " (simulated)" : ""}`
      );
      setAmount("");
      refreshBalance();
    },
    onError: (err) => {
      showAlert("Error", err.message);
    },
  });

  const parsedAmount = parseFloat(amount);
  const canSubmit = parsedAmount > 0 && !!address && !isLoading;

  const handleSubmit = async () => {
    const uclaw = Math.floor(parsedAmount * 1_000_000).toString();
    if (tab === "shield") {
      await shield(uclaw);
    } else {
      await unshield(uclaw);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Balance overview */}
        <View style={styles.balances}>
          <View style={[styles.balanceCard, { backgroundColor: cardBg, borderColor }]}>
            <Text style={[styles.balanceLabel, { color: secondaryText }]}>
              Public Balance
            </Text>
            <Text style={[styles.balanceAmount, { color: textColor }]}>
              {balance}
            </Text>
            <Text style={{ color: COLORS.primary, fontSize: 12, fontWeight: "600" }}>
              CLAW
            </Text>
          </View>
          <View style={[styles.balanceCard, { backgroundColor: cardBg, borderColor }]}>
            <Text style={[styles.balanceLabel, { color: secondaryText }]}>
              Shielded Balance
            </Text>
            <Text style={[styles.balanceAmount, { color: textColor }]}>
              {shieldedBalance}
            </Text>
            <Text style={{ color: COLORS.accent, fontSize: 12, fontWeight: "600" }}>
              CLAW (ZK)
            </Text>
          </View>
        </View>

        {/* Tab Switcher */}
        <View style={[styles.tabBar, { backgroundColor: inputBg }]}>
          {(["shield", "unshield"] as const).map((t) => (
            <TouchableOpacity
              key={t}
              style={[
                styles.tabButton,
                {
                  backgroundColor: tab === t ? COLORS.primary : "transparent",
                },
              ]}
              onPress={() => {
                setTab(t);
                setAmount("");
              }}
              activeOpacity={0.7}
            >
              <Text
                style={{
                  color: tab === t ? "#FFFFFF" : secondaryText,
                  fontSize: 14,
                  fontWeight: "600",
                }}
              >
                {t === "shield" ? "Shield" : "Unshield"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Info card */}
        <View
          style={[
            styles.infoCard,
            {
              backgroundColor: (tab === "shield" ? COLORS.accent : COLORS.primary) + "0D",
              borderColor: (tab === "shield" ? COLORS.accent : COLORS.primary) + "33",
            },
          ]}
        >
          <Text style={{ color: secondaryText, fontSize: 13, lineHeight: 18 }}>
            {tab === "shield"
              ? "Shielding converts public CLAW tokens into private, zero-knowledge protected tokens. Shielded tokens cannot be traced on the public ledger."
              : "Unshielding converts private tokens back to public CLAW. A ZK proof is generated to verify the withdrawal without revealing transaction history."}
          </Text>
        </View>

        {/* Amount Input */}
        <View style={[styles.formCard, { backgroundColor: cardBg, borderColor }]}>
          <Text style={[styles.label, { color: textColor }]}>
            Amount to {tab === "shield" ? "Shield" : "Unshield"}
          </Text>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: inputBg, color: textColor, borderColor },
            ]}
            placeholder="0.00"
            placeholderTextColor={secondaryText}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
          />
          <Text style={{ color: secondaryText, fontSize: 12, marginTop: 4 }}>
            Available: {tab === "shield" ? balance : shieldedBalance} CLAW
          </Text>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[
            styles.submitButton,
            {
              backgroundColor: canSubmit ? COLORS.primary : COLORS.primary + "60",
            },
          ]}
          onPress={handleSubmit}
          disabled={!canSubmit}
          activeOpacity={0.7}
        >
          <Text style={styles.submitText}>
            {isLoading
              ? "Processing..."
              : tab === "shield"
                ? "Shield Tokens"
                : "Unshield Tokens"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
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
  scroll: { padding: 16, paddingBottom: 32 },
  balances: { flexDirection: "row", gap: 8, marginBottom: 16 },
  balanceCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    alignItems: "center",
  },
  balanceLabel: { fontSize: 12 },
  balanceAmount: { fontSize: 22, fontWeight: "700", marginVertical: 2 },
  tabBar: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 3,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  infoCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
  },
  formCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  label: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
  },
  submitButton: {
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: "center",
    marginTop: 4,
  },
  submitText: { color: "#FFFFFF", fontSize: 18, fontWeight: "600" },
});
