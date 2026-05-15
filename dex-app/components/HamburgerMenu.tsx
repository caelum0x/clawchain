import React, { FC } from "react";

import {
  Box,
  Heading,
  IconButton,
  Link,
  Flex,
  Menu,
  MenuButton,
  MenuList,
  Text,
  Divider,
} from "@chakra-ui/react";
import { HamburgerIcon } from "@chakra-ui/icons";
import CloseIcon from "components/icons/CloseIcon";

type Props = {};

const items = [
  { label: "About", url: "https://clawchain.io/" },
  { label: "Docs", url: "https://docs.clawchain.io/" },
  { label: "Code", url: "https://github.com/clawchain/clawdex" },
  { label: "Discord", url: "https://discord.gg/clawchain" },
  { label: "Medium", url: "https://clawchain.medium.com/" },
  {
    label: "Terms & Privacy Policy",
    url: "https://clawchain.io/terms-and-conditions",
  },
];

const HamburgerMenu: FC<Props> = ({}) => (
  <Menu>
    {({ onClose }) => (
      <>
        <MenuButton color="white">
          <HamburgerIcon />
        </MenuButton>

        <MenuList bg="otherColours.overlay" color="brand.deepBlue" p="0">
          <Flex p={6} justify="space-between" align="center">
            <Heading>Menu</Heading>
            <IconButton
              aria-label="Close"
              variant="simple"
              isRound
              _hover={{
                bg: "rgba(0,0,0,0.1)",
              }}
              icon={
                <CloseIcon w="6" h="6" color="#000D37" BackgroundOpacity="0" />
              }
              onClick={onClose}
            />
          </Flex>
          <Box pb={4}>
            <Divider borderColor="black.100" />
            {items.map(({ label, url }) => (
              <Box key={label}>
                <Link href={url} isExternal fontSize="12px">
                  <Text px={6} py={2}>
                    {label}
                  </Text>
                </Link>
                <Divider borderColor="black.100" />
              </Box>
            ))}
          </Box>
        </MenuList>
      </>
    )}
  </Menu>
);

export default HamburgerMenu;
