/** Appended when a single assistant reply exceeds the char cap. */
export const OUTPUT_TRUNCATION_SUFFIX =
  "\n\n… (response truncated — ask for a shorter summary or a specific section)";

/** Shown when the per-turn assistant output budget is exhausted. */
export const OUTPUT_TURN_LIMIT_MESSAGE =
  "I've reached the output limit for this turn. Ask for a specific section or a shorter summary to continue.";

export type TruncateAssistantOutputResult = {
  text: string;
  truncated: boolean;
};

export function truncateAssistantOutput(
  text: string,
  maxChars: number,
  options?: { suffix?: string; assumeOverLimit?: boolean },
): TruncateAssistantOutputResult {
  const suffix = options?.suffix ?? OUTPUT_TRUNCATION_SUFFIX;
  if (maxChars <= 0) {
    return { text: suffix.trim(), truncated: text.length > 0 };
  }
  if (text.length <= maxChars && !options?.assumeOverLimit) {
    return { text, truncated: false };
  }
  if (suffix.length >= maxChars) {
    return { text: suffix.slice(0, maxChars), truncated: true };
  }
  const sliceLen = maxChars - suffix.length;
  return { text: text.slice(0, sliceLen) + suffix, truncated: true };
}

/** Tracks cumulative assistant text chars across tool-loop steps in one turn. */
export class OutputLimitTracker {
  private usedChars = 0;

  constructor(private readonly maxTurnChars: number) {}

  get used(): number {
    return this.usedChars;
  }

  get remaining(): number {
    return Math.max(0, this.maxTurnChars - this.usedChars);
  }

  get isExhausted(): boolean {
    return this.usedChars >= this.maxTurnChars;
  }

  budgetForStep(maxReplyChars: number): number {
    return Math.min(maxReplyChars, this.remaining);
  }

  recordAssistantOutput(text: string): void {
    this.usedChars += text.length;
  }
}

export function buildOversizedToolArgsError(maxChars: number): {
  error: { code: string; message: string };
} {
  return {
    error: {
      code: "VALIDATION_ERROR",
      message: `Tool arguments exceed the ${maxChars} character limit.`,
    },
  };
}
