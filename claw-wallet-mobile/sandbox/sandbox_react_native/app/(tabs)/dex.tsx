import { useColorScheme } from "react-native";
import { useWallet } from "@/contexts/WalletContext";
import { DexSwap } from "@clawchain/mobile-ui";

export default function DexTab() {
  const colorScheme = useColorScheme() ?? "dark";
  const { account } = useWallet();

  return (
    <DexSwap
      address={account?.address ?? null}
      colorScheme={colorScheme}
    />
  );
}
