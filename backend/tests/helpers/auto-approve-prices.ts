import { clearMemoryCacheForTests } from "../../src/infrastructure/redis/cache.js";
import { clearTokenBucketsForTests } from "../../src/infrastructure/rate-limit/token-bucket.js";
import {
  resetCoingeckoClientForTests,
  setCoingeckoFetchForTests,
} from "../../src/services/market/coingecko.client.js";

/** Mock native-token USD prices at $1 for predictable auto-approve threshold tests. */
export function mockUnitUsdPricesForAutoApproveTests(): void {
  setCoingeckoFetchForTests(async (input) => {
    const url = String(input);
    if (!url.includes("/coins/markets")) {
      return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(
      JSON.stringify([
        { id: "sui", symbol: "sui", name: "Sui", current_price: 1 },
        { id: "ethereum", symbol: "eth", name: "Ethereum", current_price: 1 },
        { id: "solana", symbol: "sol", name: "Solana", current_price: 1 },
        { id: "stellar", symbol: "xlm", name: "Stellar", current_price: 1 },
      ]),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });
}

export function resetAutoApprovePriceMocksForTests(): void {
  clearMemoryCacheForTests();
  clearTokenBucketsForTests();
  resetCoingeckoClientForTests();
}
