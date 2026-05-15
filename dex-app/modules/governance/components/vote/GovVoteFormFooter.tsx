import React, { FC } from "react";
import { useKeplrWallet } from "context/KeplrWalletContext";
import { StdFee as Fee } from "@cosmjs/stargate";
import { Button, Flex } from "@chakra-ui/react";
import FormFee from "components/common/FormFee";

type Props = {
  action: string;
  fee?: Fee | undefined;
  isLoading?: boolean;
  txFeeNotEnough?: boolean;
  error?: any;
  onClick: () => void;
};

const GovVoteFormFooter: FC<Props> = ({
  action,
  fee,
  isLoading,
  txFeeNotEnough,
  error,
  onClick,
}) => {
  const { isConnected } = useKeplrWallet();
  const variant = action === "for" ? "votegreen" : "votered";

  return (
    <Flex flexDir="column" align="center" mt="8">
      <Button
        variant={variant}
        minW={["32", "64"]}
        mb="2"
        size="md"
        type="submit"
        isLoading={!!isLoading}
        isDisabled={
          !isConnected ||
          error ||
          !fee ||
          txFeeNotEnough
        }
        onClick={onClick}
      >
        Confirm Vote
      </Button>
      <FormFee fee={fee} />
    </Flex>
  );
};

export default GovVoteFormFooter;
