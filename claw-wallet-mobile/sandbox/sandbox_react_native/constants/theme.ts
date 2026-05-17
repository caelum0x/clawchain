import { Platform } from "react-native";

export const Colors = {
  primary: "#6C5CE7",
  primaryLight: "#A29BFE",
  accent: "#00D2FF",
  success: "#00B894",
  warning: "#FDCB6E",
  danger: "#E17055",

  light: {
    text: "#1A1A2E",
    textSecondary: "#636E72",
    background: "#F8F9FA",
    card: "#FFFFFF",
    border: "#E1E8ED",
    tint: "#6C5CE7",
    icon: "#636E72",
    tabIconDefault: "#636E72",
    tabIconSelected: "#6C5CE7",
    inputBackground: "#F1F3F5",
  },
  dark: {
    text: "#ECEDEE",
    textSecondary: "#9BA1A6",
    background: "#0F0F1A",
    card: "#1A1A2E",
    border: "#2D2D44",
    tint: "#A29BFE",
    icon: "#9BA1A6",
    tabIconDefault: "#9BA1A6",
    tabIconSelected: "#A29BFE",
    inputBackground: "#16213E",
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const Fonts = Platform.select({
  ios: {
    regular: "System",
    medium: "System",
    bold: "System",
    mono: "Menlo",
  },
  default: {
    regular: "normal",
    medium: "normal",
    bold: "normal",
    mono: "monospace",
  },
});
