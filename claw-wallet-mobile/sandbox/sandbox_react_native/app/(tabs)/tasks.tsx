import { useColorScheme } from "react-native";
import { useWallet } from "@/contexts/WalletContext";
import { TaskManager } from "@clawchain/mobile-ui";

export default function TasksTab() {
  const colorScheme = useColorScheme() ?? "dark";
  const { account } = useWallet();

  return (
    <TaskManager
      address={account?.address ?? null}
      colorScheme={colorScheme}
    />
  );
}
