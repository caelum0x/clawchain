import React, { FunctionComponent, useState } from "react";
import { observer } from "mobx-react-lite";
import { HeaderLayout } from "../../layouts/header";
import { BackButton } from "../../layouts/header/components";
import { useNavigate } from "react-router";
import { useStore } from "../../stores";
import { Box } from "../../components/box";
import { useNotification } from "../../hooks/notification";
import { ShieldView } from "./shield";
import { UnshieldView } from "./unshield";
import { ColorPalette } from "../../styles";
import { useTheme } from "styled-components";

const CLAWCHAIN_ID = "clawchain-1";

export const PrivacyPage: FunctionComponent = observer(() => {
  const { accountStore, chainStore } = useStore();
  const navigate = useNavigate();
  const notification = useNotification();
  const theme = useTheme();

  const [tab, setTab] = useState<"shield" | "unshield">("shield");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const chainId = CLAWCHAIN_ID;
  const account = accountStore.getAccount(chainId);
  const chainInfo = chainStore.getChain(chainId);
  const stakeCurrency = chainInfo.stakeCurrency ?? chainInfo.currencies[0];
  const coinDenom = stakeCurrency.coinDenom;

  const handleSubmit = async () => {
    if (!amount || Number(amount) <= 0) return;

    setIsLoading(true);
    try {
      const decAmount = Math.floor(
        Number(amount) * Math.pow(10, stakeCurrency.coinDecimals)
      ).toString();

      const typeUrl =
        tab === "shield"
          ? "/clawchain.privacy.v1.MsgShield"
          : "/clawchain.privacy.v1.MsgUnshield";

      const msgValue: Record<string, unknown> = {
        sender: account.bech32Address,
        amount: {
          denom: stakeCurrency.coinMinimalDenom,
          amount: decAmount,
        },
      };

      if (tab === "unshield") {
        msgValue["recipient"] = recipient || account.bech32Address;
      }

      const tx = account.cosmos.makeTx(`privacy/${tab}`, {
        protoMsgs: [
          {
            typeUrl,
            value: new Uint8Array(Buffer.from(JSON.stringify(msgValue))),
          },
        ],
      });

      await tx.send(
        { amount: [], gas: "300000" },
        "",
        {
          preferNoSetFee: false,
          preferNoSetMemo: true,
        },
        {
          onBroadcasted: () => {},
          onFulfill: (txResult: { code?: number }) => {
            if (txResult.code != null && txResult.code !== 0) {
              notification.show("failed", "Transaction failed", "");
              return;
            }
            notification.show("success", "Transaction successful", "");
          },
        }
      );

      navigate("/", { replace: true });
    } catch (e) {
      if ((e as Error).message === "Request rejected") {
        return;
      }
      notification.show("failed", "Transaction failed", "");
    } finally {
      setIsLoading(false);
    }
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: "0.625rem",
    textAlign: "center",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: "0.875rem",
    borderBottom: active ? `2px solid ${ColorPalette["blue-400"]}` : "2px solid transparent",
    color: active
      ? theme.mode === "light"
        ? ColorPalette["blue-400"]
        : ColorPalette["blue-300"]
      : ColorPalette["gray-300"],
    background: "transparent",
    border: "none",
    borderBottomStyle: "solid" as const,
    borderBottomWidth: "2px",
    borderBottomColor: active ? ColorPalette["blue-400"] : "transparent",
  });

  return (
    <HeaderLayout
      title="Privacy"
      left={<BackButton />}
      bottomButtons={[
        {
          text: tab === "shield" ? "Shield" : "Unshield",
          size: "large",
          disabled: !amount || Number(amount) <= 0,
          isLoading,
          onClick: handleSubmit,
        },
      ]}
    >
      <Box>
        <div style={{ display: "flex" }}>
          <button
            style={tabStyle(tab === "shield")}
            onClick={() => {
              setTab("shield");
              setAmount("");
              setRecipient("");
            }}
          >
            Shield
          </button>
          <button
            style={tabStyle(tab === "unshield")}
            onClick={() => {
              setTab("unshield");
              setAmount("");
              setRecipient("");
            }}
          >
            Unshield
          </button>
        </div>

        {tab === "shield" ? (
          <ShieldView
            amount={amount}
            setAmount={setAmount}
            coinDenom={coinDenom}
          />
        ) : (
          <UnshieldView
            amount={amount}
            setAmount={setAmount}
            recipient={recipient}
            setRecipient={setRecipient}
            coinDenom={coinDenom}
            defaultAddress={account.bech32Address}
          />
        )}
      </Box>
    </HeaderLayout>
  );
});
