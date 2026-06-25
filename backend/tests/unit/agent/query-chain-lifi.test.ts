import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { queryChainInputSchema } from "../../../src/services/agent/agent.types.js";

describe("queryChainInputSchema — Li-Fi queries", () => {
  it("accepts cross_chain_quote without enum rejection", () => {
    const parsed = queryChainInputSchema.parse({
      chain_id: "sui",
      query: "cross_chain_quote",
      params: {
        from_chain_id: "sui",
        to_chain_id: "ethereum",
        to_evm_chain_id: 8453,
        from_token: "SUI",
        to_token: "SUI",
        amount_atomic: "2150000000",
      },
    });

    assert.equal(parsed.query, "cross_chain_quote");
    assert.equal(parsed.chain_id, "sui");
    assert.equal(parsed.params.to_evm_chain_id, 8453);
  });

  it("accepts cross_chain_routes and cross_chain_status", () => {
    assert.equal(
      queryChainInputSchema.parse({
        chain_id: "sui",
        query: "cross_chain_routes",
        params: {},
      }).query,
      "cross_chain_routes",
    );
    assert.equal(
      queryChainInputSchema.parse({
        chain_id: "ethereum",
        query: "cross_chain_status",
        params: { tx_hash: "0xabc" },
      }).query,
      "cross_chain_status",
    );
  });
});
