// @ts-nocheck

import SwapForm from "components/swap/SwapForm";
import {
  render,
  screen,
  act,
  waitForElementToBeRemoved,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useTx } from "modules/common";
import { useSwap } from "modules/swap";

jest.mock("context/KeplrWalletContext", () => ({
  useKeplrWallet: () => ({
    address: "claw1testaddr",
    client: null,
    isConnected: true,
    connect: jest.fn(),
    disconnect: jest.fn(),
  }),
}));

jest.mock("hooks/useEstimateFee", () =>
  jest.fn(() => ({
    fee: {
      amount: [{ denom: "uclaw", amount: "0" }],
      gas: "200000",
    },
    isLoading: false,
  }))
);

jest.mock("hooks/useAddress", () => jest.fn(() => "claw1testaddr"));

jest.mock("modules/common/context", () => {
  return {
    useClawDEX: jest.fn().mockReturnValue({
      tokenGraph: {},
      tokens: {
        uclaw: {},
        claw123: {},
      },
    }),
  };
});

jest.mock("modules/common", () => {
  const original = jest.requireActual("modules/common");

  return {
    ...original,
    useTokenInfo: () => ({
      getDecimals: () => 6,
      getSymbol: (token: string) => {
        return {
          claw123: "FOO",
          uclaw: "CLAW",
        }[token];
      },
      getIcon: () => {},
      isHidden: () => false,
    }),
    useBalance: () => 100_000_000,
    useTx: jest.fn(),
  };
});

jest.mock("modules/swap", () => {
  const original = jest.requireActual("modules/swap");

  return {
    ...original,
    useSwap: jest.fn(),
    useSwapRoute: () => [
      {
        contract_addr: "claw1pool456",
        from: "uclaw",
        to: "claw123",
        type: "xyk",
      },
    ],
    useTokenPriceInUstWithSimulate: (token: string) => {
      return {
        uclaw: 1,
        claw123: 42,
      }[token];
    },
    usePriceImpact: () => 0,
    usePriceImpactMultiSwap: () => 0,
  };
});

describe("SwapForm", () => {
  const renderAndSwap = async () => {
    let successCallback: Function;

    (useSwap as jest.Mock).mockImplementation(({ onSimulateSuccess }) => {
      successCallback = onSimulateSuccess;

      return {
        msgs: [],
        minReceive: 0,
        simulated: {
          isLoading: false,
          price: 84000000,
          commission: 1,
        },
      };
    });

    render(<SwapForm defaultToken1="uclaw" defaultToken2="claw123" />);

    const [fromInput] = screen.getAllByRole("spinbutton");

    userEvent.type(fromInput, "2");

    act(() => {
      successCallback({ amount: 84000000 });
    });

    userEvent.click(screen.getByRole("button", { name: "Swap Tokens" }));
    userEvent.click(screen.getByRole("button", { name: "Confirm Swap" }));

    await waitForElementToBeRemoved(() =>
      screen.queryAllByText("Confirm Swap")
    );
  };

  it("submits transaction", async () => {
    const mockSubmit = jest.fn();

    (useTx as jest.Mock).mockImplementation(({ onPosting }) => ({
      submit: (...args: any) => {
        onPosting();
        mockSubmit(...args);
      },
    }));

    await renderAndSwap();

    expect(useTx).toHaveBeenCalledWith({
      notification: {
        type: "swap",
        data: {
          token1: "uclaw",
          token2: "claw123",
        },
      },
      onPosting: expect.any(Function),
      onBroadcasting: expect.any(Function),
      onError: expect.any(Function),
    });

    expect(mockSubmit).toHaveBeenCalledTimes(1);
  });
});
