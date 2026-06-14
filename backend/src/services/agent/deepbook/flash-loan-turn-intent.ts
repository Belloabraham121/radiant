export type FlashLoanTurnIntent = "research" | "execution";

const FLASH_LOAN_EXECUTION_PHRASES = [
  "execute it",
  "execute the",
  "then execute",
  "execute if",
  "run it",
  "run the bundle",
  "run the flash",
  "go ahead",
  "do it now",
  "do the round trip",
  "do the flash",
  "broadcast",
  "submit the",
  "place the flash",
  "round trip",
  "swap back, repay",
  "swap back and repay",
] as const;

const FLASH_LOAN_RESEARCH_PHRASES = [
  "give me a strategy",
  "give me strategy",
  "a strategy",
  "strategy for",
  "recommend",
  "what would",
  "how would",
  "explore",
  "show me options",
  "compare pools",
  "feasibility",
  "is it viable",
  "what pools",
  "sizing",
  "how much capital",
  "trade-off",
  "trade off",
] as const;

function normalizeMessage(message: string): string {
  return message.trim().toLowerCase();
}

export function messageMentionsFlashLoan(message: string): boolean {
  const normalized = normalizeMessage(message);
  if (normalized.includes("flash loan")) {
    return true;
  }
  if (normalized.includes("flashloan")) {
    return true;
  }
  if (normalized.includes("flash borrow")) {
    return true;
  }
  if (normalized.includes("flash-borrow")) {
    return true;
  }
  return false;
}

function containsPhrase(normalized: string, phrase: string): boolean {
  return normalized.includes(phrase);
}

/** Describes an operational swap-chain flash loan (borrow → swap(s) → repay). */
function hasSwapChainExecutionShape(normalized: string): boolean {
  if (!messageMentionsFlashLoan(normalized)) {
    return false;
  }
  return normalized.includes("swap") && normalized.includes("repay");
}

/**
 * Classify whether the user wants flash-loan research or on-chain execution.
 * Returns null when the message is not about flash loans.
 */
export function classifyFlashLoanTurnIntent(message: string): FlashLoanTurnIntent | null {
  if (!messageMentionsFlashLoan(message)) {
    return null;
  }

  const normalized = normalizeMessage(message);

  for (const phrase of FLASH_LOAN_EXECUTION_PHRASES) {
    if (containsPhrase(normalized, phrase)) {
      return "execution";
    }
  }

  if (hasSwapChainExecutionShape(normalized)) {
    return "execution";
  }

  for (const phrase of FLASH_LOAN_RESEARCH_PHRASES) {
    if (containsPhrase(normalized, phrase)) {
      return "research";
    }
  }

  if (containsPhrase(normalized, "strategy")) {
    return "research";
  }

  // Conservative default — sizing and feasibility questions should not auto-execute.
  return "research";
}
