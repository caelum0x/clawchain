import { useState } from "react";
import {
  View,
  StyleSheet,
  Share,
  TouchableOpacity,
  Alert,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useWallet } from "@/contexts/WalletContext";
import { useTheme } from "@/hooks/useThemeColor";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { CHAIN_CONFIG } from "@/constants/chain";

export default function ReceiveScreen() {
  const { account } = useWallet();
  const { colors } = useTheme();
  const [copied, setCopied] = useState(false);

  const address = account?.address ?? "";

  const handleCopy = async () => {
    await Clipboard.setStringAsync(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: address,
        title: "My ClawChain Address",
      });
    } catch {
      // User cancelled share
    }
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <ThemedText type="caption" style={[styles.subtitle, { color: colors.textSecondary }]}>
          Share your address to receive {CHAIN_CONFIG.displayDenom}
        </ThemedText>

        {/* QR-like placeholder */}
        <Card style={styles.qrCard}>
          <View style={styles.qrPlaceholder}>
            <View style={styles.qrGrid}>
              {Array.from({ length: 81 }, (_, i) => (
                <View
                  key={i}
                  style={[
                    styles.qrCell,
                    {
                      backgroundColor:
                        Math.random() > 0.4
                          ? colors.text
                          : "transparent",
                    },
                  ]}
                />
              ))}
            </View>
            <View style={styles.qrOverlay}>
              <View style={styles.qrLogo}>
                <ThemedText style={styles.qrLogoText}>C</ThemedText>
              </View>
            </View>
          </View>
        </Card>

        {/* Address Display */}
        <Card style={styles.addressCard}>
          <ThemedText
            type="caption"
            style={{ color: colors.textSecondary, marginBottom: Spacing.xs }}
          >
            Your Address
          </ThemedText>
          <TouchableOpacity onPress={handleCopy} activeOpacity={0.7}>
            <ThemedText type="mono" style={styles.addressText} selectable>
              {address}
            </ThemedText>
          </TouchableOpacity>
        </Card>

        <View style={styles.actions}>
          <Button
            title={copied ? "Copied!" : "Copy Address"}
            onPress={handleCopy}
            variant={copied ? "secondary" : "primary"}
            style={{ flex: 1, marginRight: Spacing.sm }}
          />
          <Button
            title="Share"
            onPress={handleShare}
            variant="outline"
            style={{ flex: 1 }}
          />
        </View>

        <Card style={styles.infoCard}>
          <ThemedText
            type="caption"
            style={{ color: colors.textSecondary, textAlign: "center" }}
          >
            Only send {CHAIN_CONFIG.displayDenom} tokens on ClawChain to this
            address. Sending other assets may result in permanent loss.
          </ThemedText>
        </Card>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: Spacing.md,
    paddingTop: Spacing.md,
  },
  subtitle: {
    textAlign: "center",
    marginBottom: Spacing.lg,
    fontSize: 15,
  },
  qrCard: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    marginBottom: Spacing.md,
  },
  qrPlaceholder: {
    width: 180,
    height: 180,
    position: "relative",
  },
  qrGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: 180,
    height: 180,
  },
  qrCell: {
    width: 20,
    height: 20,
  },
  qrOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  qrLogo: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  qrLogoText: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
  },
  addressCard: {
    marginBottom: Spacing.md,
  },
  addressText: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  actions: {
    flexDirection: "row",
    marginBottom: Spacing.md,
  },
  infoCard: {
    backgroundColor: Colors.warning + "0D",
    borderColor: Colors.warning + "33",
  },
});
