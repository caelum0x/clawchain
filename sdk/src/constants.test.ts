import test, { describe } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_DENOM,
  DEFAULT_RPC_URL,
  DEFAULT_GRPC_URL,
  DEFAULT_REST_URL,
  DEFAULT_PREFIX,
  DEFAULT_GAS_PRICE,
  DEFAULT_GAS_ADJUSTMENT,
  DEFAULT_PROOF_BINARY,
  DEFAULT_PROOF_TIMEOUT_MS,
  MSG_SHIELD_TYPE_URL,
  MSG_PRIVATE_TRANSFER_TYPE_URL,
  MSG_UNSHIELD_TYPE_URL,
  MSG_REGISTER_AGENT_TYPE_URL,
  MSG_AGENT_ACTION_TYPE_URL,
  MSG_AGENT_HEARTBEAT_TYPE_URL,
  MSG_SUBMIT_INTENT_TYPE_URL,
  MSG_RESPOND_TO_INTENT_TYPE_URL,
  MSG_FINALIZE_INTENT_TYPE_URL,
  MSG_DELEGATE_TASK_TYPE_URL,
  MSG_ACCEPT_TASK_TYPE_URL,
  MSG_COMPLETE_TASK_TYPE_URL,
  MSG_DEREGISTER_AGENT_TYPE_URL,
  MSG_REGISTER_VIEW_KEY_TYPE_URL,
  MSG_BATCH_PRIVATE_TRANSFER_TYPE_URL,
  MSG_SEND_MESSAGE_TYPE_URL,
  MSG_ACK_MESSAGE_TYPE_URL,
  MSG_SUBMIT_PROPOSAL_TYPE_URL,
  MSG_VOTE_TYPE_URL,
  MSG_DEPOSIT_TYPE_URL,
  MSG_LIST_SKILL_TYPE_URL,
  MSG_DELIST_SKILL_TYPE_URL,
  MSG_PURCHASE_SKILL_TYPE_URL,
  MSG_RATE_AGENT_TYPE_URL,
  MSG_ENDORSE_AGENT_TYPE_URL,
  MSG_CREATE_ESCROW_TYPE_URL,
  MSG_COMPLETE_ESCROW_TYPE_URL,
  MSG_COMPLETE_MILESTONE_TYPE_URL,
  MSG_DISPUTE_ESCROW_TYPE_URL,
  MSG_UPDATE_SKILL_TYPE_URL,
  REST_MERKLE_ROOT,
  REST_NULLIFIER_EXISTS,
  REST_AGENT,
  REST_AGENT_PARAMS,
  REST_INTENT,
  REST_VIEW_KEY,
  REST_VERIFY_AMOUNT_PROOF,
  REST_MERKLE_PROOF,
  REST_COMMITMENT_INDEX,
  REST_TREE_STATS,
  REST_ROOT_HISTORY,
  REST_MESSAGES,
  REST_CONVERSATION,
  REST_GOV_PROPOSALS,
  REST_MARKETPLACE_SKILLS,
  REST_MARKETPLACE_SKILL,
  REST_REPUTATION,
  REST_RATINGS,
  REST_ENDORSEMENTS,
  REST_TOP_AGENTS,
  REST_ESCROW,
  REST_ESCROWS,
  REST_DISPUTE,
  REST_SKILLS_BY_CATEGORY,
  REST_SKILLS_BY_OWNER,
  REST_SKILL_SEARCH,
  REST_SKILL_ANALYTICS,
  REST_AGENT_ACTIVITY,
  REST_AGENT_STATS,
  REST_RECENT_ACTIVITY,
  REST_AGENT_LIVENESS,
  REST_LIVE_AGENTS,
  REST_TASK,
  REST_TASKS_BY_DELEGATOR,
  REST_TASKS_BY_ASSIGNEE,
  IBC_PRIVACY_MEMO_KEY,
  VOTE_OPTION_MAP,
  SUPPORTED_ACTION_TYPES,
} from "./constants.js";

describe("SDK defaults", () => {
  test("DEFAULT_DENOM is uclaw", () => {
    assert.equal(DEFAULT_DENOM, "uclaw");
  });

  test("DEFAULT_RPC_URL is a valid URL", () => {
    assert.ok(DEFAULT_RPC_URL.startsWith("http"));
    new URL(DEFAULT_RPC_URL); // should not throw
  });

  test("DEFAULT_REST_URL is a valid URL", () => {
    assert.ok(DEFAULT_REST_URL.startsWith("http"));
    new URL(DEFAULT_REST_URL);
  });

  test("DEFAULT_GRPC_URL is non-empty", () => {
    assert.ok(DEFAULT_GRPC_URL.length > 0);
  });

  test("DEFAULT_PREFIX is claw", () => {
    assert.equal(DEFAULT_PREFIX, "claw");
  });

  test("DEFAULT_GAS_PRICE includes uclaw", () => {
    assert.ok(DEFAULT_GAS_PRICE.includes("uclaw"));
  });

  test("DEFAULT_GAS_ADJUSTMENT is a positive number", () => {
    assert.ok(DEFAULT_GAS_ADJUSTMENT > 0);
  });

  test("DEFAULT_PROOF_BINARY is clawproof", () => {
    assert.equal(DEFAULT_PROOF_BINARY, "clawproof");
  });

  test("DEFAULT_PROOF_TIMEOUT_MS is a positive number", () => {
    assert.ok(DEFAULT_PROOF_TIMEOUT_MS > 0);
  });
});

describe("MSG_* type URL constants", () => {
  const msgTypeUrls: Record<string, string> = {
    MSG_SHIELD_TYPE_URL,
    MSG_PRIVATE_TRANSFER_TYPE_URL,
    MSG_UNSHIELD_TYPE_URL,
    MSG_REGISTER_AGENT_TYPE_URL,
    MSG_AGENT_ACTION_TYPE_URL,
    MSG_AGENT_HEARTBEAT_TYPE_URL,
    MSG_SUBMIT_INTENT_TYPE_URL,
    MSG_RESPOND_TO_INTENT_TYPE_URL,
    MSG_FINALIZE_INTENT_TYPE_URL,
    MSG_DELEGATE_TASK_TYPE_URL,
    MSG_ACCEPT_TASK_TYPE_URL,
    MSG_COMPLETE_TASK_TYPE_URL,
    MSG_DEREGISTER_AGENT_TYPE_URL,
    MSG_REGISTER_VIEW_KEY_TYPE_URL,
    MSG_BATCH_PRIVATE_TRANSFER_TYPE_URL,
    MSG_SEND_MESSAGE_TYPE_URL,
    MSG_ACK_MESSAGE_TYPE_URL,
    MSG_LIST_SKILL_TYPE_URL,
    MSG_DELIST_SKILL_TYPE_URL,
    MSG_PURCHASE_SKILL_TYPE_URL,
    MSG_RATE_AGENT_TYPE_URL,
    MSG_ENDORSE_AGENT_TYPE_URL,
    MSG_CREATE_ESCROW_TYPE_URL,
    MSG_COMPLETE_ESCROW_TYPE_URL,
    MSG_COMPLETE_MILESTONE_TYPE_URL,
    MSG_DISPUTE_ESCROW_TYPE_URL,
    MSG_UPDATE_SKILL_TYPE_URL,
  };

  for (const [name, url] of Object.entries(msgTypeUrls)) {
    test(`${name} matches /clawchain.*.v1.Msg* or /cosmos.*.v1.Msg* pattern`, () => {
      assert.ok(typeof url === "string", `${name} should be a string`);
      assert.ok(url.length > 0, `${name} should be non-empty`);
      assert.match(url, /^\/(clawchain|cosmos)\.\w+\.v1\.Msg\w+$/);
    });
  }

  test("governance MSG type URLs use cosmos prefix", () => {
    assert.ok(MSG_SUBMIT_PROPOSAL_TYPE_URL.startsWith("/cosmos."));
    assert.ok(MSG_VOTE_TYPE_URL.startsWith("/cosmos."));
    assert.ok(MSG_DEPOSIT_TYPE_URL.startsWith("/cosmos."));
  });

  test("custom module MSG type URLs use clawchain prefix", () => {
    assert.ok(MSG_SHIELD_TYPE_URL.startsWith("/clawchain."));
    assert.ok(MSG_REGISTER_AGENT_TYPE_URL.startsWith("/clawchain."));
    assert.ok(MSG_SEND_MESSAGE_TYPE_URL.startsWith("/clawchain."));
    assert.ok(MSG_LIST_SKILL_TYPE_URL.startsWith("/clawchain."));
    assert.ok(MSG_RATE_AGENT_TYPE_URL.startsWith("/clawchain."));
  });
});

describe("REST_* path constants", () => {
  const restPaths: Record<string, string> = {
    REST_MERKLE_ROOT,
    REST_NULLIFIER_EXISTS,
    REST_AGENT,
    REST_AGENT_PARAMS,
    REST_INTENT,
    REST_VIEW_KEY,
    REST_VERIFY_AMOUNT_PROOF,
    REST_MERKLE_PROOF,
    REST_COMMITMENT_INDEX,
    REST_TREE_STATS,
    REST_ROOT_HISTORY,
    REST_MESSAGES,
    REST_CONVERSATION,
    REST_GOV_PROPOSALS,
    REST_MARKETPLACE_SKILLS,
    REST_MARKETPLACE_SKILL,
    REST_REPUTATION,
    REST_RATINGS,
    REST_ENDORSEMENTS,
    REST_TOP_AGENTS,
    REST_ESCROW,
    REST_ESCROWS,
    REST_DISPUTE,
    REST_SKILLS_BY_CATEGORY,
    REST_SKILLS_BY_OWNER,
    REST_SKILL_SEARCH,
    REST_SKILL_ANALYTICS,
    REST_AGENT_ACTIVITY,
    REST_AGENT_STATS,
    REST_RECENT_ACTIVITY,
    REST_AGENT_LIVENESS,
    REST_LIVE_AGENTS,
    REST_TASK,
    REST_TASKS_BY_DELEGATOR,
    REST_TASKS_BY_ASSIGNEE,
  };

  for (const [name, path] of Object.entries(restPaths)) {
    test(`${name} is a non-empty string starting with /`, () => {
      assert.ok(typeof path === "string", `${name} should be a string`);
      assert.ok(path.length > 0, `${name} should be non-empty`);
      assert.ok(path.startsWith("/"), `${name} should start with /`);
    });
  }
});

describe("VOTE_OPTION_MAP", () => {
  test("has all 4 standard vote options", () => {
    assert.ok("yes" in VOTE_OPTION_MAP);
    assert.ok("no" in VOTE_OPTION_MAP);
    assert.ok("abstain" in VOTE_OPTION_MAP);
    assert.ok("no_with_veto" in VOTE_OPTION_MAP);
  });

  test("vote option values are unique positive integers", () => {
    const values = Object.values(VOTE_OPTION_MAP);
    assert.equal(values.length, 4);
    const unique = new Set(values);
    assert.equal(unique.size, 4);
    for (const v of values) {
      assert.ok(Number.isInteger(v) && v > 0);
    }
  });

  test("yes=1, abstain=2, no=3, no_with_veto=4", () => {
    assert.equal(VOTE_OPTION_MAP["yes"], 1);
    assert.equal(VOTE_OPTION_MAP["abstain"], 2);
    assert.equal(VOTE_OPTION_MAP["no"], 3);
    assert.equal(VOTE_OPTION_MAP["no_with_veto"], 4);
  });
});

describe("IBC_PRIVACY_MEMO_KEY", () => {
  test("is clawchain_privacy", () => {
    assert.equal(IBC_PRIVACY_MEMO_KEY, "clawchain_privacy");
  });
});

describe("SUPPORTED_ACTION_TYPES", () => {
  test("has at least 3 entries", () => {
    assert.ok(SUPPORTED_ACTION_TYPES.length >= 3);
  });

  test("includes transfer and coordinate", () => {
    assert.ok(SUPPORTED_ACTION_TYPES.includes("transfer"));
    assert.ok(SUPPORTED_ACTION_TYPES.includes("coordinate"));
  });
});
