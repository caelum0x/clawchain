import React, { FunctionComponent } from "react";
import { Box } from "../../components/box";
import { TextInput } from "../../components/input";
import { Stack } from "../../components/stack";
import { Body3, Subtitle2 } from "../../components/typography";
import { ColorPalette } from "../../styles";
import { useTheme } from "styled-components";

export const ShieldView: FunctionComponent<{
  amount: string;
  setAmount: (v: string) => void;
  coinDenom: string;
}> = ({ amount, setAmount, coinDenom }) => {
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
          Shield tokens to make them private
        </Subtitle2>

        <Body3
          color={
            theme.mode === "light"
              ? ColorPalette["gray-300"]
              : ColorPalette["gray-200"]
          }
        >
          Shielded tokens are hidden on-chain using zero-knowledge proofs. Only
          you can see your shielded balance.
        </Body3>

        <TextInput
          label="Amount"
          type="number"
          placeholder={`0 ${coinDenom}`}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />

        <Body3 color={ColorPalette["gray-300"]}>
          Estimated fee: ~0.025 {coinDenom}
        </Body3>
      </Stack>
    </Box>
  );
};
