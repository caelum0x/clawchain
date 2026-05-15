import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { StdFee, calculateFee, GasPrice } from "@cosmjs/stargate";
import { EncodeObject } from "@cosmjs/proto-signing";
import BigNumber from "bignumber.js";
import { ONE_TOKEN } from "constants/constants";
import { getTokenDenom } from "modules/common";
import numeral from "numeral";

export const getAssetAmountsInPool = (assets: any, token: string) => {
  return assets.reduce(
    (prev: any, a: any) => {
      const key = getTokenDenom(a.info) === token ? "token1" : "token2";

      return {
        ...prev,
        [key]: a.amount,
      };
    },
    { token1: null, token2: null }
  );
};

type EstimateFeeOpts = {
  client: SigningCosmWasmClient;
  address: string;
  msgs: EncodeObject[] | null | undefined;
  opts: { gasAdjustment?: number };
};

export const estimateFee = async ({
  client,
  address,
  msgs,
  opts: { gasAdjustment = 1.4 },
}: EstimateFeeOpts): Promise<StdFee> => {
  if (msgs == null || client == null || address == null) {
    throw new Error("`client`, `address` or `msgs` is null");
  }

  const gasEstimate = await client.simulate(address, msgs, "");
  const adjustedGas = Math.ceil(gasEstimate * gasAdjustment);
  const gasPrice = GasPrice.fromString("0.025uclaw");

  return calculateFee(adjustedGas, gasPrice);
};

export const toBase64 = (obj: object) => {
  return Buffer.from(JSON.stringify(obj)).toString("base64");
};

/**
 * Format chain amount
 * @param value - string: amount from ClawChain blockchain
 * @param format - string: numeral format
 * @returns string
 */
export const fromClawAmount = (
  value: BigNumber.Value = "0",
  format = "0,0.00a"
): string => {
  const amount = new BigNumber(value).div(ONE_TOKEN);
  return numeral(amount).format(format).toUpperCase();
};

export const toClawAmount = (value: BigNumber.Value = "0"): string => {
  return new BigNumber(value).dp(6).times(ONE_TOKEN).toString();
};

export const calcMinimumTaxAmount = (
  amount: BigNumber.Value,
  { taxRate, taxCap }: { taxRate: BigNumber.Value; taxCap: BigNumber.Value }
) => {
  return BigNumber.min(new BigNumber(amount).times(taxRate), taxCap)
    .integerValue(BigNumber.ROUND_FLOOR)
    .toString();
};
