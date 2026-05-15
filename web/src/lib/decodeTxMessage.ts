import { formatClaw, shortAddr } from "./chain.ts";

export interface DecodedMessage {
  label: string;
  fields: { key: string; value: string }[];
}

/**
 * Decodes a Cosmos SDK transaction message into a human-readable form.
 * Supports MsgSend, MsgDelegate, MsgUndelegate, MsgVote, MsgShield,
 * MsgRegisterAgent, MsgDelegateTask, and falls back to raw JSON.
 */
export function decodeTxMessage(msg: {
  typeUrl: string;
  value?: Record<string, unknown>;
}): DecodedMessage {
  const type = msg.typeUrl;
  const v = msg.value ?? {};
  const shortType = type.split(".").pop() ?? type;

  // MsgSend
  if (type.endsWith("MsgSend")) {
    const amounts = Array.isArray(v.amount) ? v.amount : [];
    const amountStr = amounts
      .map((a: any) =>
        a.denom === "uclaw" ? formatClaw(a.amount ?? "0") : `${a.amount} ${a.denom}`
      )
      .join(", ") || "0";
    return {
      label: "MsgSend",
      fields: [
        { key: "From", value: shortAddr(String(v.from_address ?? "")) },
        { key: "To", value: shortAddr(String(v.to_address ?? "")) },
        { key: "Amount", value: amountStr },
      ],
    };
  }

  // MsgDelegate
  if (type.endsWith("MsgDelegate")) {
    const amt = v.amount as any;
    const amountStr = amt?.denom === "uclaw"
      ? formatClaw(amt?.amount ?? "0")
      : `${amt?.amount ?? "0"} ${amt?.denom ?? ""}`;
    return {
      label: "MsgDelegate",
      fields: [
        { key: "Delegator", value: shortAddr(String(v.delegator_address ?? "")) },
        { key: "Validator", value: shortAddr(String(v.validator_address ?? "")) },
        { key: "Amount", value: amountStr },
      ],
    };
  }

  // MsgUndelegate
  if (type.endsWith("MsgUndelegate")) {
    const amt = v.amount as any;
    const amountStr = amt?.denom === "uclaw"
      ? formatClaw(amt?.amount ?? "0")
      : `${amt?.amount ?? "0"} ${amt?.denom ?? ""}`;
    return {
      label: "MsgUndelegate",
      fields: [
        { key: "Delegator", value: shortAddr(String(v.delegator_address ?? "")) },
        { key: "Validator", value: shortAddr(String(v.validator_address ?? "")) },
        { key: "Amount", value: amountStr },
      ],
    };
  }

  // MsgVote
  if (type.endsWith("MsgVote")) {
    const optionMap: Record<string, string> = {
      "1": "YES",
      "2": "ABSTAIN",
      "3": "NO",
      "4": "NO_WITH_VETO",
      VOTE_OPTION_YES: "YES",
      VOTE_OPTION_ABSTAIN: "ABSTAIN",
      VOTE_OPTION_NO: "NO",
      VOTE_OPTION_NO_WITH_VETO: "NO_WITH_VETO",
    };
    const optionRaw = String(v.option ?? "");
    return {
      label: "MsgVote",
      fields: [
        { key: "Voter", value: shortAddr(String(v.voter ?? "")) },
        { key: "Proposal", value: `#${v.proposal_id ?? "?"}` },
        { key: "Option", value: optionMap[optionRaw] ?? optionRaw },
      ],
    };
  }

  // MsgShield (Privacy module)
  if (type.endsWith("MsgShield")) {
    return {
      label: "MsgShield",
      fields: [
        { key: "Sender", value: shortAddr(String(v.sender ?? v.creator ?? "")) },
        { key: "Amount", value: formatClaw(String(v.amount ?? "0")) },
      ],
    };
  }

  // MsgUnshield (Privacy module)
  if (type.endsWith("MsgUnshield")) {
    return {
      label: "MsgUnshield",
      fields: [
        { key: "Sender", value: shortAddr(String(v.sender ?? v.creator ?? "")) },
        { key: "Amount", value: formatClaw(String(v.amount ?? "0")) },
      ],
    };
  }

  // MsgPrivateTransfer
  if (type.endsWith("MsgPrivateTransfer")) {
    return {
      label: "MsgPrivateTransfer",
      fields: [
        { key: "Sender", value: shortAddr(String(v.sender ?? v.creator ?? "")) },
      ],
    };
  }

  // MsgRegisterAgent
  if (type.endsWith("MsgRegisterAgent")) {
    return {
      label: "MsgRegisterAgent",
      fields: [
        { key: "Creator", value: shortAddr(String(v.creator ?? "")) },
        { key: "Name", value: String(v.name ?? v.agent_name ?? "") },
      ],
    };
  }

  // MsgDelegateTask
  if (type.endsWith("MsgDelegateTask")) {
    return {
      label: "MsgDelegateTask",
      fields: [
        { key: "Delegator", value: shortAddr(String(v.delegator ?? v.creator ?? "")) },
        { key: "Description", value: String(v.description ?? "").slice(0, 100) },
      ],
    };
  }

  // MsgAgentAction
  if (type.endsWith("MsgAgentAction")) {
    return {
      label: "MsgAgentAction",
      fields: [
        { key: "Agent", value: shortAddr(String(v.agent ?? v.creator ?? "")) },
        { key: "Action", value: String(v.action_type ?? v.action ?? "") },
      ],
    };
  }

  // MsgSubmitProposal
  if (type.endsWith("MsgSubmitProposal")) {
    return {
      label: "MsgSubmitProposal",
      fields: [
        { key: "Proposer", value: shortAddr(String(v.proposer ?? "")) },
      ],
    };
  }

  // MsgBeginRedelegate
  if (type.endsWith("MsgBeginRedelegate")) {
    return {
      label: "MsgBeginRedelegate",
      fields: [
        { key: "Delegator", value: shortAddr(String(v.delegator_address ?? "")) },
        { key: "Src Validator", value: shortAddr(String(v.validator_src_address ?? "")) },
        { key: "Dst Validator", value: shortAddr(String(v.validator_dst_address ?? "")) },
      ],
    };
  }

  // Default: show typeUrl + JSON body
  const fields: { key: string; value: string }[] = [];
  for (const [k, val] of Object.entries(v)) {
    if (val === undefined || val === null) continue;
    const s = typeof val === "object" ? JSON.stringify(val) : String(val);
    fields.push({ key: k, value: s.length > 120 ? s.slice(0, 117) + "..." : s });
  }
  return {
    label: shortType,
    fields: fields.length > 0 ? fields : [{ key: "typeUrl", value: type }],
  };
}

/** Maps a typeUrl to a tx category for filtering. */
export function txTypeCategory(typeUrl: string): string {
  if (typeUrl.endsWith("MsgSend") || typeUrl.endsWith("MsgMultiSend")) return "Transfers";
  if (
    typeUrl.endsWith("MsgDelegate") ||
    typeUrl.endsWith("MsgUndelegate") ||
    typeUrl.endsWith("MsgBeginRedelegate") ||
    typeUrl.endsWith("MsgCreateValidator") ||
    typeUrl.endsWith("MsgEditValidator")
  ) return "Staking";
  if (
    typeUrl.endsWith("MsgVote") ||
    typeUrl.endsWith("MsgSubmitProposal") ||
    typeUrl.endsWith("MsgDeposit")
  ) return "Governance";
  if (
    typeUrl.includes("agent") ||
    typeUrl.endsWith("MsgRegisterAgent") ||
    typeUrl.endsWith("MsgDeregisterAgent") ||
    typeUrl.endsWith("MsgAgentAction") ||
    typeUrl.endsWith("MsgAgentHeartbeat") ||
    typeUrl.endsWith("MsgDelegateTask") ||
    typeUrl.endsWith("MsgAcceptTask") ||
    typeUrl.endsWith("MsgCompleteTask") ||
    typeUrl.endsWith("MsgSubmitIntent") ||
    typeUrl.endsWith("MsgRespondIntent") ||
    typeUrl.endsWith("MsgFinalizeIntent") ||
    typeUrl.endsWith("MsgNegotiate")
  ) return "Agent";
  if (
    typeUrl.includes("privacy") ||
    typeUrl.endsWith("MsgShield") ||
    typeUrl.endsWith("MsgUnshield") ||
    typeUrl.endsWith("MsgPrivateTransfer") ||
    typeUrl.endsWith("MsgBatchPrivateTransfer") ||
    typeUrl.endsWith("MsgRegisterViewKey")
  ) return "Privacy";
  if (
    typeUrl.includes("marketplace") ||
    typeUrl.includes("modelregistry") ||
    typeUrl.endsWith("MsgSubmitComputeJob") ||
    typeUrl.endsWith("MsgLeaseComputeResource") ||
    typeUrl.endsWith("MsgRegisterComputeResource") ||
    typeUrl.endsWith("MsgSubmitInferenceJob") ||
    typeUrl.endsWith("MsgRegisterModel") ||
    typeUrl.endsWith("MsgListSkill") ||
    typeUrl.endsWith("MsgPurchaseSkill")
  ) return "GPU";
  return "Other";
}
