import { AppError } from "../../errors/app-error.js";
import type { ExecuteTransactionInput } from "../chains/types.js";
import type { CallApiToolInput } from "./browsing/call-api.tool.js";
import { stellarAddressSchema } from "../wallet/wallet.types.js";

const TRANSFER_ACTIONS = new Set([
  "transfer_native",
  "transfer_sui",
  "transfer",
  "transfer_eth",
  "transfer_sol",
]);

const SUI_ADDRESS_RE = /^0x[a-fA-F0-9]{64}$/;
const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

const BLOCKED_CALL_API_HEADER_KEYS = new Set([
  "cookie",
  "host",
  "authorization",
  "x-api-key",
  "proxy-authorization",
]);

const BASE64_RE = /^[A-Za-z0-9+/]+=*$/;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readStringParam(params: Record<string, unknown>, key: string): string | null {
  const value = params[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function validateExecuteTransactionToolPolicy(input: ExecuteTransactionInput): void {
  const params = asRecord(input.params);

  if (input.action === "execute_bytes") {
    const bytes = readStringParam(params, "transaction_bytes");
    if (!bytes || bytes.length > 200_000 || !BASE64_RE.test(bytes)) {
      throw new AppError(
        400,
        "POLICY_VIOLATION",
        "execute_bytes requires valid base64 transaction_bytes.",
      );
    }
    return;
  }

  if (!TRANSFER_ACTIONS.has(input.action)) {
    return;
  }

  const recipient = readStringParam(params, "recipient") ?? readStringParam(params, "to");
  if (!recipient) {
    throw new AppError(400, "POLICY_VIOLATION", "Transfer actions require a recipient address.");
  }

  if (input.chain_id === "sui" && !SUI_ADDRESS_RE.test(recipient)) {
    throw new AppError(400, "POLICY_VIOLATION", "Invalid Sui recipient address.");
  }

  if (input.chain_id === "stellar" && !stellarAddressSchema.safeParse(recipient).success) {
    throw new AppError(400, "POLICY_VIOLATION", "Invalid Stellar recipient address.");
  }

  if (
    (input.chain_id === "ethereum" || input.chain_id === "solana") &&
    !EVM_ADDRESS_RE.test(recipient)
  ) {
    throw new AppError(400, "POLICY_VIOLATION", "Invalid EVM recipient address.");
  }
}

export function validateCallApiToolPolicy(input: CallApiToolInput): void {
  const headers = input.headers ?? {};
  const entries = Object.entries(headers);

  if (entries.length > 20) {
    throw new AppError(400, "POLICY_VIOLATION", "Too many request headers.");
  }

  for (const [key, value] of entries) {
    const lower = key.toLowerCase();
    if (BLOCKED_CALL_API_HEADER_KEYS.has(lower)) {
      throw new AppError(
        400,
        "POLICY_VIOLATION",
        `Header ${key} cannot be set via call_api.`,
      );
    }
    if (typeof value !== "string" || value.length > 8_192) {
      throw new AppError(400, "POLICY_VIOLATION", `Invalid header value for ${key}.`);
    }
  }
}
