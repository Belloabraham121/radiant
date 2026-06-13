import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import { mapAgentToolError } from "../../../src/utils/agent-tool-errors.js";
import {
  formatZodJsonErrorMessage,
  formatZodValidationError,
} from "../../../src/utils/format-zod-validation.js";

describe("format-zod-validation", () => {
  it("formatZodValidationError turns issues into readable text", () => {
    const schema = z.object({
      params: z.object({ amount: z.number().positive() }),
    });

    try {
      schema.parse({ params: { amount: 0 } });
      assert.fail("expected validation error");
    } catch (err) {
      assert.ok(err instanceof z.ZodError);
      assert.equal(formatZodValidationError(err), "params.amount must be a positive number");
    }
  });

  it("formatZodJsonErrorMessage parses Zod 3 JSON message blobs", () => {
    const message = `[{"code":"too_small","minimum":0,"type":"number","inclusive":false,"exact":false,"message":"Number must be greater than 0","path":["params","amount"]}]`;
    assert.equal(
      formatZodJsonErrorMessage(message),
      "params.amount must be a positive number",
    );
  });

  it("mapAgentToolError maps ZodError to VALIDATION_ERROR", () => {
    const schema = z.object({ amount: z.number().positive() });
    try {
      schema.parse({ amount: 0 });
      assert.fail("expected validation error");
    } catch (err) {
      const mapped = mapAgentToolError(err);
      assert.equal(mapped.code, "VALIDATION_ERROR");
      assert.equal(mapped.message, "amount must be a positive number");
    }
  });
});
