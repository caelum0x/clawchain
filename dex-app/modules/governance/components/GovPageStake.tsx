import React from "react";
import { useKeplrWallet } from "context/KeplrWalletContext";
import {
  Box,
  Grid,
  Text,
  Button,
  Flex,
  Divider,
  Heading,
  useMediaQuery,
} from "@chakra-ui/react";
import { fromClawAmount } from "libs/terra";
import num from "libs/num";
import {
  CLAW_DISCORD_LINK,
  CLAW_FORUM_LINK,
  MOBILE_MAX_WIDTH,
} from "constants/constants";
import SummaryCard from "components/SummaryCard";
import Card from "components/Card";
import { NextLink, handleBigPercentage } from "modules/common";
import {
  composeClawRatioDisplay,
  composeProtocolRatioDisplay,
} from "modules/governance/helpers";
import {
  useGovStakingRatio,
  useGovStakingAPY,
  useGovStakingBalances,
  useClawMintRatio,
} from "modules/governance";

const GovPageStake = () => {
  const [isMobile] = useMediaQuery(`(max-width: ${MOBILE_MAX_WIDTH})`);
  const {
    clawBalance,
    xClawBalance,
    stakedClawBalance,
    xClawSupply,
    clawCircSupply,
  } = useGovStakingBalances({
    getClawBalance: true,
    getXClawBalance: true,
    getStakedClawBalance: true,
    getClawCircSupply: true,
    getXClawSupply: true,
  });
  const stakingRatio = useGovStakingRatio();
  const clawMintRatio = useClawMintRatio();
  const stakingAPY = useGovStakingAPY();
  const clawDisabled = num(clawBalance).eq(0);
  const xClawDisabled = num(xClawBalance).eq(0);
  const { isConnected } = useKeplrWallet();

  const data = [
    {
      label: "Total Staked CLAW",
      value: fromClawAmount(stakedClawBalance, "0,0.00"),
    },
    {
      label: "APY",
      value:
        stakingAPY !== null
          ? stakingAPY === 0
            ? `>100k%`
            : `${handleBigPercentage(stakingAPY)}`
          : `-`,
      tooltip:
        "The APY (CLAW denominated) is calculated using the average daily CLAW amount going to xCLAW over the last 7 days. It is derived from fees collected into the maker contract, not from CLAW sent to stakers and it excludes any fees accrued prior to the xCLAW launch.",
    },
    {
      label: "xCLAW:CLAW",
      value: composeClawRatioDisplay(clawMintRatio),
    },
    {
      label: "Protocol Staking Ratio",
      value: composeProtocolRatioDisplay(
        stakedClawBalance,
        xClawSupply,
        clawCircSupply,
        stakingRatio
      ),
    },
  ];

  return (
    <>
      <Box px={["1", null, "6"]} mb="4" mt={["4", null, "12"]}>
        <Heading fontSize="xl">My CLAW</Heading>
      </Box>

      <SummaryCard data={data} />

      <Grid
        mt="12"
        templateColumns={["auto", "auto", "auto", "repeat(2, 1fr)"]}
        gap={8}
      >
        <Card
          order={[2, 2, 2, 1]}
          flex={1}
          display="flex"
          flexDir="column"
          justifyContent="center"
        >
          <Text textStyle={["lg", "lg", "h3"]}>Get Involved</Text>
          <Text textStyle="small" variant="secondary" mt="4" mb="6">
            Stake CLAW for xCLAW in order to receive a % of ClawDEX smart
            contract fees.
            <br />
            {isMobile && <br />}
            To learn more about ClawDEX, join the community on Discord or on
            the Forum.
          </Text>
          <Flex
            flexDirection={isMobile ? "column" : "row"}
            gap={isMobile ? "6" : "0"}
            justify="space-between"
          >
            <Button
              as="a"
              variant="primary"
              href={CLAW_DISCORD_LINK}
              target="_blank"
              rel="noreferrer"
            >
              Join Discord
            </Button>
            <Button
              as="a"
              variant="primary"
              href={CLAW_FORUM_LINK}
              target="_blank"
              rel="noreferrer"
            >
              Join the Forum
            </Button>
          </Flex>
        </Card>
        <Card
          order={[1, 1, 1, 2]}
          flex={1}
          display="flex"
          flexDir="column"
          justifyContent="center"
        >
          <Flex justify="space-between">
            <Box>
              <Text textStyle="h3">
                {fromClawAmount(clawBalance, "0,0.00")}
              </Text>
              <Text textStyle="small" variant="dimmed">
                CLAW in My Wallet
              </Text>
            </Box>
            <Box textAlign="right">
              <Text textStyle="h3">
                {fromClawAmount(xClawBalance, "0,0.00")}
              </Text>
              <Text textStyle="small" variant="dimmed">
                My xCLAW Balance
              </Text>
            </Box>
          </Flex>

          <Divider bg="white.200" my="8" />

          <Flex
            flexDirection={isMobile ? "column" : "row"}
            gap={isMobile ? "6" : "0"}
            justify="space-between"
          >
            <NextLink
              href="/governance/stake"
              passHref
              isDisabled={
                clawDisabled || !isConnected
              }
            >
              <Button
                as="a"
                type="button"
                variant="primary"
                isDisabled={
                  clawDisabled || !isConnected
                }
              >
                Stake CLAW
              </Button>
            </NextLink>
            <NextLink
              href="/governance/unstake"
              passHref
              isDisabled={
                xClawDisabled || !isConnected
              }
            >
              <Button
                as="a"
                type="button"
                variant="primary"
                isDisabled={
                  xClawDisabled || !isConnected
                }
              >
                Unstake xCLAW
              </Button>
            </NextLink>
          </Flex>
        </Card>
      </Grid>
    </>
  );
};

export default GovPageStake;
