import test, { describe } from "node:test";
import assert from "node:assert/strict";

import { ProofGenerator } from "./proof.js";
import { DEFAULT_PROOF_BINARY, DEFAULT_PROOF_TIMEOUT_MS } from "./constants.js";

describe("ProofGenerator constructor", () => {
  test("uses default binary path when no options provided", () => {
    const pg = new ProofGenerator();
    // Access the private field via bracket notation for testing
    assert.equal((pg as any).binaryPath, DEFAULT_PROOF_BINARY);
  });

  test("uses default timeout when no options provided", () => {
    const pg = new ProofGenerator();
    assert.equal((pg as any).timeoutMs, DEFAULT_PROOF_TIMEOUT_MS);
  });

  test("accepts custom binary path", () => {
    const pg = new ProofGenerator({ binaryPath: "/usr/local/bin/myproof" });
    assert.equal((pg as any).binaryPath, "/usr/local/bin/myproof");
  });

  test("accepts custom timeout", () => {
    const pg = new ProofGenerator({ timeoutMs: 5000 });
    assert.equal((pg as any).timeoutMs, 5000);
  });

  test("accepts custom workDir", () => {
    const pg = new ProofGenerator({ workDir: "/tmp/proofs" });
    assert.equal((pg as any).workDir, "/tmp/proofs");
  });

  test("workDir defaults to undefined", () => {
    const pg = new ProofGenerator();
    assert.equal((pg as any).workDir, undefined);
  });
});

describe("ProofGenerator.parseJson (via reflection)", () => {
  test("parses valid JSON", () => {
    const pg = new ProofGenerator();
    const result = (pg as any).parseJson('{"commitment":"abc123"}');
    assert.deepEqual(result, { commitment: "abc123" });
  });

  test("parses JSON with leading/trailing whitespace", () => {
    const pg = new ProofGenerator();
    const result = (pg as any).parseJson('  \n{"value":42}\n  ');
    assert.deepEqual(result, { value: 42 });
  });

  test("throws on invalid JSON", () => {
    const pg = new ProofGenerator();
    assert.throws(
      () => (pg as any).parseJson("not valid json"),
      (err: Error) => {
        assert.ok(err.message.includes("failed to parse JSON"));
        return true;
      },
    );
  });

  test("throws on empty string", () => {
    const pg = new ProofGenerator();
    assert.throws(
      () => (pg as any).parseJson(""),
      (err: Error) => {
        assert.ok(err.message.includes("failed to parse JSON"));
        return true;
      },
    );
  });

  test("error message includes raw output prefix", () => {
    const pg = new ProofGenerator();
    assert.throws(
      () => (pg as any).parseJson("ERROR: binary crashed"),
      (err: Error) => {
        assert.ok(err.message.includes("ERROR: binary crashed"));
        return true;
      },
    );
  });
});

describe("ProofGenerator exec failure handling", () => {
  test("generateCommitment rejects when binary not found", async () => {
    const pg = new ProofGenerator({
      binaryPath: "/nonexistent/clawproof-fake",
    });
    await assert.rejects(
      () => pg.generateCommitment("1000", "abcd"),
      (err: Error) => {
        assert.ok(err.message.includes("failed to execute"));
        assert.ok(err.message.includes("commitment"));
        return true;
      },
    );
  });

  test("generateNullifier rejects when binary not found", async () => {
    const pg = new ProofGenerator({
      binaryPath: "/nonexistent/clawproof-fake",
    });
    await assert.rejects(
      () => pg.generateNullifier("secret123", "commit456"),
      (err: Error) => {
        assert.ok(err.message.includes("failed to execute"));
        assert.ok(err.message.includes("nullifier"));
        return true;
      },
    );
  });

  test("generateShieldData rejects when binary not found", async () => {
    const pg = new ProofGenerator({
      binaryPath: "/nonexistent/clawproof-fake",
    });
    await assert.rejects(
      () => pg.generateShieldData("500"),
      (err: Error) => {
        assert.ok(err.message.includes("failed to execute"));
        assert.ok(err.message.includes("shield"));
        return true;
      },
    );
  });

  test("generateShieldData passes blinding when provided", async () => {
    const pg = new ProofGenerator({
      binaryPath: "/nonexistent/clawproof-fake",
    });
    await assert.rejects(
      () => pg.generateShieldData("500", "blind123"),
      (err: Error) => {
        assert.ok(err.message.includes("failed to execute"));
        return true;
      },
    );
  });

  test("generateUnshieldProof rejects when binary not found", async () => {
    const pg = new ProofGenerator({
      binaryPath: "/nonexistent/clawproof-fake",
    });
    await assert.rejects(
      () =>
        pg.generateUnshieldProof({
          commitment: "c1",
          amount: "1000",
          blinding: "abc",
          secret: "def",
          merklePath: ["a", "b"],
          merklePathIndices: [0, 1],
          root: "r1",
        }),
      (err: Error) => {
        assert.ok(err.message.includes("failed to execute"));
        assert.ok(err.message.includes("unshield-proof"));
        return true;
      },
    );
  });

  test("generateTransferProof rejects when binary not found", async () => {
    const pg = new ProofGenerator({
      binaryPath: "/nonexistent/clawproof-fake",
    });
    await assert.rejects(
      () =>
        pg.generateTransferProof({
          oldCommitments: ["oc1", "oc2"],
          oldBlindings: ["ob1", "ob2"],
          oldSecrets: ["os1", "os2"],
          oldAmounts: ["500", "300"],
          newAmounts: ["400", "400"],
          newBlindings: ["nb1", "nb2"],
          merklePaths: [["a", "b"], ["c", "d"]],
          merklePathIndices: [[0, 1], [0, 1]],
          root: "rt",
        }),
      (err: Error) => {
        assert.ok(err.message.includes("failed to execute"));
        assert.ok(err.message.includes("transfer-proof"));
        return true;
      },
    );
  });

  test("setup rejects when binary not found", async () => {
    const pg = new ProofGenerator({
      binaryPath: "/nonexistent/clawproof-fake",
    });
    await assert.rejects(
      () => pg.setup(),
      (err: Error) => {
        assert.ok(err.message.includes("failed to execute"));
        return true;
      },
    );
  });
});
