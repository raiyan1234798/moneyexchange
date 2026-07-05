import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertBranchId,
  assertDocumentBranch,
  canApplyToAllBranches,
  resolveBranchTargets,
} from "./branch-isolation.ts";

describe("branch-isolation", () => {
  it("assertBranchId rejects empty ids", () => {
    assert.throws(() => assertBranchId("", "test"), /Missing branchId/);
    assert.throws(() => assertBranchId("  ", "test"), /Missing branchId/);
    assert.equal(assertBranchId("branch-a", "test"), "branch-a");
  });

  it("assertDocumentBranch blocks cross-branch bleed", () => {
    assert.throws(
      () => assertDocumentBranch({ branchId: "b2" }, "b1", "videos"),
      /branchId "b2" !== expected "b1"/,
    );
    assert.doesNotThrow(() => assertDocumentBranch({ branchId: "b1" }, "b1", "rates"));
  });

  it("canApplyToAllBranches is admin-only", () => {
    assert.equal(canApplyToAllBranches("superAdmin"), true);
    assert.equal(canApplyToAllBranches("admin"), true);
    assert.equal(canApplyToAllBranches("branchManager"), false);
    assert.equal(canApplyToAllBranches("branchUser"), false);
  });

  it("resolveBranchTargets never expands without applyToAll", () => {
    const branches = [
      { id: "a", status: "active" },
      { id: "b", status: "active" },
    ];
    const single = resolveBranchTargets(branches, "a", false);
    assert.deepEqual(single.map((b) => b.id), ["a"]);
    const all = resolveBranchTargets(branches, "a", true);
    assert.deepEqual(all.map((b) => b.id), ["a", "b"]);
  });
});
