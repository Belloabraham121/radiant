import { ApiError } from "@/lib/api";

export function isAccountMergeOrTransferError(err: unknown): boolean {
  if (err instanceof ApiError) {
    return err.code === "ACCOUNT_MERGE_REQUIRED";
  }

  const raw = err instanceof Error ? err.message : String(err);
  return (
    raw.includes("account_transfer_required") ||
    raw.includes("linked_to_another_user") ||
    raw.includes("ACCOUNT_MERGE_REQUIRED") ||
    raw.includes("ACCOUNT_TRANSFER")
  );
}

export function accountMergeErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.code === "ACCOUNT_MERGE_REQUIRED") {
    return err.message;
  }

  if (isAccountMergeOrTransferError(err)) {
    return "This email is already linked to another Radiant account. Sign in with your original method, then link the new one under Settings → Connected accounts. Or complete Privy's account transfer when prompted.";
  }

  if (err instanceof ApiError) {
    return err.message;
  }

  if (err instanceof Error && err.message) {
    return err.message;
  }

  return "Something went wrong. Please try again.";
}
