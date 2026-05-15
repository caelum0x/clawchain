import { toUtf8 } from "@cosmjs/encoding";
import { EncodeObject } from "@cosmjs/proto-signing";

export function createExecuteMsg(
  sender: string,
  contract: string,
  msg: Record<string, unknown>,
  funds: { denom: string; amount: string }[] = []
): EncodeObject {
  return {
    typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
    value: {
      sender,
      contract,
      msg: toUtf8(JSON.stringify(msg)),
      funds,
    },
  };
}
