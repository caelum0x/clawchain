import { Text, type TextProps, StyleSheet } from "react-native";
import { useThemeColor } from "@/hooks/useThemeColor";

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: "default" | "title" | "subtitle" | "caption" | "mono" | "link";
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = "default",
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, "text");
  return <Text style={[{ color }, styles[type], style]} {...rest} />;
}

const styles = StyleSheet.create({
  default: { fontSize: 16, lineHeight: 24 },
  title: { fontSize: 28, fontWeight: "700", lineHeight: 34 },
  subtitle: { fontSize: 20, fontWeight: "600", lineHeight: 28 },
  caption: { fontSize: 13, lineHeight: 18, opacity: 0.7 },
  mono: { fontSize: 14, fontFamily: "monospace", lineHeight: 20 },
  link: { fontSize: 16, lineHeight: 24, color: "#6C5CE7" },
});
