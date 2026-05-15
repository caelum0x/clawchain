import { toBase64 } from "libs/terra";
import { createExecuteMsg } from "libs/cosmjs";
import { validateJsonInput } from "modules/common";
import { Proposal } from "types/common";

export const createProposalMsg = (
  sender: string,
  assembly: string,
  xClawToken: string,
  amount: string,
  proposal: Proposal
) => {
  const executeMsg = {
    send: {
      contract: assembly,
      amount,
      msg: toBase64({
        submit_proposal: {
          title: proposal.title,
          description: proposal.description,
          link:
            proposal.link && proposal.link.length > 0 ? proposal.link : null,
          messages:
            proposal.messages &&
            proposal.messages.length > 0 &&
            validateJsonInput(proposal.messages)
              ? JSON.parse(proposal.messages)
              : null,
        },
      }),
    },
  };

  const msgs = createExecuteMsg(sender, xClawToken, executeMsg);

  return msgs;
};
