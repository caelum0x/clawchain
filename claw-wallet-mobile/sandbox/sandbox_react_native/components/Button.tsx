import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  type ViewStyle,
} from "react-native";
import { Colors, BorderRadius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/useThemeColor";

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "outline" | "danger";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  style,
}: ButtonProps) {
  const { colors, isDark } = useTheme();

  const bgColor = {
    primary: Colors.primary,
    secondary: isDark ? Colors.dark.card : Colors.light.inputBackground,
    outline: "transparent",
    danger: Colors.danger,
  }[variant];

  const textColor = {
    primary: "#FFFFFF",
    secondary: colors.text,
    outline: Colors.primary,
    danger: "#FFFFFF",
  }[variant];

  const borderColor = variant === "outline" ? Colors.primary : "transparent";

  const paddingVertical = { sm: 8, md: 14, lg: 18 }[size];
  const fontSize = { sm: 14, md: 16, lg: 18 }[size];

  return (
    <TouchableOpacity
      style={[
        styles.button,
        {
          backgroundColor: bgColor,
          borderColor,
          borderWidth: variant === "outline" ? 1.5 : 0,
          paddingVertical,
          opacity: disabled || loading ? 0.5 : 1,
        },
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <Text style={[styles.text, { color: textColor, fontSize }]}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  text: {
    fontWeight: "600",
  },
});
