import { useColorScheme } from "react-native";
import { useWallet } from "@/contexts/WalletContext";
import { GovernanceScreen } from "@clawchain/mobile-ui";

export default function GovernanceTab() {
  const colorScheme = useColorScheme() ?? "dark";
  const { account } = useWallet();

  return (
    <GovernanceScreen
      voterAddress={account?.address}
      colorScheme={colorScheme}
    />
  );
}
