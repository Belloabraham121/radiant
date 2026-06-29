import { z } from "zod";
import type { AppActionParamField } from "../agent/onchain-actions/app-action.types.js";
import type { NotificationValidationError } from "./notification-schema.types.js";

function fieldToZod(field: AppActionParamField): z.ZodType {
  let schema: z.ZodType;
  switch (field.type) {
    case "string":
      schema = z.string();
      break;
    case "number":
      schema = z.number();
      break;
    case "boolean":
      schema = z.boolean();
      break;
    case "array":
      schema = z.array(z.unknown());
      break;
    case "object":
      schema = z.record(z.string(), z.unknown());
      break;
    default:
      schema = z.unknown();
  }

  if (!field.required) {
    return schema.optional();
  }
  return schema;
}

export function buildConditionZodSchema(fields: AppActionParamField[]): z.ZodType {
  if (fields.length === 0) {
    return z.record(z.string(), z.unknown()).optional().default({});
  }

  const shape: Record<string, z.ZodType> = {};
  for (const field of fields) {
    shape[field.name] = fieldToZod(field);
  }

  return z
    .object(shape)
    .passthrough()
    .superRefine((value, ctx) => {
      for (const field of fields) {
        if (!field.required) {
          continue;
        }
        const fieldValue = value[field.name];
        if (fieldValue === undefined || fieldValue === null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Required condition field "${field.name}" is missing`,
            path: [field.name],
          });
        }
      }
    });
}

function zodIssuesToErrors(error: z.ZodError): NotificationValidationError[] {
  return error.issues.map((issue) => ({
    code: "INVALID_CONDITION",
    message: issue.message,
    path: issue.path.length > 0 ? issue.path.join(".") : undefined,
  }));
}

export function validateNotificationCondition(
  condition: unknown,
  fields: AppActionParamField[],
): { success: true; data: Record<string, unknown> } | { success: false; errors: NotificationValidationError[] } {
  const schema = buildConditionZodSchema(fields);
  const parsed = schema.safeParse(condition ?? {});
  if (!parsed.success) {
    return { success: false, errors: zodIssuesToErrors(parsed.error) };
  }

  const data = parsed.data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return {
      success: false,
      errors: [{ code: "INVALID_CONDITION", message: "Condition must be a JSON object" }],
    };
  }

  return { success: true, data: data as Record<string, unknown> };
}
