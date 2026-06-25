/** Split user text into lowercase tokens without regex. */
export function tokenizeMessage(message: string): string[] {
  const normalized = message.trim().toLowerCase();
  const tokens: string[] = [];
  let current = "";

  for (const char of normalized) {
    if (char === " " || char === "\t" || char === "\n" || char === "\r") {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    if (char === ",") {
      continue;
    }
    current += char;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

export function parsePositiveNumber(token: string): number | undefined {
  const parsed = Number.parseFloat(token);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}
