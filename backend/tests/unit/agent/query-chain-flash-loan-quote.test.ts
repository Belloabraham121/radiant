import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { queryChainInputSchema } from "../../../src/services/agent/agent.types.js";
import { queryChainToolDefinition } from "../../../src/services/agent/query-chain.tool.js";

describe("query_chain flash_loan_quote", () => {
  it("exposes flash_loan_quote in the tool schema", () => {
    const queries = queryChainToolDefinition.input_schema.properties.query.enum;
    assert.ok(queries.includes("flash_loan_quote"));
  });

  it("parses flash_loan_quote bundle params", () => {
    const parsed = queryChainInputSchema.parse({
      chain_id: "sui",
      query: "flash_loan_quote",
      params: {
        pool_key: "SUI_USDC",
        borrow_amount: 10000,
        asset: "quote",
        strategy: "swap_chain_repay",
        steps: [{ pool_key: "DEEP_USDC", side: "buy", amount: 10000 }],
      },
    });

    assert.equal(parsed.query, "flash_loan_quote");
    assert.equal(parsed.params.borrow_amount, 10000);
  });
});
