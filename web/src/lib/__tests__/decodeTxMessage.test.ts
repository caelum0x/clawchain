import { describe, it, expect, vi } from "vitest";
import { decodeTxMessage, txTypeCategory } from "../decodeTxMessage";

// Mock chain.ts formatClaw and shortAddr since decodeTxMessage imports them
vi.mock("../chain.ts", () => ({
  formatClaw: vi.fn((v: string) => {
    const n = BigInt(v || "0");
    const whole = n / 1_000_000n;
    const frac = n % 1_000_000n;
    if (frac === 0n) return `${whole} CLAW`;
    return `${whole}.${frac.toString().padStart(6, "0").replace(/0+$/, "")} CLAW`;
  }),
  shortAddr: vi.fn((addr: string) =>
    addr.length <= 16 ? addr : `${addr.slice(0, 10)}...${addr.slice(-6)}`,
  ),
}));

describe("decodeTxMessage", () => {
  it("decodes MsgSend correctly", () => {
    const result = decodeTxMessage({
      typeUrl: "/cosmos.bank.v1beta1.MsgSend",
      value: {
        from_address: "claw1sender0000000000000000000000000000000",
        to_address: "claw1recipient0000000000000000000000000000",
        amount: [{ denom: "uclaw", amount: "5000000" }],
      },
    });

    expect(result.label).toBe("MsgSend");
    expect(result.fields).toHaveLength(3);

    const fromField = result.fields.find((f) => f.key === "From");
    expect(fromField).toBeTruthy();

    const toField = result.fields.find((f) => f.key === "To");
    expect(toField).toBeTruthy();

    const amountField = result.fields.find((f) => f.key === "Amount");
    expect(amountField).toBeTruthy();
    expect(amountField!.value).toContain("CLAW");
  });

  it("decodes MsgDelegate correctly", () => {
    const result = decodeTxMessage({
      typeUrl: "/cosmos.staking.v1beta1.MsgDelegate",
      value: {
        delegator_address: "claw1delegator00000000000000000000000000",
        validator_address: "clawvaloper1validator0000000000000000000000",
        amount: { denom: "uclaw", amount: "10000000" },
      },
    });

    expect(result.label).toBe("MsgDelegate");
    expect(result.fields).toHaveLength(3);

    const delegatorField = result.fields.find((f) => f.key === "Delegator");
    expect(delegatorField).toBeTruthy();

    const validatorField = result.fields.find((f) => f.key === "Validator");
    expect(validatorField).toBeTruthy();

    const amountField = result.fields.find((f) => f.key === "Amount");
    expect(amountField).toBeTruthy();
    expect(amountField!.value).toContain("CLAW");
  });

  it("handles unknown message types with fallback", () => {
    const result = decodeTxMessage({
      typeUrl: "/some.unknown.v1.MsgFooBar",
      value: {
        creator: "claw1abc",
        data: "some data",
      },
    });

    expect(result.label).toBe("MsgFooBar");
    expect(result.fields.length).toBeGreaterThan(0);
  });

  it("handles unknown message type with no value", () => {
    const result = decodeTxMessage({
      typeUrl: "/some.unknown.v1.MsgEmpty",
    });

    expect(result.label).toBe("MsgEmpty");
    expect(result.fields).toHaveLength(1);
    expect(result.fields[0].key).toBe("typeUrl");
  });

  it("decodes MsgVote correctly", () => {
    const result = decodeTxMessage({
      typeUrl: "/cosmos.gov.v1beta1.MsgVote",
      value: {
        voter: "claw1voter00000000000000000000000000000000",
        proposal_id: "42",
        option: "VOTE_OPTION_YES",
      },
    });

    expect(result.label).toBe("MsgVote");
    expect(result.fields.find((f) => f.key === "Option")!.value).toBe("YES");
    expect(result.fields.find((f) => f.key === "Proposal")!.value).toBe("#42");
  });

  it("decodes MsgShield correctly", () => {
    const result = decodeTxMessage({
      typeUrl: "/clawchain.privacy.v1.MsgShield",
      value: {
        sender: "claw1sender0000000000000000000000000000000",
        amount: "1000000",
      },
    });

    expect(result.label).toBe("MsgShield");
    expect(result.fields.find((f) => f.key === "Amount")!.value).toContain(
      "CLAW",
    );
  });

  it("decodes MsgRegisterAgent correctly", () => {
    const result = decodeTxMessage({
      typeUrl: "/clawchain.agent.v1.MsgRegisterAgent",
      value: {
        creator: "claw1creator0000000000000000000000000000",
        name: "my-agent",
      },
    });

    expect(result.label).toBe("MsgRegisterAgent");
    expect(result.fields.find((f) => f.key === "Name")!.value).toBe(
      "my-agent",
    );
  });
});

describe("txTypeCategory", () => {
  it("categorizes MsgSend as Transfers", () => {
    expect(txTypeCategory("/cosmos.bank.v1beta1.MsgSend")).toBe("Transfers");
  });

  it("categorizes MsgDelegate as Staking", () => {
    expect(txTypeCategory("/cosmos.staking.v1beta1.MsgDelegate")).toBe(
      "Staking",
    );
  });

  it("categorizes MsgUndelegate as Staking", () => {
    expect(txTypeCategory("/cosmos.staking.v1beta1.MsgUndelegate")).toBe(
      "Staking",
    );
  });

  it("categorizes MsgVote as Governance", () => {
    expect(txTypeCategory("/cosmos.gov.v1beta1.MsgVote")).toBe("Governance");
  });

  it("categorizes MsgSubmitProposal as Governance", () => {
    expect(txTypeCategory("/cosmos.gov.v1beta1.MsgSubmitProposal")).toBe(
      "Governance",
    );
  });

  it("categorizes MsgRegisterAgent as Agent", () => {
    expect(txTypeCategory("/clawchain.agent.v1.MsgRegisterAgent")).toBe(
      "Agent",
    );
  });

  it("categorizes MsgDelegateTask as Agent", () => {
    expect(txTypeCategory("/clawchain.agent.v1.MsgDelegateTask")).toBe(
      "Agent",
    );
  });

  it("categorizes MsgShield as Privacy", () => {
    expect(txTypeCategory("/clawchain.privacy.v1.MsgShield")).toBe("Privacy");
  });

  it("categorizes MsgUnshield as Privacy", () => {
    expect(txTypeCategory("/clawchain.privacy.v1.MsgUnshield")).toBe(
      "Privacy",
    );
  });

  it("categorizes MsgSubmitComputeJob as GPU", () => {
    expect(
      txTypeCategory("/clawchain.marketplace.v1.MsgSubmitComputeJob"),
    ).toBe("GPU");
  });

  it("categorizes MsgRegisterModel as GPU", () => {
    expect(
      txTypeCategory("/clawchain.modelregistry.v1.MsgRegisterModel"),
    ).toBe("GPU");
  });

  it("returns Other for unknown types", () => {
    expect(txTypeCategory("/some.unknown.v1.MsgFoo")).toBe("Other");
  });
});
