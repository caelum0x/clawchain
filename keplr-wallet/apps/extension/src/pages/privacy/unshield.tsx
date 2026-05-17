import React, { FunctionComponent } from "react";
import { Box } from "../../components/box";
import { TextInput } from "../../components/input";
import { Stack } from "../../components/stack";
import { Body3, Subtitle2 } from "../../components/typography";
import { ColorPalette } from "../../styles";
import { useTheme } from "styled-components";

export const UnshieldView: FunctionComponent<{
  amount: string;
  setAmount: (v: string) => void;
  recipient: string;
  setRecipient: (v: string) => void;
  coinDenom: string;
  defaultAddress: string;
}> = ({ amount, setAmount, recipient, setRecipient, coinDenom, defaultAddress }) => {
  const theme = useTheme();

  return (
    <Box padding="1rem">
      <Stack gutter="1rem">
        <Subtitle2
          color={
            theme.mode === "light"
              ? ColorPalette["gray-700"]
              : ColorPalette["gray-10"]
          }
        >
          Unshield tokens to make them visible
        </Subtitle2>

        <Body3
          color={
            theme.mode === "light"
              ? ColorPalette["gray-300"]
              : ColorPalette["gray-200"]
          }
        >
          Unshielded tokens are returned to a public address. Leave recipient
          blank to unshield to yourself.
        </Body3>

        <TextInput
          label="Amount"
          type="number"
          placeholder={`0 ${coinDenom}`}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />

        <TextInput
          label="Recipient (optional)"
          placeholder={defaultAddress}
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
        />

        <Body3 color={ColorPalette["gray-300"]}>
          Estimated fee: ~0.025 {coinDenom}
        </Body3>
      </Stack>
    </Box>
  );
};
