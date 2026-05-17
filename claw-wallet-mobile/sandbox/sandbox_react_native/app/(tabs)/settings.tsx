import { View, StyleSheet, Alert } from "react-native";
import { useRouter } from "expo-router";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useWallet } from "@/contexts/WalletContext";
import { useTheme } from "@/hooks/useThemeColor";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { CHAIN_CONFIG, TESTNET_CONFIG, LOCAL_CONFIG } from "@/constants/chain";

export default function SettingsScreen() {
  const { account, network, setNetwork, signOut } = useWallet();
  const { colors } = useTheme();
  const router = useRouter();

  const networkConfigs = {
    mainnet: CHAIN_CONFIG,
    testnet: TESTNET_CONFIG,
    local: LOCAL_CONFIG,
  } as const;
  const currentConfig = networkConfigs[network];
  const networkLabels: Record<string, string> = { mainnet: "Mainnet", testnet: "Testnet", local: "Local Dev" };

  const cycleNetwork = () => {
    const order: Array<"mainnet" | "testnet" | "local"> = ["mainnet", "testnet", "local"];
    const idx = order.indexOf(network);
    setNetwork(order[(idx + 1) % order.length]);
  };

  const handleSignOut = () => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to remove this wallet from the device? Make sure you have backed up your recovery phrase.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: async () => {
            await signOut();
            router.replace("/onboarding" as any);
          },
        },
      ]
    );
  };

  const handleBackup = () => {
    Alert.alert(
      "Backup",
      "In production, this will display your MPC key share backup. For security, key shares are distributed across multiple nodes and can be reconstructed for wallet recovery.",
      [{ text: "OK" }]
    );
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        {/* Account Info */}
        <Card style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Account
          </ThemedText>
          <SettingRow label="Wallet Name" value={account?.name ?? "—"} colors={colors} />
          <SettingRow
            label="Created"
            value={
              account?.createdAt
                ? new Date(account.createdAt).toLocaleDateString()
                : "—"
            }
            colors={colors}
          />
        </Card>

        {/* Network */}
        <Card style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Network
          </ThemedText>
          <View style={styles.settingRow}>
            <View>
              <ThemedText style={styles.settingLabel}>Network</ThemedText>
              <ThemedText
                type="caption"
                style={{ color: colors.textSecondary }}
              >
                {currentConfig.chainId}
              </ThemedText>
            </View>
            <Button
              title={networkLabels[network]}
              onPress={cycleNetwork}
              variant="outline"
              style={{ minWidth: 100 }}
            />
          </View>
          <SettingRow
            label="RPC Endpoint"
            value={currentConfig.rpc}
            colors={colors}
          />
          <SettingRow
            label="REST Endpoint"
            value={currentConfig.rest}
            colors={colors}
          />
        </Card>

        {/* Security */}
        <Card style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Security
          </ThemedText>
          <Button
            title="Backup Key Shares"
            onPress={handleBackup}
            variant="outline"
            style={{ marginBottom: Spacing.sm }}
          />
        </Card>

        {/* Danger Zone */}
        <Card
          style={[
            styles.section,
            { borderColor: Colors.danger + "40" },
          ]}
        >
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Danger Zone
          </ThemedText>
          <Button
            title="Sign Out & Remove Wallet"
            onPress={handleSignOut}
            variant="danger"
          />
        </Card>

        {/* Footer */}
        <ThemedText
          type="caption"
          style={[styles.footer, { color: colors.textSecondary }]}
        >
          ClawChain Wallet v1.0.0{"\n"}
          Powered by MPC threshold signatures
        </ThemedText>
      </View>
    </ThemedView>
  );
}

function SettingRow({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: any;
}) {
  return (
    <View style={styles.settingRow}>
      <ThemedText style={styles.settingLabel}>{label}</ThemedText>
      <ThemedText
        type="caption"
        style={{ color: colors.textSecondary, maxWidth: "55%", textAlign: "right" }}
        numberOfLines={1}
      >
        {value}
      </ThemedText>
    </View>
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
  section: {
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    marginBottom: Spacing.md,
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: "500",
  },
  footer: {
    textAlign: "center",
    marginTop: Spacing.md,
    lineHeight: 20,
  },
});
