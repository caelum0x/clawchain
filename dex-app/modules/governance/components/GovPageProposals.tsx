import React from "react";
import {
  Box,
  Button,
  Flex,
  Heading,
  Text,
  useMediaQuery,
} from "@chakra-ui/react";
import { useKeplrWallet } from "context/KeplrWalletContext";
import { MOBILE_MAX_WIDTH } from "constants/constants";

import { NextLink } from "modules/common";
import { useProposals, GovProposalDash } from "modules/governance";

const GovPageProposals = () => {
  const [isMobile] = useMediaQuery(`(max-width: ${MOBILE_MAX_WIDTH})`);
  const { isConnected } = useKeplrWallet();
  const proposals = useProposals();

  return (
    <Box my="24" color="white">
      <Flex px="2" mb="6" justify="space-between" align="center">
        <Box px={["1", null, "6"]}>
          <Heading fontSize="xl">Assembly Proposals</Heading>
        </Box>
        <NextLink
          href="/governance/new-proposal"
          passHref
          isDisabled={!isConnected}
        >
          <Button
            borderRadius="md"
            variant="primary"
            isDisabled={!isConnected}
            // @ts-ignore
            isMobile={isMobile}
          >
            Submit Proposal
          </Button>
        </NextLink>
      </Flex>
      {proposals?.length > 0 && <GovProposalDash proposals={proposals} />}
      {proposals?.length === 0 && (
        <Text my="50px" color="whiteAlpha.500" textAlign="center">
          No active proposals
        </Text>
      )}
    </Box>
  );
};

export default GovPageProposals;
