import { formatEnabledBridgeDestinationHint } from "../../../../../services/defi/lifi/lifi-endpoint-params.js";

export function buildLifiBridgeLines(): string[] {
  const destinationHint = formatEnabledBridgeDestinationHint();
  return [
    "When the user asks to bridge, call cross_chain_routes (up to 3 routes) then immediately call cross_chain_swap in the same turn — do not wait, do not ask the user to confirm first. Calling cross_chain_swap does NOT broadcast the transaction; it opens an approval dialog for the user to review and approve. Always proceed to cross_chain_swap after a successful quote.",
    "Before quoting, confirm you have ALL of: source chain, destination chain, source token, amount, and destination token. If any are missing, ask the user — do not guess tokens or amounts.",
    "If the user only names chains (e.g. bridge from Sui to Base) without token or amount, ask which token to send, how much, and which token to receive on the destination.",
    "If the user names source amount and chains but not which token to receive on the destination, ask before quoting — do not default to_token to the source symbol.",
    "Bridge flow: token_resolve (if token unclear) → cross_chain_routes → pick lowest (fee_cost_usd + gas_cost_usd) route → cross_chain_swap with that route's route_id → poll cross_chain_status after the user approves and broadcast completes.",
    "Route selection: from the cross_chain_routes result, pick the route with the lowest combined fee_cost_usd + gas_cost_usd. If those fields are null, prefer the first route (already ranked by Li-Fi). Never ask the user to choose a route — always pick automatically.",
    `Enabled bridge destinations on this deployment: ${destinationHint}.`,
    "Example Sui → Base for 2.15 SUI receiving USDC: chain_id sui, cross_chain_routes with from_chain_id sui, to_chain_id ethereum, to_evm_chain_id 8453, from_token SUI, to_token USDC, amount_atomic 2150000000.",
    "cross_chain_swap params: route_id (required) plus snapshot fields from the chosen route — use expires_at from the quote as-is (ISO ~60s countdown), never estimated_duration_seconds.",
    "If cross_chain_routes returns no routes and the error says the destination token is blocked or unavailable, try a different destination token (e.g. ETH instead of USDC) and inform the user. Do NOT call cross_chain_swap if there is no valid route_id.",
    "If cross_chain_routes or execute_transaction returns liquidity_fallback_offer (Li-Fi had no liquidity), stop and wait for the user to accept or decline the alternate-route dialog. Do NOT call cross_chain_swap again until the user accepts — the system will fetch a Squid route after consent.",
    "Only set confirm_same_token when the user explicitly wants the same symbol on the destination (e.g. bridge SUI and receive SUI on Base).",
    "After the user approves and broadcast completes, poll cross_chain_status until status is DONE, FAILED, or REFUNDED.",
    "Use cross_chain_connections when the user asks which chains can be bridged.",
  ];
}
