/** Chain-agnostic transfer / raw-tx actions exposed on every enabled chain adapter. */
export const CORE_TRANSFER_ACTIONS = [
  "transfer_native",
  "transfer_sui",
  "transfer",
  "transfer_eth",
  "transfer_sol",
  "execute_bytes",
] as const;

export const CORE_EXECUTE_SCHEMA: {
  actionDescription: string;
  paramsDescription: string;
} = {
  actionDescription:
    "transfer_native (all chains), transfer_sui / execute_bytes (Sui), " +
    "transfer_eth (EVM), transfer_sol (Solana).",
  paramsDescription:
    "transfer_native: { recipient, amount_atomic }. " +
    "execute_bytes: { transaction_bytes } (base64).",
};
