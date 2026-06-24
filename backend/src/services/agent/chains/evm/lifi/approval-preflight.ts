import type { ExecuteTransactionInput } from "../../../../chains/types.js";
import type { ExecutePreflightRegistration } from "../../types.js";
import { readDeFiQuoteExpiresAt } from "../../../../agent-transaction/approval-preview/quote-expiry.js";
import { preflightLifiQuoteNotExpired } from "../../../../defi/lifi/lifi-execute.service.js";
import { isLifiExecuteAction } from "./execute-actions.js";

export const lifiPreflightHooks: readonly ExecutePreflightRegistration[] = [
  {
    match: isLifiExecuteAction,
    run: async (_privyUserId, input: ExecuteTransactionInput) => {
      const expiresAt = readDeFiQuoteExpiresAt(input.params) ?? undefined;
      await preflightLifiQuoteNotExpired(expiresAt);
    },
  },
];
