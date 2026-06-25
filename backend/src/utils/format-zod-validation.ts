import { ZodError, type ZodIssue } from "zod";

function pathLabel(path: (string | number)[]): string {
  if (path.length === 0) {
    return "input";
  }
  return path.join(".");
}

function issueToMessage(issue: ZodIssue): string {
  const field = pathLabel(issue.path);
  switch (issue.code) {
    case "too_small":
      if (issue.type === "number") {
        return `${field} must be a positive number`;
      }
      return `${field} is too small`;
    case "too_big":
      return `${field} is too large`;
    case "invalid_type":
      return `${field} has an invalid type (expected ${issue.expected})`;
    case "invalid_enum_value":
      return `${field} is not supported`;
    default:
      return issue.message ? `${field}: ${issue.message}` : `${field} is invalid`;
  }
}

/** Turn Zod issues into a short, user-facing validation message. */
export function formatZodValidationError(err: ZodError): string {
  const messages = err.issues.map(issueToMessage);
  return messages.length === 1 ? messages[0]! : messages.join("; ");
}

/** Parse Zod-style JSON error text (Zod 3 default message) back into a readable string. */
export function formatZodJsonErrorMessage(message: string): string {
  const trimmed = message.trim();
  if (!trimmed.startsWith("[")) {
    return message;
  }

  try {
    const parsed = JSON.parse(trimmed) as ZodIssue[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return message;
    }
    return parsed.map(issueToMessage).join("; ");
  } catch {
    return message;
  }
}
