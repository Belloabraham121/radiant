import type { CrossChainRoutesResult } from "../cross-chain/cross-chain.types.js";
import { getSquidRoute } from "./squid-quote.service.js";
import type { SquidRoutesInput } from "./squid.types.js";

/** Squid returns a single best route — wrap as a routes list for cross-chain orchestration. */
export async function getSquidRoutes(
  privyUserId: string,
  input: SquidRoutesInput,
): Promise<CrossChainRoutesResult> {
  const route = await getSquidRoute(privyUserId, input);
  return {
    routes: [route],
    unavailable_routes: null,
  };
}
