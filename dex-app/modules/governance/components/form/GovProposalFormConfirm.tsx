import React, { FC } from "react";
import { StdFee as Fee } from "@cosmjs/stargate";

import FormConfirm from "components/common/FormConfirm";
import FormSummary from "components/governance/FormSummary";

import { Proposal } from "types/common";
import { ONE_TOKEN } from "constants/constants";

type Props = {
  fee?: Fee | undefined;
  xClawPrice?: number | undefined;
  xClawRequired?: string | undefined;
  proposal: Proposal;
  onCloseClick: () => void;
};

const GovProposalFormConfirm: FC<Props> = ({
  fee,
  xClawPrice,
  xClawRequired,
  proposal,
  onCloseClick,
}) => {
  const xClawRequiredTokens = Number(xClawRequired) / ONE_TOKEN || undefined;

  return (
    <FormConfirm
      //maxW="540px"
      fee={fee}
      title="Submit Proposal"
      titleLarge={true}
      actionLabel="Submit Proposal"
      buttonVariant="primarywhite"
      buttonRadius="md"
      buttonSize="md"
      contentComponent={
        <FormSummary
          proposal={proposal}
          xClawRequiredTokens={xClawRequiredTokens}
          xClawPrice={xClawPrice}
        />
      }
      onCloseClick={onCloseClick}
      taxRate={0.002}
    />
  );
};

export default GovProposalFormConfirm;
