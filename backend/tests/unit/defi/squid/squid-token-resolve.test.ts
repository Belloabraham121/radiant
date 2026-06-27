import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  catalogTokenMatchScore,
  rankCatalogTokenEntries,
} from "../../../../src/services/defi/squid/squid-token-resolve.service.js";
import type { SquidTokenEntry } from "../../../../src/services/defi/squid/squid.types.js";

describe("squid-token-resolve.service", () => {
  it("prefers exact USDC symbol over USDC.e and USDC.axl", () => {
    const entries: SquidTokenEntry[] = [
      {
        address: "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8",
        symbol: "USDC.e",
        decimals: 6,
        chainId: "42161",
      },
      {
        address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
        symbol: "USDC",
        decimals: 6,
        chainId: "42161",
      },
      {
        address: "0xeb466342c4d449bc9f53a865d5cb90586f405215",
        symbol: "USDC.axl",
        decimals: 6,
        chainId: "42161",
      },
    ];

    const ranked = rankCatalogTokenEntries(entries, "USDC");
    assert.equal(ranked[0]?.symbol, "USDC");
    assert.equal(catalogTokenMatchScore(ranked[0]!, "USDC"), 100);
  });
});
