import React, { FC } from "react";
import { useKeplrWallet } from "context/KeplrWalletContext";
import { Text, HStack, Flex, chakra, Image } from "@chakra-ui/react";
import Modal from "components/modals/Modal";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

const ButtonStyle = {
  transition: "0.2s all",
  p: "6",
  borderRadius: "xl",
  bg: "brand.purple",
  color: "white",
  width: "100%",
  mb: "4",
};

const ConnectWalletModal: FC<Props> = ({ isOpen, onClose }) => {
  const { connect } = useKeplrWallet();

  const handleConnect = async () => {
    try {
      await connect();
      onClose();
    } catch (err) {
      console.error("Failed to connect Keplr:", err);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Connect to a wallet">
      <Flex
        direction="column"
        justify="center"
        align="center"
        textAlign="center"
      >
        <chakra.button
          {...ButtonStyle}
          _hover={{
            bg: "white",
            color: "brand.dark",
          }}
          onClick={handleConnect}
        >
          <HStack justify="space-between">
            <Text>Keplr Wallet</Text>
            <Image
              bg="white"
              borderRadius="full"
              p="1"
              src="https://assets.leapwallet.io/keplr-logo.png"
              htmlWidth="24"
              alt="Keplr"
            />
          </HStack>
        </chakra.button>
      </Flex>
    </Modal>
  );
};

export default ConnectWalletModal;
