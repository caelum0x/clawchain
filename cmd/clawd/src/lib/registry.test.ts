/**
 * Real (un-mocked) encode/decode tests for the clawchain custom-module registry.
 *
 * These tests deliberately exercise the actual ts-proto codecs and a real cosmjs
 * `Registry` — NOT a mocked signing client. They are the guard against the
 * "looks-done-but-isn't" failure where every command mocked `connectWithSigner`,
 * so nothing ever proved a `/clawchain.*` message could be encoded at all.
 */

import { Registry } from "@cosmjs/proto-signing";
import { describe, expect, it } from "vitest";

import { MsgShield } from "../generated/proto/clawchain/privacy/v1/tx.js";
import { clawchainCustomTypes, createClawchainRegistry } from "./registry.js";

describe("clawchain registry", () => {
  it("registers a codec for every custom type url (round-trips MsgShield)", () => {
    const registry = createClawchainRegistry();

    const blinding = new Uint8Array(32).fill(7);
    const value = {
      creator: "claw1r5v5srda7xfth3hn2s26txvrcrntldju3ufu0h",
      amount: "1000",
      coins: "1000uclaw",
      blinding,
    };

    // Encode through the Registry exactly as signAndBroadcast would.
    const bytes = registry.encode({
      typeUrl: "/clawchain.privacy.v1.MsgShield",
      value,
    });
    expect(bytes.length).toBeGreaterThan(0);

    // Decode back and assert a faithful round-trip.
    const decoded = registry.decode({
      typeUrl: "/clawchain.privacy.v1.MsgShield",
      value: bytes,
    });
    expect(decoded.creator).toBe(value.creator);
    expect(decoded.amount).toBe(value.amount);
    expect(decoded.coins).toBe(value.coins);
    expect(Array.from(decoded.blinding as Uint8Array)).toEqual(Array.from(blinding));
  });

  it("exposes the direct ts-proto codec consistently with the registry", () => {
    const value = MsgShield.fromPartial({
      creator: "claw1example",
      amount: "42",
      coins: "42uclaw",
      blinding: new Uint8Array([1, 2, 3]),
    });
    const direct = MsgShield.encode(value).finish();

    const viaRegistry = createClawchainRegistry().encode({
      typeUrl: "/clawchain.privacy.v1.MsgShield",
      value,
    });

    expect(Array.from(viaRegistry)).toEqual(Array.from(direct));
  });

  it("the DEFAULT cosmjs registry CANNOT encode a clawchain message (regression guard)", () => {
    // This is the bug the fix addresses: without registering custom types, the
    // default registry throws on any /clawchain.* type url.
    const bareRegistry = new Registry();
    expect(() =>
      bareRegistry.encode({
        typeUrl: "/clawchain.privacy.v1.MsgShield",
        value: { creator: "claw1x", amount: "1", coins: "1uclaw", blinding: new Uint8Array() },
      }),
    ).toThrow();
  });

  it("registers all expected privacy message type urls", () => {
    const urls = clawchainCustomTypes.map(([url]) => url);
    expect(urls).toContain("/clawchain.privacy.v1.MsgShield");
    expect(urls).toContain("/clawchain.privacy.v1.MsgUnshield");
    expect(urls).toContain("/clawchain.privacy.v1.MsgPrivateTransfer");
    expect(urls).toContain("/clawchain.privacy.v1.MsgRegisterViewKey");
    expect(urls).toContain("/clawchain.privacy.v1.MsgBatchPrivateTransfer");
  });

  it("registers agent, marketplace, and oracle message type urls", () => {
    const urls = clawchainCustomTypes.map(([url]) => url);
    expect(urls).toContain("/clawchain.agent.v1.MsgRegisterAgent");
    expect(urls).toContain("/clawchain.agent.v1.MsgDelegateTask");
    expect(urls).toContain("/clawchain.marketplace.v1.MsgListSkill");
    expect(urls).toContain("/clawchain.marketplace.v1.MsgPurchaseSkill");
    // Oracle registers under the terra.* package the chain actually resolves
    // (the .pb.go is generated from terra/oracle/v1beta1/tx.proto).
    expect(urls).toContain("/terra.oracle.v1beta1.MsgAggregateExchangeRateVote");
    expect(urls).toContain("/terra.oracle.v1beta1.MsgDelegateFeedConsent");
    // Response types must NOT be registered.
    expect(urls).not.toContain("/clawchain.agent.v1.MsgRegisterAgentResponse");
  });

  it("registers modelregistry, reputation, messaging, governance, clawchain type urls", () => {
    const urls = clawchainCustomTypes.map(([url]) => url);
    expect(urls).toContain("/clawchain.modelregistry.v1.MsgRegisterModel");
    expect(urls).toContain("/clawchain.reputation.v1.MsgRateAgent");
    expect(urls).toContain("/clawchain.messaging.v1.MsgSendMessage");
    expect(urls).toContain("/clawchain.governance.v1.MsgSubmitProposal");
    expect(urls).toContain("/clawchain.governance.v1.MsgVote");
    expect(urls).toContain("/clawchain.clawchain.v1.MsgUpdateParams");
  });

  it("round-trips a cross-module message (MsgListSkill) through the registry", () => {
    const registry = createClawchainRegistry();
    const value = {
      creator: "claw1seller",
      name: "summarize",
      description: "summarize text",
      price: "100",
      denom: "uclaw",
    };
    const bytes = registry.encode({ typeUrl: "/clawchain.marketplace.v1.MsgListSkill", value });
    const decoded = registry.decode({ typeUrl: "/clawchain.marketplace.v1.MsgListSkill", value: bytes });
    expect(decoded.creator).toBe(value.creator);
    expect(decoded.name).toBe(value.name);
    expect(decoded.price).toBe(value.price);
    expect(decoded.denom).toBe(value.denom);
  });
});
