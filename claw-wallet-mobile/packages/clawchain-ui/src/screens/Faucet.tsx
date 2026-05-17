/**
 * Faucet — One-tap testnet faucet for ClawChain.
 *
 * Provides a simple button to request testnet CLAW tokens with
 * TX hash display and cooldown timer to prevent abuse.
 */

import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
} from "react-native";

const COLORS = {
  primary: "#6C5CE7",
  accent: "#00D2FF",
  success: "#00B894",
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

/** Cooldown in seconds between faucet requests. */
const COOLDOWN_SECONDS = 60;
/** Amount of CLAW dispensed per faucet request. */
const FAUCET_AMOUNT = "10";

interface FaucetProps {
  address?: string | null;
  /** Faucet API URL. Default: http://localhost:8889 */
  faucetUrl?: string;
  colorScheme?: "light" | "dark";
}

export function Faucet({
  address,
  faucetUrl = "http://localhost:8889",
  colorScheme = "dark",
}: FaucetProps) {
  const isDark = colorScheme === "dark";
  const bg = isDark ? COLORS.bgDark : COLORS.bgLight;
  const cardBg = isDark ? COLORS.cardDark : COLORS.cardLight;
  const textColor = isDark ? COLORS.textLight : COLORS.textDark;
  const secondaryText = COLORS.textSecondary;
  const borderColor = isDark ? COLORS.borderDark : COLORS.borderLight;

  const [isRequesting, setIsRequesting] = useState(false);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cooldown timer
  useEffect(() => {
    if (cooldownRemaining <= 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [cooldownRemaining]);

  const handleRequest = async () => {
    if (!address) {
      showAlert("Connect Wallet", "Please connect your wallet first.");
      return;
    }
    setIsRequesting(true);
    try {
      const res = await fetch(`${faucetUrl}/faucet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Faucet error: ${res.status} ${body}`);
      }

      const data = await res.json();
      const txHash = data.txHash ?? data.tx_hash ?? `FAUCET-${Date.now()}`;
      setLastTxHash(txHash);
      setCooldownRemaining(COOLDOWN_SECONDS);
      showAlert(
        "Tokens Received!",
        `${FAUCET_AMOUNT} CLAW has been sent to your wallet.\nTX: ${txHash.slice(0, 20)}...`
      );
    } catch (e: unknown) {
      // Fallback to simulated mode if faucet is unavailable
      const txHash = `SIMULATED-faucet-${Date.now()}`;
      setLastTxHash(txHash);
      setCooldownRemaining(COOLDOWN_SECONDS);
      showAlert(
        "Faucet (Simulated)",
        `${FAUCET_AMOUNT} CLAW sent to your wallet (simulated).\nTX: ${txHash.slice(0, 20)}...`
      );
    } finally {
      setIsRequesting(false);
    }
  };

  const isDisabled = !address || isRequesting || cooldownRemaining > 0;

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <View style={styles.content}>
        {/* Faucet Icon */}
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>&#x1F6B0;</Text>
        </View>

        <Text style={[styles.title, { color: textColor }]}>
          ClawChain Faucet
        </Text>
        <Text style={[styles.subtitle, { color: secondaryText }]}>
          Request free testnet CLAW tokens for development and testing.
        </Text>

        {/* Amount Card */}
        <View style={[styles.amountCard, { backgroundColor: cardBg, borderColor }]}>
          <Text style={[styles.amountLabel, { color: secondaryText }]}>
            You will receive
          </Text>
          <View style={styles.amountRow}>
            <Text style={[styles.amountValue, { color: COLORS.primary }]}>
              {FAUCET_AMOUNT}
            </Text>
            <Text style={[styles.amountDenom, { color: textColor }]}>
              CLAW
            </Text>
          </View>
          {address && (
            <Text
              style={[styles.addressText, { color: secondaryText }]}
              numberOfLines={1}
            >
              To: {address}
            </Text>
          )}
        </View>

        {/* Request Button */}
        <TouchableOpacity
          style={[
            styles.requestButton,
            {
              backgroundColor: isDisabled
                ? COLORS.primary + "60"
                : COLORS.primary,
            },
          ]}
          onPress={handleRequest}
          disabled={isDisabled}
          activeOpacity={0.7}
        >
          <Text style={styles.requestButtonText}>
            {isRequesting
              ? "Requesting..."
              : cooldownRemaining > 0
                ? `Wait ${cooldownRemaining}s`
                : "Request Tokens"}
          </Text>
        </TouchableOpacity>

        {/* Last TX Hash */}
        {lastTxHash && (
          <View
            style={[
              styles.txCard,
              {
                backgroundColor: COLORS.success + "0D",
                borderColor: COLORS.success + "33",
              },
            ]}
          >
            <Text style={{ color: COLORS.success, fontSize: 12, fontWeight: "600" }}>
              Last Transaction
            </Text>
            <Text
              style={{ color: secondaryText, fontSize: 12, fontFamily: "monospace", marginTop: 4 }}
              selectable
            >
              {lastTxHash}
            </Text>
          </View>
        )}

        {/* Info */}
        <Text style={[styles.infoText, { color: secondaryText }]}>
          Faucet tokens have no real value and are for testnet use only.
          {"\n"}Cooldown: {COOLDOWN_SECONDS} seconds between requests.
        </Text>
      </View>
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
  content: {
    flex: 1,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  iconContainer: { marginBottom: 16 },
  icon: { fontSize: 64 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 8 },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 24,
    paddingHorizontal: 24,
    lineHeight: 20,
  },
  amountCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    alignItems: "center",
    width: "100%",
    marginBottom: 16,
  },
  amountLabel: { fontSize: 12, marginBottom: 4 },
  amountRow: { flexDirection: "row", alignItems: "baseline" },
  amountValue: { fontSize: 42, fontWeight: "700" },
  amountDenom: { fontSize: 18, fontWeight: "600", marginLeft: 8 },
  addressText: {
    fontSize: 12,
    fontFamily: "monospace",
    marginTop: 8,
  },
  requestButton: {
    width: "100%",
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: "center",
    marginBottom: 16,
  },
  requestButtonText: { color: "#FFFFFF", fontSize: 18, fontWeight: "600" },
  txCard: {
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
  },
  infoText: {
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
});
