import React, { FC, useCallback, useEffect, useState, useMemo } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { chakra } from "@chakra-ui/react";
import { useRouter } from "next/router";
import { ClawFormType } from "types/common";
import {
  useContracts,
  useNotEnoughUSTBalanceToPayFees,
  useTx,
} from "modules/common";
import { useTokenPriceInUstWithSimulate } from "modules/swap";
import { useGovStake, useClawMintRatio } from "modules/governance";
import GovStakeFormInitial from "./GovStakeFormInitial";
import FormLoading from "components/common/FormLoading";
import useEstimateFee from "hooks/useEstimateFee";

type FormValue = {
  amount: string;
  token: string;
};

type Props = {
  type: ClawFormType;
  setType: (v: ClawFormType) => void;
};

const GovStakeForm: FC<Props> = ({ type, setType }) => {
  const { clawToken, xClawToken } = useContracts();
  const clawMintRatio = useClawMintRatio();
  const [isPosting, setIsPosting] = useState(false);
  const router = useRouter();

  const methods = useForm<FormValue>({
    defaultValues: {
      amount: "",
      token: clawToken,
    },
  });
  const notEnoughUSTToPayFees = useNotEnoughUSTBalanceToPayFees();

  const error = useMemo(() => {
    if (notEnoughUSTToPayFees) {
      return "Insufficient CLAW to pay for the transaction.";
    }

    return false;
  }, [notEnoughUSTToPayFees]);

  const { watch, setValue } = methods;
  const { amount } = watch();
  let price = useTokenPriceInUstWithSimulate(clawToken);

  const { msgs } = useGovStake({
    type,
    amount: Number(amount),
  });

  const { submit } = useTx({
    notification: {
      type: type == ClawFormType.Stake ? "govStake" : "govUnstake",
    },
    onPosting: () => {
      setIsPosting(true);
    },
    onBroadcasting: () => {
      router.push("/governance");
    },
    onError: () => {
      setIsPosting(false);
    },
  });

  const { fee, isLoading: feeIsLoading } = useEstimateFee({
    msgs,
  });

  const onSubmit = useCallback(() => {
    submit({
      msgs,
      fee,
    });
  }, [msgs, fee]);

  useEffect(() => {
    if (type == ClawFormType.Stake) {
      setValue("token", clawToken);
    }
    if (type == ClawFormType.Unstake) {
      setValue("token", xClawToken);
    }

    setValue("amount", "");
  }, [type, xClawToken, clawToken, setValue]);

  if (isPosting) {
    return <FormLoading />;
  }

  return (
    <FormProvider {...methods}>
      <chakra.form onSubmit={methods.handleSubmit(onSubmit)} width="full">
        <GovStakeFormInitial
          type={type}
          setType={setType}
          amount={amount}
          price={price}
          clawMintRatio={clawMintRatio}
          error={error}
          isLoading={feeIsLoading}
          txFeeNotEnough={notEnoughUSTToPayFees}
          fee={fee}
        />
      </chakra.form>
    </FormProvider>
  );
};

export default GovStakeForm;
