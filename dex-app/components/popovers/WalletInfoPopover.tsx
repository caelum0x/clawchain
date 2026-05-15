import React, { FC } from "react";
import {
  Box,
  chakra,
  Center,
  Flex,
  HStack,
  Text,
  useBreakpointValue,
} from "@chakra-ui/react";
import useAddress from "hooks/useAddress";
import { useKeplrWallet } from "context/KeplrWalletContext";
import { truncate, displayTNS } from "libs/text";
import useTNS from "hooks/useTNS";
import PopoverWrapper from "components/popovers/PopoverWrapper";
import ClawIcon from "components/icons/ClawIcon";

import WalletOverlay from "components/pages/overlays/wallet";
import { useBalance } from "modules/common";
import { fromClawAmount } from "libs/terra";

const WalletInfoPopover: FC = () => {
  const { address: keplrAddress } = useKeplrWallet();
  const balance = useBalance("uusd");
  const walletAddress = useAddress() || keplrAddress || "";
  const tnsName = useTNS(walletAddress);

  const offset: [number, number] | undefined = useBreakpointValue({
    base: [0, 0],
    sm: [-60, -40],
  });

  return (
    <PopoverWrapper
      title="My wallet"
      offset={offset || [0, 0]}
      triggerElement={() => (
        <chakra.button type="button">
          <Flex color="white" justify="center">
            <Box
              color="white"
              bg="brand.lightBlue"
              py="2"
              px="3"
              borderTopLeftRadius="full"
              borderBottomLeftRadius="full"
              mr="0.5"
            >
              <HStack spacing="3">
                <ClawIcon width="1.25rem" height="1.25rem" />
                <Text fontSize="sm" color="white">
                  {tnsName && displayTNS(tnsName)}
                  {!tnsName && walletAddress && truncate(walletAddress, [2, 4])}
                </Text>
              </HStack>
            </Box>
            <Center
              color="white"
              bg="brand.lightBlue"
              py="2"
              px="3"
              borderTopRightRadius="full"
              borderBottomRightRadius="full"
            >
              <HStack spacing="3">
                <Text fontSize="sm" color="white">
                  CLAW
                </Text>
                <Text fontSize="sm" color="white">
                  {fromClawAmount(balance, "0,0.00")}
                </Text>
              </HStack>
            </Center>
          </Flex>
        </chakra.button>
      )}
    >
      <WalletOverlay />
    </PopoverWrapper>
  );
};

export default WalletInfoPopover;
