import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { WalletProvider } from "@/contexts/WalletContext";
import { Colors } from "@/constants/theme";

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const navTheme = isDark
    ? {
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          background: Colors.dark.background,
          card: Colors.dark.card,
          border: Colors.dark.border,
          primary: Colors.primary,
        },
      }
    : {
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          background: Colors.light.background,
          card: Colors.light.card,
          border: Colors.light.border,
          primary: Colors.primary,
        },
      };

  return (
    <ThemeProvider value={navTheme}>
      <WalletProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen
            name="(tabs)"
            options={{ headerShown: false, gestureEnabled: false }}
          />
          <Stack.Screen
            name="history"
            options={{
              headerShown: true,
              title: "Transaction History",
              presentation: "modal",
            }}
          />
        </Stack>
        <StatusBar style="auto" />
      </WalletProvider>
    </ThemeProvider>
  );
}
