import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import {
  canvasPolicySchema,
  createDefaultCanvasPolicy,
} from "../../../src/services/canvas/policy/canvas-policy.schema.js";
import { validateCanvasPolicy } from "../../../src/services/canvas/policy/validate-policy.js";

describe("canvas policy schema", () => {
  it("creates a default policy that validates", () => {
    const workflowId = randomUUID();
    const policy = createDefaultCanvasPolicy(workflowId);

    assert.equal(policy.workflow_id, workflowId);
    assert.equal(policy.policy_version, "1.0.0");
    assert.doesNotThrow(() => canvasPolicySchema.parse(policy));

    const validated = validateCanvasPolicy(policy);
    assert.equal(validated.ok, true);
  });

  it("rejects invalid spend caps", () => {
    const workflowId = randomUUID();
    const policy = {
      ...createDefaultCanvasPolicy(workflowId),
      max_spend_usd_24h: -1,
    };

    const result = validateCanvasPolicy(policy);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.some((e) => e.path.includes("max_spend_usd_24h")));
    }
  });

  it("rejects empty allowed_actions", () => {
    const workflowId = randomUUID();
    const policy = {
      ...createDefaultCanvasPolicy(workflowId),
      allowed_actions: [],
    };

    const result = validateCanvasPolicy(policy);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.some((e) => e.path.includes("allowed_actions")));
    }
  });
});
