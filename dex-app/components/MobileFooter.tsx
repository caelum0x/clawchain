import React, { FC } from "react";
import {
  Box,
  Flex,
  Image,
  Text,
  Button,
  useDisclosure,
} from "@chakra-ui/react";
import { useQueryClient } from "react-query";
import { useKeplrWallet } from "context/KeplrWalletContext";
import { truncate, displayTNS } from "libs/text";
import {
  useBalance,
  useTokenInfo,
  handleBigAndTinyAmount,
} from "modules/common";
import { useTotalRewardValueInUst } from "modules/reward";
import useTNS from "hooks/useTNS";
import useAddress from "hooks/useAddress";
import MoneyStackIcon from "components/icons/MoneyStackIcon";
import ClawIcon from "components/icons/ClawIcon";

import ConnectWalletModal from "components/modals/ConnectWalletModal";
import WalletInfoModal from "components/modals//WalletInfoModal";
import RewardCentreModal from "components/modals//RewardCentreModal";
import { fromClawAmount } from "libs/terra";

const FOOTER_HEIGHT = "60px";
const ICON_SIZE = "1.5rem";

const ConnectWalletButton = ({
  onOpenConnect,
}: {
  onOpenConnect: () => void;
}) => {
  return (
    <Button
      w="100%"
      m="2"
      variant="simple"
      bg="brand.purple"
      color="white"
      fontSize="md"
      borderRadius="md"
      onClick={onOpenConnect}
    >
      Connect Wallet
    </Button>
  );
};

const RewardTab = ({
  onOpenReward,
  formatted,
}: {
  onOpenReward: () => void;
  formatted: string;
}) => {
  return (
    <Flex
      flexBasis="100%"
      bg="brand.green"
      m="1"
      borderRadius="full"
      align="center"
      justifyContent="space-between"
      onClick={onOpenReward}
    >
      <Flex color="#00581E" ml="3">
        <MoneyStackIcon width="1.5rem" height="1.5rem" />
      </Flex>
      <Text mr="2" fontWeight="500" color="#00581E" isTruncated>
        {formatted}
      </Text>
    </Flex>
  );
};

const WalletTab = ({
  onOpenWallet,
  tnsName,
  walletAddress,
  iconUST,
  balance,
}: {
  onOpenWallet: () => void;
  tnsName: string | null;
  walletAddress: string | null;
  iconUST: string;
  balance: any;
}) => {
  return (
    <>
      <Flex
        flexBasis="100%"
        align="center"
        justifyContent="center"
        onClick={onOpenWallet}
      >
        <Flex>
          <ClawIcon width={ICON_SIZE} height={ICON_SIZE} />
        </Flex>
        <Text mx="2" fontWeight="500" color="white">
          {tnsName && displayTNS(tnsName)}
          {!tnsName && walletAddress && truncate(walletAddress, [2, 4])}
        </Text>
      </Flex>
      <Flex flexBasis="100%" onClick={onOpenWallet}>
        <Box w="1px" bg="white.300" my="2.5" />
        <Flex flex="1" align="center" justifyContent="center">
          <Flex>
            <Image
              src={iconUST}
              width={ICON_SIZE}
              height={ICON_SIZE}
              alt="CLAW Logo"
            />
          </Flex>
          <Text mx="2" fontWeight="500" color="white">
            {fromClawAmount(balance, "0,0.00")}
          </Text>
        </Flex>
      </Flex>
    </>
  );
};

const MobileFooter: FC = () => {
  const queryClient = useQueryClient();
  const { getIcon } = useTokenInfo();
  const { isConnected, address: keplrAddress } = useKeplrWallet();
  const walletAddress = useAddress() || keplrAddress;
  const tnsName = useTNS(walletAddress || "");

  const iconUST = getIcon("uusd");
  const balance = useBalance("uusd");

  const totalValue = useTotalRewardValueInUst();
  const formatted = handleBigAndTinyAmount(totalValue, undefined, true);

  const {
    isOpen: isOpenConnect,
    onOpen: onOpenConnect,
    onClose: onCloseConnect,
  } = useDisclosure();
  const {
    isOpen: isOpenReward,
    onOpen: onOpenReward,
    onClose: onCloseReward,
  } = useDisclosure();
  const {
    isOpen: isOpenWallet,
    onOpen: onOpenWallet,
    onClose: onCloseWallet,
  } = useDisclosure();

  return (
    <Flex
      pos="fixed"
      bg="brand.deepBlue"
      bottom="0"
      width="100%"
      height={FOOTER_HEIGHT}
      zIndex="10"
    >
      {!isConnected && (
        <ConnectWalletButton onOpenConnect={onOpenConnect} />
      )}
      {isConnected && (
        <Flex
          w="100%"
          m="2"
          bg="#242336"
          justifyContent="space-between"
          color="white"
          borderRadius="md"
        >
          <RewardTab
            onOpenReward={() => {
              queryClient.invalidateQueries("rewards");
              queryClient.invalidateQueries(["userInfo", "lockdrop"]);
              onOpenReward();
            }}
            formatted={formatted}
          />
          <WalletTab
            onOpenWallet={onOpenWallet}
            tnsName={tnsName}
            walletAddress={walletAddress}
            iconUST={iconUST}
            balance={balance}
          />
        </Flex>
      )}
      <ConnectWalletModal isOpen={isOpenConnect} onClose={onCloseConnect} />
      <RewardCentreModal isOpen={isOpenReward} onClose={onCloseReward} />
      <WalletInfoModal isOpen={isOpenWallet} onClose={onCloseWallet} />
    </Flex>
  );
};

export default MobileFooter;
