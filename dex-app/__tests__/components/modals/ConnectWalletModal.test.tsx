import { render, screen } from "@testing-library/react";
import ConnectWalletModal from "components/modals/ConnectWalletModal";
import { useKeplrWallet } from "context/KeplrWalletContext";
import userEvent from "@testing-library/user-event";

jest.mock("context/KeplrWalletContext", () => ({
  useKeplrWallet: jest.fn(),
}));

describe("ConnectWalletModal", () => {
  beforeEach(() => {
    (useKeplrWallet as jest.Mock).mockReturnValue({
      address: null,
      client: null,
      isConnected: false,
      connect: jest.fn(),
      disconnect: jest.fn(),
    });
  });

  it("renders Keplr wallet connect button", () => {
    render(<ConnectWalletModal isOpen={true} onClose={() => {}} />);

    expect(
      screen.getByRole("button", { name: /Keplr/i })
    ).toBeInTheDocument();
  });

  it("calls connect when Keplr button is clicked", async () => {
    const mockConnect = jest.fn();
    (useKeplrWallet as jest.Mock).mockReturnValue({
      address: null,
      client: null,
      isConnected: false,
      connect: mockConnect,
      disconnect: jest.fn(),
    });

    render(<ConnectWalletModal isOpen={true} onClose={() => {}} />);

    await userEvent.click(screen.getByRole("button", { name: /Keplr/i }));

    expect(mockConnect).toHaveBeenCalled();
  });
});
