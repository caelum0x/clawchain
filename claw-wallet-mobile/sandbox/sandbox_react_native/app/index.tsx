import { useEffect } from "react";
import { useRouter } from "expo-router";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useWallet } from "@/contexts/WalletContext";
import { Colors } from "@/constants/theme";

export default function Index() {
  const { account, isInitialized } = useWallet();
  const router = useRouter();

  useEffect(() => {
    if (!isInitialized) return;

    if (account) {
      router.replace("/(tabs)" as any);
    } else {
      router.replace("/onboarding" as any);
    }
  }, [isInitialized, account]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.dark.background,
  },
});
