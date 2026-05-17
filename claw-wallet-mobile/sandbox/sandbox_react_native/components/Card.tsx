import { View, StyleSheet, type ViewProps } from "react-native";
import { useTheme } from "@/hooks/useThemeColor";
import { BorderRadius, Spacing } from "@/constants/theme";

interface CardProps extends ViewProps {
  padding?: number;
}

export function Card({ children, style, padding, ...props }: CardProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          padding: padding ?? Spacing.md,
        },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
});
