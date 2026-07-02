import { z } from "zod";
import {
  canvasPolicySchema,
  parseCanvasPolicy,
  safeParseCanvasPolicy,
} from "./canvas-policy.schema.js";
import type { CanvasPolicy } from "./canvas-policy.types.js";

export type CanvasPolicyValidationError = {
  path: string;
  message: string;
};

export type CanvasPolicyValidationResult =
  | { ok: true; policy: CanvasPolicy }
  | { ok: false; errors: CanvasPolicyValidationError[] };

export function validateCanvasPolicy(input: unknown): CanvasPolicyValidationResult {
  const parsed = safeParseCanvasPolicy(input);
  if (parsed.success) {
    return { ok: true, policy: parsed.data };
  }

  return {
    ok: false,
    errors: parsed.error.issues.map((issue) => ({
      path: issue.path.join(".") || "policy",
      message: issue.message,
    })),
  };
}

export { canvasPolicySchema, parseCanvasPolicy, safeParseCanvasPolicy };

export type { CanvasPolicy };
