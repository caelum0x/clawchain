import React, { FC, useMemo } from "react";
import { Button } from "@chakra-ui/react";
import { useBalance } from "modules/common";
import { ONE_TOKEN } from "constants/constants";
import num from "libs/num";

type Props = {
  onChange: any;
  asset: string;
  max?: string | number;
  isDisabled?: boolean;
};

const MaxButton: FC<Props> = ({ onChange, max, asset, isDisabled }) => {
  const balance = useBalance(asset);

  const amount = useMemo(() => {
    if (max != null) {
      return max;
    }

    return num(balance).div(ONE_TOKEN).toFixed(6);
  }, [asset, balance, max]);

  if (amount == "0") {
    return null;
  }

  return (
    <Button
      type="button"
      variant="mini"
      onClick={() => onChange(amount)}
      isDisabled={!!isDisabled}
    >
      Max
    </Button>
  );
};

export default MaxButton;
