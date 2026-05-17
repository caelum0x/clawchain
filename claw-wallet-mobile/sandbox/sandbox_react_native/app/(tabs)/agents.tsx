import { useColorScheme } from "react-native";
import { AgentDashboard } from "@clawchain/mobile-ui";

export default function AgentsTab() {
  const colorScheme = useColorScheme() ?? "dark";

  return <AgentDashboard colorScheme={colorScheme} />;
}
