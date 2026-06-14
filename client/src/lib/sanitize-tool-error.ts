type ZodIssueLike = {
  path?: (string | number)[];
  message?: string;
  code?: string;
  type?: string;
};

function pathLabel(path: (string | number)[]): string {
  return path.length === 0 ? "input" : path.join(".");
}

function issueToMessage(issue: ZodIssueLike): string {
  const field = pathLabel(issue.path ?? []);
  if (issue.code === "too_small" && issue.type === "number") {
    return `${field} must be a positive number`;
  }
  return issue.message ? `${field}: ${issue.message}` : `${field} is invalid`;
}

/** Format Zod JSON error blobs for execution timeline and receipts. */
export function sanitizeToolErrorMessage(message: string | undefined): string {
  if (!message) {
    return "Request failed";
  }

  const trimmed = message.trim();
  if (!trimmed.startsWith("[")) {
    return trimmed;
  }

  try {
    const parsed = JSON.parse(trimmed) as ZodIssueLike[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return trimmed;
    }
    return parsed.map(issueToMessage).join("; ");
  } catch {
    return trimmed;
  }
}
