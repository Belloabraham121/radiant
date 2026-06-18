import { registerNotificationEvaluator } from "./registry.js";
import { deepbookFlashLoanScannerEvaluator } from "./deepbook-flash-loan-scanner.evaluator.js";

let initialized = false;

/** Register built-in notification evaluators (idempotent). */
export function ensureNotificationEvaluatorsRegistered(): void {
  if (initialized) {
    return;
  }

  registerNotificationEvaluator(deepbookFlashLoanScannerEvaluator);
  initialized = true;
}

export function resetNotificationEvaluatorsBootstrapForTests(): void {
  initialized = false;
}
