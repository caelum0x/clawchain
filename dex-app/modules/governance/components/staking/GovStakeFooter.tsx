import React, { FC } from "react";
import { StdFee as Fee } from "@cosmjs/stargate";
import { handleBigAndTinyAmount } from "modules/common";
import { ClawFormType } from "types/common";
import CommonFooter from "components/CommonFooter";
import { composeClawRatioDisplay } from "modules/governance/helpers";

type Props = {
  amount: number;
  fee?: Fee | undefined;
  type: ClawFormType;
  isLoading: boolean;
  isDisabled: boolean;
  clawMintRatio?: number | null | undefined;
};

const GovStakeFooter: FC<Props> = ({
  fee,
  type,
  isLoading,
  isDisabled,
  amount,
  clawMintRatio,
}) => {
  const title = type === ClawFormType.Stake ? "Stake CLAW" : "Unstake xCLAW";

  return (
    <CommonFooter
      fee={fee}
      cells={[
        {
          title: "xCLAW:CLAW",
          value: composeClawRatioDisplay(clawMintRatio),
        },
        {
          title:
            type === ClawFormType.Stake ? "xCLAW Received" : "CLAW Received",
          value: amount
            ? type === ClawFormType.Stake
              ? handleBigAndTinyAmount(amount)
              : handleBigAndTinyAmount(amount * (1 / (clawMintRatio || 0)))
            : "-",
        },
      ]}
      confirmButton={{
        title: title,
        isDisabled,
        isLoading,
        type: "submit",
      }}
    />
  );
};

export default GovStakeFooter;
