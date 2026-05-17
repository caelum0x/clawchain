import { useColorScheme } from "react-native";
import { Colors } from "@/constants/theme";

type ThemeColorName = keyof typeof Colors.light & keyof typeof Colors.dark;

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: ThemeColorName
): string {
  const theme = useColorScheme() ?? "dark";
  const colorFromProps = props[theme];
  return colorFromProps || Colors[theme][colorName];
}

export function useTheme() {
  const scheme = useColorScheme() ?? "dark";
  return {
    colors: Colors[scheme],
    isDark: scheme === "dark",
  };
}
