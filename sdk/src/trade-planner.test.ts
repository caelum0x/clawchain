import test, { describe } from "node:test";
import assert from "node:assert/strict";

import {
  planBuy,
  planSell,
  planToTargetPrice,
  type PlannerPool,
} from "./trade-planner.js";

// A balanced pool with k = 1e6 and a spot price (reserve/inventory) of exactly
// 1.0. Chosen so the constant-product math resolves to whole numbers, letting
// the assertions be exact rather than approximate.
const BALANCED: PlannerPool = { reserve: "1000", inventory: "1000" };

describe("planBuy", () => {
  test("returns exact constant-product tokens out and pushes spot up", () => {
    // dx = 1000 -> newReserve = 2000, newInventory = k/2000 = 500,
    // tokensOut = 1000 - 500 = 500, newSpot = 2000/500 = 4.
    const plan = planBuy(BALANCED, "1000");
    assert.equal(plan.tokensOut, "500");
    assert.equal(plan.newSpot, 4);
    // priceImpactBps = (4 - 1) / 1 * 1e4 = 30000 (a buy always raises the price).
    assert.equal(plan.priceImpactBps, 30000);
  });

  test("truncates a sub-unit fill down to zero tokens (never mints out of thin air)", () => {
    // reserve=3, inventory=3, k=9. dx=1 -> newInventory = 9/4 = 2.25,
    // tokensOut = 0.75 which truncates to 0 base units.
    const plan = planBuy({ reserve: "3", inventory: "3" }, "1");
    assert.equal(plan.tokensOut, "0");
    assert.ok(plan.newSpot !== null && plan.newSpot > 1); // price still moved up
  });

  test("larger input yields more tokens but worse (higher) average impact", () => {
    const small = planBuy(BALANCED, "100");
    const large = planBuy(BALANCED, "1000");
    assert.ok(Number(small.tokensOut) < Number(large.tokensOut));
    assert.ok((small.priceImpactBps ?? 0) < (large.priceImpactBps ?? 0));
  });

  test("returns all-null for an empty / unfunded pool", () => {
    assert.deepEqual(planBuy({ reserve: "0", inventory: "1000" }, "100"), {
      tokensOut: null,
      newSpot: null,
      priceImpactBps: null,
    });
    assert.deepEqual(planBuy({ reserve: "1000", inventory: "0" }, "100"), {
      tokensOut: null,
      newSpot: null,
      priceImpactBps: null,
    });
  });

  test("returns all-null for non-positive or malformed input", () => {
    for (const bad of ["0", "-5", "1.5", "abc", "", "  "]) {
      const plan = planBuy(BALANCED, bad);
      assert.equal(plan.tokensOut, null, `input=${JSON.stringify(bad)}`);
    }
  });

  test("returns all-null for a malformed pool", () => {
    assert.equal(
      planBuy({ reserve: "12.5", inventory: "1000" }, "100").tokensOut,
      null,
    );
    // Missing fields (defensive: real callers may pass partial objects).
    assert.equal(planBuy({} as PlannerPool, "100").tokensOut, null);
  });
});

describe("planSell", () => {
  test("returns exact constant-product reserve out and pushes spot down", () => {
    // dy = 1000 -> newInventory = 2000, newReserve = k/2000 = 500,
    // reserveOut = 1000 - 500 = 500, newSpot = 500/2000 = 0.25.
    const plan = planSell(BALANCED, "1000");
    assert.equal(plan.reserveOut, "500");
    assert.equal(plan.newSpot, 0.25);
    // priceImpactBps = (0.25 - 1) / 1 * 1e4 = -7500 (a sell always lowers price).
    assert.equal(plan.priceImpactBps, -7500);
  });

  test("returns all-null for an empty / unfunded pool", () => {
    assert.equal(
      planSell({ reserve: "0", inventory: "1000" }, "100").reserveOut,
      null,
    );
  });

  test("returns all-null for non-positive or malformed input", () => {
    for (const bad of ["0", "-1", "2.7", "xyz", ""]) {
      assert.equal(
        planSell(BALANCED, bad).reserveOut,
        null,
        `input=${JSON.stringify(bad)}`,
      );
    }
  });
});

describe("planToTargetPrice", () => {
  test("resolves to a BUY when the target is above the current spot", () => {
    // target 4 with spot 1: newReserve = sqrt(k*4) = 2000, dx = 1000,
    // matching planBuy(BALANCED, "1000").
    const plan = planToTargetPrice(BALANCED, 4);
    assert.equal(plan.side, "buy");
    assert.equal(plan.denomHint, "reserve");
    assert.equal(plan.amountIn, "1000");
    assert.equal(plan.estTokens, "500");
    assert.equal(plan.estReserveOut, null);
    assert.equal(plan.newSpot, 4);
  });

  test("resolves to a SELL when the target is below the current spot", () => {
    // target 0.25 with spot 1: newReserve = sqrt(k*0.25) = 500, dy = 1000,
    // matching planSell(BALANCED, "1000").
    const plan = planToTargetPrice(BALANCED, 0.25);
    assert.equal(plan.side, "sell");
    assert.equal(plan.denomHint, "model");
    assert.equal(plan.amountIn, "1000");
    assert.equal(plan.estReserveOut, "500");
    assert.equal(plan.estTokens, null);
    assert.equal(plan.newSpot, 0.25);
  });

  test("is consistent with planBuy: feeding the planned amount reaches the target", () => {
    const target = 2.25; // sqrt(k*2.25) = 1500 -> dx = 500 (whole units).
    const plan = planToTargetPrice(BALANCED, target);
    assert.equal(plan.side, "buy");
    const executed = planBuy(BALANCED, plan.amountIn as string);
    assert.equal(executed.newSpot, target);
    assert.equal(executed.tokensOut, plan.estTokens);
  });

  test("is consistent with planSell: feeding the planned amount reaches the target", () => {
    const target = 0.25;
    const plan = planToTargetPrice(BALANCED, target);
    assert.equal(plan.side, "sell");
    const executed = planSell(BALANCED, plan.amountIn as string);
    assert.equal(executed.newSpot, target);
    assert.equal(executed.reserveOut, plan.estReserveOut);
  });

  test("returns all-null when the target equals the current spot (no trade needed)", () => {
    const plan = planToTargetPrice(BALANCED, 1);
    assert.equal(plan.side, null);
    assert.equal(plan.amountIn, null);
  });

  test("returns all-null for a non-positive or non-finite target", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const plan = planToTargetPrice(BALANCED, bad);
      assert.equal(plan.side, null, `target=${bad}`);
    }
  });

  test("returns all-null for an empty / unfunded pool", () => {
    assert.equal(planToTargetPrice({ reserve: "0", inventory: "10" }, 5).side, null);
  });
});
