import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QUERY_CHAIN_TOOL_NAME } from "../../../src/services/agent/query-chain.tool.js";
import { EXECUTE_TRANSACTION_TOOL_NAME } from "../../../src/services/agent/execute-transaction.tool.js";
import {
  formatExecutedTxSummary,
  summarizeToolResult,
} from "../../../src/services/agent/runtime/summarize-tool-result.js";
import { summarizeQueryChainResult } from "../../../src/services/agent/runtime/summarize-query-chain.js";

describe("summarizeToolResult agent_transactions", () => {
  it("passes through the pre-formatted summary instead of Query completed", () => {
    const summary =
      "Most recent agent transaction:\n\n1. Swap on DeepBook (SUI_USDC)\n   Date: June 13, 2026 at 12:48 AM UTC\n   Amount: 0.5 SUI → ~1.2 USDC\n   Status: Success";

    const content = summarizeToolResult(QUERY_CHAIN_TOOL_NAME, {
      items: [],
      total: 1,
      limit: 10,
      summary,
    });

    assert.equal(content, summary);
    assert.notEqual(content, "Query completed.");
  });
});

describe("summarizeToolResult margin execute", () => {
  it("summarizes margin maintainer actions", () => {
    const content = summarizeToolResult(EXECUTE_TRANSACTION_TOOL_NAME, {
      status: "executed",
      result: {
        chain_id: "sui",
        digest: "abc123",
        address: "0xwallet",
        effects_status: "success",
        deepbook: {
          margin_maintainer: {
            action: "create_pool",
            coin_type: "USDC",
          },
        },
      },
    });

    assert.match(content, /Margin maintainer create pool for USDC/);
    assert.match(content, /abc123/);
  });

  it("summarizes margin pool supply with SupplierCap", () => {
    const summary = formatExecutedTxSummary({
      chain_id: "sui",
      digest: "def456",
      address: "0xwallet",
      effects_status: "success",
      deepbook: {
        margin: {
          action: "supply_pool",
          margin_manager: "0xcap",
          supplier_cap: "0xcap",
          pool_key: "USDC",
          coin_type: "USDC",
          amount: 100,
        },
      },
    });

    assert.match(summary, /supply pool/);
    assert.match(summary, /SupplierCap: 0xcap/);
  });
});

describe("summarizeQueryChainResult margin indexer", () => {
  it("passes through margin indexer summary", () => {
    const summary = summarizeQueryChainResult({
      source: "indexer",
      count: 2,
      summary: "Found 2 liquidation event(s):\n1. manager 0xabc… liquidated 50",
    });

    assert.equal(summary, "Found 2 liquidation event(s):\n1. manager 0xabc… liquidated 50");
  });
});
