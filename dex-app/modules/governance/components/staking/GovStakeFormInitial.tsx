import React, { FC } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { Box, Stack, Text, Flex } from "@chakra-ui/react";
import num from "libs/num";
import { StdFee as Fee } from "@cosmjs/stargate";
import { ClawFormType } from "types/common";
import { useBalance, FormActionItem, FormActions } from "modules/common";
import Card from "components/Card";
import WarningMessage from "components/common/WarningMessage";
import GovStakeFooter from "./GovStakeFooter";
import TokenInput from "components/TokenInput";
import NewAmountInput from "components/NewAmountInput";

type Props = {
  type: ClawFormType;
  setType: (v: ClawFormType) => void;
  amount: string;
  isLoading: boolean;
  txFeeNotEnough?: boolean;
  fee?: Fee | undefined;
  price?: number;
  clawMintRatio?: number | null;
  error: any;
};

const GovStakeFormInitial: FC<Props> = ({
  type,
  setType,
  amount,
  isLoading,
  txFeeNotEnough,
  fee,
  price,
  clawMintRatio,
  error,
}) => {
  const { control, watch } = useFormContext();
  const { token } = watch();
  const balData = useBalance(token);
  const balance = num(balData)
    .div(10 ** 6)
    .toNumber();
  const adjPrice =
    type === ClawFormType.Unstake && clawMintRatio
      ? (price || 0) * (1 / clawMintRatio)
      : price;
  const adjAmount =
    type === ClawFormType.Stake && clawMintRatio
      ? num(amount || 0).times(clawMintRatio)
      : num(amount || 0);

  return (
    <Box py="12">
      <FormActions>
        <FormActionItem
          label="Stake"
          value={type}
          type={ClawFormType.Stake}
          onClick={() => setType(ClawFormType.Stake)}
        />
        <FormActionItem
          label="Unstake"
          type={ClawFormType.Unstake}
          value={type}
          onClick={() => setType(ClawFormType.Unstake)}
        />
      </FormActions>

      <Stack direction="column">
        <Card py={5} px={[8, 8, 12]}>
          <Text textStyle="small" variant="secondary">
            {type == ClawFormType.Stake && "Stake CLAW to receive xCLAW."}
            {type == ClawFormType.Unstake &&
              "Unstake xCLAW to receive CLAW."}
          </Text>
        </Card>

        <Card py="10">
          <Flex>
            <Box flex="1" pr="8">
              <Controller
                name="token"
                control={control}
                rules={{ required: true }}
                render={({ field }) => (
                  <TokenInput hidePrice isSingle {...field} />
                )}
              />
            </Box>
            <Box flex="1">
              <Controller
                name="amount"
                control={control}
                rules={{ required: true }}
                render={({ field }) => (
                  <NewAmountInput
                    asset={token}
                    max={balance}
                    price={adjPrice}
                    {...field}
                  />
                )}
              />
            </Box>
          </Flex>
        </Card>

        <GovStakeFooter
          fee={fee}
          type={type}
          isLoading={isLoading}
          isDisabled={!!(!amount || fee == null || txFeeNotEnough)}
          amount={adjAmount.toNumber()}
          clawMintRatio={clawMintRatio}
        />
      </Stack>

      {error && <WarningMessage my="8" content={error} />}
    </Box>
  );
};

export default GovStakeFormInitial;
