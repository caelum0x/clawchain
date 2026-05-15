import { useCallback } from "react";
import { StdFee } from "@cosmjs/stargate";
import { EncodeObject } from "@cosmjs/proto-signing";
import { useKeplrWallet } from "context/KeplrWalletContext";
import { useClawDEX, useTokenInfo } from "modules/common";

export enum TxPostError {
  UserDenied,
  CreateTxFailed,
  TxFailed,
  Timeout,
  TxUnspecifiedError,
  UnknownError,
  InsufficientFunds,
  InsufficientFee,
}

export type TxErrorHandler = (
  errorType: TxPostError,
  originalError: Error
) => void;

export type UseTxNotificationDetails =
  | {
      type: "swap" | "provide" | "withdraw" | "createPool";
      data: {
        token1: string | null;
        token2: string | null;
      };
    }
  | {
      type: "unstakeLp" | "lockdropUnlockLp";
      data: {
        token: string;
      };
    }
  | {
      type: "govVote";
      data: {
        proposal_id: string;
        action: string;
      };
    }
  | {
      type:
        | "govStake"
        | "govUnstake"
        | "auctionUnlockLp"
        | "stakeLp"
        | "claimRewards"
        | "createProposal";
    };

type Params = {
  onPosting?: () => void;
  onBroadcasting?: (txHash: string) => void;

  onError?: TxErrorHandler;

  notification: UseTxNotificationDetails;
};

const classifyError = (error: Error): TxPostError => {
  const msg = error.message || "";

  if (msg.includes("Request rejected") || msg.includes("User denied")) {
    return TxPostError.UserDenied;
  } else if (/timeout/i.test(msg)) {
    return TxPostError.Timeout;
  } else if (msg.includes("insufficient funds")) {
    return TxPostError.InsufficientFunds;
  } else if (msg.includes("insufficient fee")) {
    return TxPostError.InsufficientFee;
  } else if (msg.includes("failed to execute")) {
    return TxPostError.TxFailed;
  } else if (msg.includes("failed to simulate") || msg.includes("create tx")) {
    return TxPostError.CreateTxFailed;
  } else {
    return TxPostError.UnknownError;
  }
};

export const useTx = ({
  onPosting,
  onBroadcasting,
  onError,
  notification,
}: Params) => {
  const { client, address } = useKeplrWallet();
  const { addNotification } = useClawDEX();
  const { getSymbol } = useTokenInfo();

  const errorNotificationTitle = (
    notification: UseTxNotificationDetails
  ): string => {
    switch (notification.type) {
      case "swap": {
        const { token1, token2 } = notification.data;

        return `Swap from ${getSymbol(token1 || "")} to ${getSymbol(
          token2 || ""
        )} failed`;
      }
      case "claimRewards":
        return "Failed to claim rewards";
      case "auctionUnlockLp":
        return "Failed to unlock LP token";
      case "stakeLp":
        return "Stake LP tokens failed";
      case "unstakeLp":
        return "Unstake LP tokens failed";
      case "provide": {
        const { token1, token2 } = notification.data;

        return `Provide liquidity for ${getSymbol(
          token1 || ""
        )} and ${getSymbol(token2 || "")} failed`;
      }
      case "withdraw": {
        const { token1, token2 } = notification.data;

        return `Withdraw liquidity for ${getSymbol(
          token1 || ""
        )} and ${getSymbol(token2 || "")} failed`;
      }
      case "createPool": {
        const { token1, token2 } = notification.data;

        return `Failed to create pool ${getSymbol(token1 || "")} - ${getSymbol(
          token2 || ""
        )}`;
      }
      case "createProposal":
        return "Failed to submit an Assembly proposal";
      case "govVote": {
        const { proposal_id } = notification.data;

        return `Failed to vote on proposal ${proposal_id}`;
      }
    }

    return "Failed";
  };

  const errorNotificationDescription = (
    errorEnum: TxPostError,
    originalError: Error
  ) => {
    switch (errorEnum) {
      case TxPostError.Timeout:
        return "Timed out. Please try again.";
      case TxPostError.InsufficientFunds:
        return "We're sorry, you don't have enough funds to complete this request. Please try again when you have more funds available.";
      case TxPostError.InsufficientFee:
        return "Sorry, the specified fee was not enough to cover the cost of this transaction. Please try again.";
      case TxPostError.CreateTxFailed:
        return originalError.message;
      default:
        return "There was an unexpected error.";
    }
  };

  const addErrorNotification = (
    errorEnum: TxPostError,
    originalError: Error
  ) => {
    // Ignore UserDenied errors
    if (errorEnum !== TxPostError.UserDenied) {
      addNotification({
        notification: {
          type: "error",
          title: errorNotificationTitle(notification),
          description: errorNotificationDescription(errorEnum, originalError),
        },
      });
    }
  };

  const submit = useCallback(
    async ({
      msgs,
      fee,
    }: {
      msgs: EncodeObject[];
      fee?: StdFee | undefined;
    }) => {
      if (!client || !address || fee == null || msgs == null || msgs.length < 1) {
        return;
      }

      onPosting?.();

      try {
        const result = await client.signAndBroadcast(address, msgs, fee);

        if (result.code !== 0) {
          throw new Error(
            result.rawLog || `Transaction failed with code ${result.code}`
          );
        }

        onBroadcasting?.(result.transactionHash);

        addNotification({
          notification: {
            type: "started",
            txHash: result.transactionHash,
            txType: notification.type,
            // @ts-ignore
            data: (notification as any).data,
          },
        });
      } catch (e: any) {
        const errorEnum = classifyError(e);

        addErrorNotification(errorEnum, e);

        onError?.(errorEnum, e);
      }
    },
    [client, address, onPosting, onBroadcasting, onError]
  );

  return {
    submit,
  };
};
