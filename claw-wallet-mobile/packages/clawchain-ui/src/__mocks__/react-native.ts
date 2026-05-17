/**
 * Manual mock for react-native in Node.js test environment.
 */
export const View = "View";
export const Text = "Text";
export const TextInput = "TextInput";
export const ScrollView = "ScrollView";
export const TouchableOpacity = "TouchableOpacity";
export const RefreshControl = "RefreshControl";
export const KeyboardAvoidingView = "KeyboardAvoidingView";
export const ActivityIndicator = "ActivityIndicator";
export const Share = { share: () => Promise.resolve() };
export const Platform = {
  OS: "ios" as const,
  select: (opts: Record<string, unknown>) => opts.ios ?? opts.default,
};
export const Alert = {
  alert: (..._args: unknown[]) => {},
};
export const StyleSheet = {
  create: <T extends Record<string, unknown>>(styles: T): T => styles,
  hairlineWidth: 1,
  absoluteFillObject: {},
};
export const useColorScheme = () => "dark";
