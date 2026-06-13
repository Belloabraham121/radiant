/** User-facing error text stored on AgentTransaction rows — no stacks or multiline dumps. */
export function sanitizeErrorMessageForUi(message: string): string {
  const firstLine = message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("at "));

  const cleaned = (firstLine ?? "Transaction failed")
    .replace(/^Error:\s*/i, "")
    .trim();

  return cleaned.slice(0, 500) || "Transaction failed";
}
