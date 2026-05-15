import { describe, it, expect } from "vitest";
import { chainConfig } from "../config";

describe("chainConfig", () => {
  it("exports a chainConfig object", () => {
    expect(chainConfig).toBeDefined();
    expect(typeof chainConfig).toBe("object");
  });

  it("has a valid chainId string", () => {
    expect(typeof chainConfig.chainId).toBe("string");
    expect(chainConfig.chainId.length).toBeGreaterThan(0);
  });

  it("has a valid chainName string", () => {
    expect(typeof chainConfig.chainName).toBe("string");
    expect(chainConfig.chainName.length).toBeGreaterThan(0);
  });

  it("has rpcEndpoint", () => {
    expect(typeof chainConfig.rpcEndpoint).toBe("string");
    expect(chainConfig.rpcEndpoint.length).toBeGreaterThan(0);
  });

  it("has restEndpoint", () => {
    expect(typeof chainConfig.restEndpoint).toBe("string");
    expect(chainConfig.restEndpoint.length).toBeGreaterThan(0);
  });

  it("has coinMinimalDenom set to uclaw", () => {
    expect(chainConfig.coinMinimalDenom).toBe("uclaw");
  });

  it("has coinDenom set to CLAW", () => {
    expect(chainConfig.coinDenom).toBe("CLAW");
  });

  it("has coinDecimals as a number", () => {
    expect(typeof chainConfig.coinDecimals).toBe("number");
    expect(chainConfig.coinDecimals).toBe(6);
  });

  it("has bech32Prefix set to claw", () => {
    expect(chainConfig.bech32Prefix).toBe("claw");
  });

  it("has gasPrice string containing uclaw", () => {
    expect(chainConfig.gasPrice).toContain("uclaw");
  });

  it("has faucetEndpoint", () => {
    expect(typeof chainConfig.faucetEndpoint).toBe("string");
    expect(chainConfig.faucetEndpoint.length).toBeGreaterThan(0);
  });

  it("has walletUrl", () => {
    expect(typeof chainConfig.walletUrl).toBe("string");
    expect(chainConfig.walletUrl.length).toBeGreaterThan(0);
  });
});
