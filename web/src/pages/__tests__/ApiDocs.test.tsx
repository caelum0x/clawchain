import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ApiDocs from "../ApiDocs";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

vi.mock("../../lib/config.ts", () => ({
  chainConfig: {
    chainId: "clawchain-test",
    chainName: "ClawChain Test",
    restEndpoint: "http://localhost:1317",
    rpcEndpoint: "http://localhost:26657",
  },
}));

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function renderApiDocs() {
  return render(
    <MemoryRouter>
      <ApiDocs />
    </MemoryRouter>,
  );
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("ApiDocs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the API Reference heading", () => {
    renderApiDocs();
    expect(screen.getByText("API Reference")).toBeInTheDocument();
  });

  it("shows total endpoint count in subtitle", () => {
    renderApiDocs();
    expect(screen.getByText(/REST endpoints across/)).toBeInTheDocument();
    expect(screen.getByText(/10 modules/)).toBeInTheDocument();
  });

  it("displays chain configuration", () => {
    renderApiDocs();
    expect(screen.getByText("http://localhost:1317")).toBeInTheDocument();
    expect(screen.getByText("http://localhost:26657")).toBeInTheDocument();
    expect(screen.getByText("clawchain-test")).toBeInTheDocument();
  });

  it("renders module sidebar with all modules", () => {
    renderApiDocs();
    expect(screen.getByText("Agent")).toBeInTheDocument();
    expect(screen.getByText("Privacy")).toBeInTheDocument();
    expect(screen.getByText("Marketplace")).toBeInTheDocument();
    expect(screen.getByText("Model Registry")).toBeInTheDocument();
    expect(screen.getByText("Reputation")).toBeInTheDocument();
    expect(screen.getByText("Messaging")).toBeInTheDocument();
    expect(screen.getByText("Governance")).toBeInTheDocument();
    expect(screen.getByText("Cosmos SDK")).toBeInTheDocument();
    expect(screen.getByText("IBC")).toBeInTheDocument();
    expect(screen.getByText("CosmWasm")).toBeInTheDocument();
  });

  it("shows Agent endpoints by default", () => {
    renderApiDocs();
    expect(screen.getByText("Agent Module")).toBeInTheDocument();
    expect(screen.getByText(/List all registered agents/)).toBeInTheDocument();
    expect(screen.getByText("/clawchain/agent/v1/agents")).toBeInTheDocument();
  });

  it("switches to Privacy module when clicked", () => {
    renderApiDocs();

    const privacyButtons = screen.getAllByText("Privacy");
    // Click the sidebar button (not the endpoint text)
    fireEvent.click(privacyButtons[0]);

    expect(screen.getByText("Privacy Module")).toBeInTheDocument();
    expect(screen.getByText(/ZK-SNARK privacy pool/)).toBeInTheDocument();
  });

  it("switches to Model Registry and shows inference endpoints", () => {
    renderApiDocs();

    fireEvent.click(screen.getByText("Model Registry"));

    expect(screen.getByText("Model Registry Module")).toBeInTheDocument();
    expect(screen.getByText(/List inference jobs/)).toBeInTheDocument();
    expect(screen.getByText(/List inference providers/)).toBeInTheDocument();
  });

  it("renders Quick Start section with SDK and CLI examples", () => {
    renderApiDocs();
    expect(screen.getByText("Quick Start")).toBeInTheDocument();
    expect(screen.getByText("SDK (TypeScript)")).toBeInTheDocument();
    expect(screen.getByText("CLI (clawd)")).toBeInTheDocument();
  });

  it("shows GET method badges on endpoints", () => {
    renderApiDocs();
    const getBadges = screen.getAllByText("GET");
    expect(getBadges.length).toBeGreaterThan(0);
  });

  it("shows Try buttons for parameterless endpoints", () => {
    renderApiDocs();
    const tryButtons = screen.getAllByText("Try");
    expect(tryButtons.length).toBeGreaterThan(0);
  });
});
