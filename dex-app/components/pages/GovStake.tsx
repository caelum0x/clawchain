import React, { useState } from "react";
import { Flex, Box } from "@chakra-ui/react";

import { ClawFormType } from "types/common";

import { GovStakeForm } from "modules/governance";
import { useRouter } from "next/router";

const GovStake = () => {
  const { query } = useRouter();
  const queryAction =
    query["action"] == "stake" ? ClawFormType.Stake : ClawFormType.Unstake;
  const [type, setType] = useState(queryAction);

  return (
    <Flex h="100%" justify="center">
      <Box maxW="650px" mb={[75, 75, 0]} mx={[25, 25, 0]}>
        <GovStakeForm type={type} setType={setType} />
      </Box>
    </Flex>
  );
};

export default GovStake;
