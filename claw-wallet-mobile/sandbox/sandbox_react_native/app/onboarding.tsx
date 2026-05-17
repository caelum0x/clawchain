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
import { useRouter } from "expo-router";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useWallet } from "@/contexts/WalletContext";
import { useTheme } from "@/hooks/useThemeColor";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";

type Screen = "welcome" | "create" | "import";

export default function OnboardingScreen() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [walletName, setWalletName] = useState("");
  const [mnemonic, setMnemonic] = useState("");
  const { createWallet, importWallet, isLoading } = useWallet();
  const { colors } = useTheme();
  const router = useRouter();

  const handleCreate = async () => {
    const name = walletName.trim() || "My Wallet";
    try {
      await createWallet(name);
      router.replace("/(tabs)" as any);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const handleImport = async () => {
    const name = walletName.trim() || "Imported Wallet";
    try {
      await importWallet(mnemonic, name);
      router.replace("/(tabs)" as any);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  if (screen === "welcome") {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.hero}>
          <View style={styles.logoContainer}>
            <ThemedText style={styles.logoText}>C</ThemedText>
          </View>
          <ThemedText type="title" style={styles.title}>
            ClawChain
          </ThemedText>
          <ThemedText
            type="caption"
            style={[styles.subtitle, { color: colors.textSecondary }]}
          >
            Privacy-first blockchain wallet with MPC security
          </ThemedText>
        </View>

        <View style={styles.actions}>
          <Button
            title="Create New Wallet"
            onPress={() => setScreen("create")}
            size="lg"
          />
          <Button
            title="Import Existing Wallet"
            onPress={() => setScreen("import")}
            variant="outline"
            size="lg"
            style={{ marginTop: Spacing.md }}
          />
        </View>

        <ThemedText
          type="caption"
          style={[styles.footer, { color: colors.textSecondary }]}
        >
          Secured by threshold signatures (MPC)
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Button
              title="Back"
              onPress={() => setScreen("welcome")}
              variant="secondary"
              size="sm"
            />
          </View>

          <ThemedText type="title" style={styles.formTitle}>
            {screen === "create" ? "Create Wallet" : "Import Wallet"}
          </ThemedText>
          <ThemedText
            type="caption"
            style={[styles.formSubtitle, { color: colors.textSecondary }]}
          >
            {screen === "create"
              ? "MPC key shares will be generated securely across distributed nodes."
              : "Enter your 12 or 24 word recovery phrase."}
          </ThemedText>

          <Card style={styles.formCard}>
            <ThemedText style={styles.inputLabel}>Wallet Name</ThemedText>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.inputBackground,
                  color: colors.text,
                  borderColor: colors.border,
                },
              ]}
              placeholder="My Wallet"
              placeholderTextColor={colors.textSecondary}
              value={walletName}
              onChangeText={setWalletName}
              autoCapitalize="words"
            />

            {screen === "import" && (
              <>
                <ThemedText style={[styles.inputLabel, { marginTop: Spacing.md }]}>
                  Recovery Phrase
                </ThemedText>
                <TextInput
                  style={[
                    styles.input,
                    styles.textArea,
                    {
                      backgroundColor: colors.inputBackground,
                      color: colors.text,
                      borderColor: colors.border,
                    },
                  ]}
                  placeholder="Enter your 12 or 24 word recovery phrase..."
                  placeholderTextColor={colors.textSecondary}
                  value={mnemonic}
                  onChangeText={setMnemonic}
                  multiline
                  numberOfLines={4}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textAlignVertical="top"
                />
              </>
            )}
          </Card>

          <Button
            title={screen === "create" ? "Generate Wallet" : "Import Wallet"}
            onPress={screen === "create" ? handleCreate : handleImport}
            size="lg"
            loading={isLoading}
            disabled={screen === "import" && !mnemonic.trim()}
            style={{ marginTop: Spacing.lg }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  hero: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  logoText: {
    fontSize: 40,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  title: {
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  subtitle: {
    textAlign: "center",
    fontSize: 16,
    lineHeight: 22,
  },
  actions: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  footer: {
    textAlign: "center",
    paddingBottom: Spacing.xl,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: 60,
  },
  header: {
    flexDirection: "row",
    marginBottom: Spacing.xl,
  },
  formTitle: {
    marginBottom: Spacing.sm,
  },
  formSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  formCard: {
    marginBottom: Spacing.md,
  },
  inputLabel: {
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
  textArea: {
    minHeight: 100,
    paddingTop: Spacing.sm + 4,
  },
});
