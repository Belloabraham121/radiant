import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { queryChainInputSchema } from "../../../src/services/agent/agent.types.js";
import { queryChainToolDefinition } from "../../../src/services/agent/query-chain.tool.js";

describe("query_chain agent_transactions", () => {
  it("exposes agent_transactions in the tool schema", () => {
    const queries = queryChainToolDefinition.input_schema.properties.query.enum;
    assert.ok(queries.includes("agent_transactions"));
  });

  it("parses agent_transactions with optional filters", () => {
    const parsed = queryChainInputSchema.parse({
      chain_id: "sui",
      query: "agent_transactions",
      params: {
        limit: 10,
        category: "swap",
        status: "success",
        session_id: "00000000-0000-4000-8000-000000000001",
        transaction_id: "00000000-0000-4000-8000-000000000099",
      },
    });

    assert.equal(parsed.query, "agent_transactions");
    assert.equal(parsed.params.limit, 10);
    assert.equal(parsed.params.category, "swap");
    assert.equal(parsed.params.status, "success");
    assert.equal(parsed.params.session_id, "00000000-0000-4000-8000-000000000001");
    assert.equal(parsed.params.transaction_id, "00000000-0000-4000-8000-000000000099");
  });

  it("clamps limit to 10 for agent_transactions params", () => {
    const parsed = queryChainInputSchema.parse({
      chain_id: "sui",
      query: "agent_transactions",
      params: { limit: 25 },
    });
    assert.equal(parsed.params.limit, 10);
  });

  it("allows higher limit for deepbook_trades params", () => {
    const parsed = queryChainInputSchema.parse({
      chain_id: "sui",
      query: "deepbook_trades",
      params: { pool_key: "SUI_USDC", limit: 100 },
    });
    assert.equal(parsed.params.limit, 100);
  });

  it("clamps excessive limit for deepbook_trades params", () => {
    const parsed = queryChainInputSchema.parse({
      chain_id: "sui",
      query: "deepbook_trades",
      params: { pool_key: "SUI_USDC", limit: 8000 },
    });
    assert.equal(parsed.params.limit, 200);
  });
});
