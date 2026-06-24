import type { ExecutePreflightRegistration } from "../../types.js";

// No preflight expiry check for Li-Fi bridge actions — the raw agent params carry the
// expires_at from when cross_chain_routes was called (60 s window), which can be stale
// by the time the agent submits execute_transaction. The enrichers in
// buildPendingTransactionPreview and approvePendingTransaction set a fresh expires_at
// from the stored route, and the expiry check in approvePendingTransaction runs on that
// enriched value. Checking raw params here produces false-positive "Quote expired" errors.
export const lifiPreflightHooks: readonly ExecutePreflightRegistration[] = [];
