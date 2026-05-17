/**
 * DexSwap — Simplified DEX swap interface for mobile wallet.
 *
 * Provides pair selection, amount input, simulation preview, and swap
 * execution (sandbox stub). In production, this would integrate with
 * the Astroport-based DEX contracts deployed on ClawChain.
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

interface DexPair {
  id: string;
  baseSymbol: string;
  quoteSymbol: string;
  price: number;
}

const AVAILABLE_PAIRS: DexPair[] = [
  { id: "claw-atom", baseSymbol: "CLAW", quoteSymbol: "ATOM", price: 0.0025 },
  { id: "claw-usdc", baseSymbol: "CLAW", quoteSymbol: "USDC", price: 0.05 },
];

interface DexSwapProps {
  address?: string | null;
  colorScheme?: "light" | "dark";
}

export function DexSwap({ address, colorScheme = "dark" }: DexSwapProps) {
  const isDark = colorScheme === "dark";
  const bg = isDark ? COLORS.bgDark : COLORS.bgLight;
  const cardBg = isDark ? COLORS.cardDark : COLORS.cardLight;
  const textColor = isDark ? COLORS.textLight : COLORS.textDark;
  const secondaryText = COLORS.textSecondary;
  const borderColor = isDark ? COLORS.borderDark : COLORS.borderLight;
  const inputBg = isDark ? COLORS.inputDark : COLORS.inputLight;

  const [selectedPair, setSelectedPair] = useState<DexPair>(AVAILABLE_PAIRS[0]);
  const [fromAmount, setFromAmount] = useState("");
  const [isReversed, setIsReversed] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);

  const fromSymbol = isReversed ? selectedPair.quoteSymbol : selectedPair.baseSymbol;
  const toSymbol = isReversed ? selectedPair.baseSymbol : selectedPair.quoteSymbol;
  const rate = isReversed ? 1 / selectedPair.price : selectedPair.price;
  const parsedFrom = parseFloat(fromAmount) || 0;
  const estimatedTo = parsedFrom * rate;

  const canSwap = parsedFrom > 0 && !!address && !isSwapping;

  const handleSwap = async () => {
    setIsSwapping(true);
    try {
      // Sandbox stub: simulated swap
      await new Promise((r) => setTimeout(r, 800));
      showAlert(
        "Swap Submitted",
        `Swapped ${parsedFrom.toFixed(2)} ${fromSymbol} for ~${estimatedTo.toFixed(4)} ${toSymbol} (simulated)`
      );
      setFromAmount("");
    } catch (e: unknown) {
      showAlert("Swap Failed", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setIsSwapping(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Pair Selector */}
        <View style={styles.pairRow}>
          {AVAILABLE_PAIRS.map((pair) => (
            <TouchableOpacity
              key={pair.id}
              style={[
                styles.pairChip,
                {
                  backgroundColor:
                    selectedPair.id === pair.id
                      ? COLORS.primary
                      : isDark
                        ? COLORS.cardDark
                        : COLORS.borderLight,
                  borderColor:
                    selectedPair.id === pair.id
                      ? COLORS.primary
                      : borderColor,
                },
              ]}
              onPress={() => setSelectedPair(pair)}
              activeOpacity={0.7}
            >
              <Text
                style={{
                  color: selectedPair.id === pair.id ? "#FFFFFF" : secondaryText,
                  fontSize: 13,
                  fontWeight: "600",
                }}
              >
                {pair.baseSymbol}/{pair.quoteSymbol}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* From Input */}
        <View style={[styles.swapCard, { backgroundColor: cardBg, borderColor }]}>
          <View style={styles.tokenRow}>
            <Text style={[styles.tokenLabel, { color: secondaryText }]}>From</Text>
            <Text style={[styles.tokenSymbol, { color: textColor }]}>
              {fromSymbol}
            </Text>
          </View>
          <TextInput
            style={[
              styles.amountInput,
              { backgroundColor: inputBg, color: textColor, borderColor },
            ]}
            placeholder="0.00"
            placeholderTextColor={secondaryText}
            value={fromAmount}
            onChangeText={setFromAmount}
            keyboardType="decimal-pad"
          />
        </View>

        {/* Swap Direction */}
        <View style={styles.swapArrowRow}>
          <TouchableOpacity
            style={[styles.swapArrowButton, { backgroundColor: COLORS.primary + "1A" }]}
            onPress={() => setIsReversed(!isReversed)}
            activeOpacity={0.7}
          >
            <Text style={{ color: COLORS.primary, fontSize: 20, fontWeight: "700" }}>
              {"\u21C5"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* To Display */}
        <View style={[styles.swapCard, { backgroundColor: cardBg, borderColor }]}>
          <View style={styles.tokenRow}>
            <Text style={[styles.tokenLabel, { color: secondaryText }]}>To (estimated)</Text>
            <Text style={[styles.tokenSymbol, { color: textColor }]}>
              {toSymbol}
            </Text>
          </View>
          <View style={[styles.estimateBox, { backgroundColor: inputBg, borderColor }]}>
            <Text style={[styles.estimateText, { color: textColor }]}>
              {parsedFrom > 0 ? estimatedTo.toFixed(6) : "0.00"}
            </Text>
          </View>
        </View>

        {/* Rate Info */}
        <View style={[styles.rateCard, { backgroundColor: COLORS.primary + "0D", borderColor: COLORS.primary + "33" }]}>
          <Text style={{ color: secondaryText, fontSize: 13 }}>
            Rate: 1 {fromSymbol} = {rate.toFixed(6)} {toSymbol}
          </Text>
          <Text style={{ color: secondaryText, fontSize: 12, marginTop: 2 }}>
            Slippage tolerance: 0.5%
          </Text>
        </View>

        {/* Swap Button */}
        <TouchableOpacity
          style={[
            styles.swapButton,
            { backgroundColor: canSwap ? COLORS.primary : COLORS.primary + "60" },
          ]}
          onPress={handleSwap}
          disabled={!canSwap}
          activeOpacity={0.7}
        >
          <Text style={styles.swapButtonText}>
            {isSwapping ? "Swapping..." : `Swap ${fromSymbol} for ${toSymbol}`}
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
  pairRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  pairChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  swapCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  tokenRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  tokenLabel: { fontSize: 12 },
  tokenSymbol: { fontSize: 16, fontWeight: "700" },
  amountInput: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 22,
    fontWeight: "600",
    textAlign: "center",
  },
  swapArrowRow: { alignItems: "center", marginVertical: -8, zIndex: 1 },
  swapArrowButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  estimateBox: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  estimateText: { fontSize: 22, fontWeight: "600" },
  rateCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginTop: 16,
    marginBottom: 12,
  },
  swapButton: {
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: "center",
    marginTop: 4,
  },
  swapButtonText: { color: "#FFFFFF", fontSize: 18, fontWeight: "600" },
});
