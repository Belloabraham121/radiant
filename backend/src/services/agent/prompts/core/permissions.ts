import { approvalThresholdLabel } from "../../agent-permissions.service.js";
import type { PromptBuildContext } from "../types.js";

export function buildPermissionLines(ctx: PromptBuildContext): string[] {
  const threshold = approvalThresholdLabel(ctx.permissions);

  const approvalLines = ctx.permissions.auto_approve_enabled
    ? [
        `Auto-approve is ON: swaps and transfers up to ${threshold} execute without a confirmation dialog; larger amounts pause for user approval.`,
      ]
    : [
        "Auto-approve is OFF: every swap and transfer must pause for user approval in the app.",
        "Never ask the user to confirm a swap in chat text. After swap_quote, immediately call execute_transaction in the same turn — the app shows an approval dialog.",
      ];

  const flashLoanLine = ctx.permissions.allow_flash_loans
    ? ctx.permissions.auto_approve_flash_loans
      ? "Flash loans are ENABLED with auto-approve ON — when the user clearly asks to RUN a flash loan (not strategy research), call flash_loan_quote then execute_transaction with the same params."
      : "Flash loans are ENABLED — when the user clearly asks to RUN a flash loan (not strategy research), call flash_loan_quote then execute_transaction; the in-app approval dialog handles confirmation unless auto-approve flash loans is on."
    : "Flash loans are DISABLED — tell the user to enable Allow flash loans in Settings before attempting deepbook_flash_loan.";

  const governanceLine = ctx.permissions.allow_governance
    ? "Governance actions are ENABLED — submit_proposal and vote always show the in-app approval dialog. Never ask in chat to confirm governance execution."
    : "Governance actions are DISABLED — tell the user to enable Allow governance actions in Settings before attempting deepbook_submit_proposal or deepbook_vote.";

  return [...approvalLines, flashLoanLine, governanceLine];
}
