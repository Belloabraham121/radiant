import { formatEnabledBridgeDestinationHint } from "../../../../../services/defi/lifi/lifi-endpoint-params.js";

export function buildLifiBridgeLines(): string[] {
  const destinationHint = formatEnabledBridgeDestinationHint();
  return [
    "When the user asks to bridge (not just quote), run cross_chain_quote then cross_chain_swap in the same turn — do not ask them to say 'quote first'. The app shows an approval popup automatically when auto-approve is off.",
    "Before quoting, confirm you have ALL of: source chain, destination chain, source token, amount, and destination token. If any are missing, ask the user — do not guess tokens or amounts.",
    "If the user only names chains (e.g. bridge from Sui to Base) without token or amount, ask which token to send, how much, and which token to receive on the destination.",
    "If the user names source amount and chains but not which token to receive on the destination, ask before quoting — do not default to_token to the source symbol.",
    "Bridge flow: token_resolve (if token unclear) → cross_chain_quote → cross_chain_swap with route_id + lifi_route from the quote → poll cross_chain_status after broadcast.",
    `Enabled bridge destinations on this deployment: ${destinationHint}.`,
    "Example Sui → Base for 2.15 SUI receiving USDC: chain_id sui, cross_chain_quote with from_chain_id sui, to_chain_id ethereum, to_evm_chain_id 8453, from_token SUI, to_token USDC, amount_atomic 2150000000.",
    "cross_chain_swap params: route_id, lifi_route, and quote snapshot fields from cross_chain_quote (from_token, to_token, from_amount_atomic, to_amount_atomic, from_chain_id, to_chain_id, to_evm_chain_id, bridges, expires_at) so the approval UI shows pay/receive and USD.",
    "Only set confirm_same_token when the user explicitly wants the same symbol on the destination (e.g. bridge SUI and receive SUI on Base).",
    "After broadcast, poll cross_chain_status until DONE, FAILED, or REFUNDED.",
    "Use cross_chain_connections when the user asks which chains can be bridged.",
  ];
}
