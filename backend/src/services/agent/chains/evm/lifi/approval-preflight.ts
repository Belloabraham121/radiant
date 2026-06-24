import type { ExecuteTransactionInput } from "../../../../chains/types.js";
import type { ExecutePreflightRegistration } from "../../types.js";
import { preflightLifiQuoteNotExpired } from "../../../../defi/lifi/lifi-execute.service.js";
import { isLifiExecuteAction } from "./execute-actions.js";

export const lifiPreflightHooks: readonly ExecutePreflightRegistration[] = [
  {
    match: isLifiExecuteAction,
    run: async (_privyUserId, input: ExecuteTransactionInput) => {
      const expiresAt =
        typeof input.params.expires_at === "string" ? input.params.expires_at : undefined;
      await preflightLifiQuoteNotExpired(expiresAt);
    },
  },
];
