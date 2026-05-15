import { createExecuteMsg } from "libs/cosmjs";

export const createVoteMsg = (
  sender: string,
  assembly: string,
  proposal_id: number,
  vote: string
) => {
  const msg = createExecuteMsg(sender, assembly, {
    cast_vote: {
      proposal_id,
      vote,
    },
  });

  return msg;
};
