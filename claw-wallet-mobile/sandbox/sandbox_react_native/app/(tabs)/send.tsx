import { useState } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
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

export default function SendScreen() {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const { sendTokens, balance, isLoading } = useWallet();
  const { colors } = useTheme();

  const isValidAddress =
    recipient.startsWith(CHAIN_CONFIG.bech32Prefix + "1") &&
    recipient.length > 10;
  const parsedAmount = parseFloat(amount);
  const canSend = isValidAddress && parsedAmount > 0 && !isLoading;

  const handleSend = async () => {
    if (!showConfirm) {
      setShowConfirm(true);
      return;
    }

    try {
      const uclawAmount = parseAmount(amount);
      const txHash = await sendTokens(recipient, uclawAmount, memo);
      Alert.alert(
        "Transaction Sent",
        `TX Hash: ${txHash.slice(0, 16)}...`,
        [
          {
            text: "OK",
            onPress: () => {
              setRecipient("");
              setAmount("");
              setMemo("");
              setShowConfirm(false);
            },
          },
        ]
      );
    } catch (e: any) {
      Alert.alert("Error", e.message);
      setShowConfirm(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <ThemedText type="caption" style={{ color: colors.textSecondary }}>
            Available: {balance} {CHAIN_CONFIG.displayDenom}
          </ThemedText>

          <Card style={styles.formCard}>
            <ThemedText style={styles.label}>Recipient Address</ThemedText>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.inputBackground,
                  color: colors.text,
                  borderColor: recipient && !isValidAddress
                    ? Colors.danger
                    : colors.border,
                },
              ]}
              placeholder={`${CHAIN_CONFIG.bech32Prefix}1...`}
              placeholderTextColor={colors.textSecondary}
              value={recipient}
              onChangeText={(t) => {
                setRecipient(t);
                setShowConfirm(false);
              }}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {recipient.length > 0 && !isValidAddress && (
              <ThemedText style={styles.error}>
                Invalid address format
              </ThemedText>
            )}

            <ThemedText style={[styles.label, { marginTop: Spacing.md }]}>
              Amount ({CHAIN_CONFIG.displayDenom})
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
              onChangeText={(t) => {
                setAmount(t);
                setShowConfirm(false);
              }}
              keyboardType="decimal-pad"
            />

            <ThemedText style={[styles.label, { marginTop: Spacing.md }]}>
              Memo (optional)
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
              placeholder="Add a note..."
              placeholderTextColor={colors.textSecondary}
              value={memo}
              onChangeText={setMemo}
            />
          </Card>

          {showConfirm && (
            <Card style={styles.confirmCard}>
              <ThemedText type="subtitle" style={{ marginBottom: Spacing.sm }}>
                Confirm Transaction
              </ThemedText>
              <ConfirmRow label="To" value={`${recipient.slice(0, 16)}...${recipient.slice(-8)}`} colors={colors} />
              <ConfirmRow label="Amount" value={`${amount} ${CHAIN_CONFIG.displayDenom}`} colors={colors} />
              <ConfirmRow label="Fee" value={`~0.005 ${CHAIN_CONFIG.displayDenom}`} colors={colors} />
              {memo ? <ConfirmRow label="Memo" value={memo} colors={colors} /> : null}
            </Card>
          )}

          <Button
            title={showConfirm ? "Confirm & Send" : "Review Transaction"}
            onPress={handleSend}
            disabled={!canSend}
            loading={isLoading}
            size="lg"
            style={{ marginTop: Spacing.md }}
          />

          {showConfirm && (
            <Button
              title="Cancel"
              onPress={() => setShowConfirm(false)}
              variant="secondary"
              style={{ marginTop: Spacing.sm }}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

function ConfirmRow({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: any;
}) {
  return (
    <View style={confirmStyles.row}>
      <ThemedText type="caption" style={{ color: colors.textSecondary }}>
        {label}
      </ThemedText>
      <ThemedText style={confirmStyles.value}>{value}</ThemedText>
    </View>
  );
}

const confirmStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  value: {
    fontSize: 14,
    fontWeight: "500",
    maxWidth: "60%",
    textAlign: "right",
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    padding: Spacing.md,
    paddingTop: Spacing.md,
  },
  formCard: {
    marginTop: Spacing.sm,
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
    fontSize: 16,
  },
  error: {
    color: Colors.danger,
    fontSize: 12,
    marginTop: 4,
  },
  confirmCard: {
    marginTop: Spacing.md,
    borderColor: Colors.primary + "40",
    borderWidth: 1.5,
  },
});
