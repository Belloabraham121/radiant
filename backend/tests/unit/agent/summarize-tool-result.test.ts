import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QUERY_CHAIN_TOOL_NAME } from "../../../src/services/agent/query-chain.tool.js";
import { summarizeToolResult } from "../../../src/services/agent/runtime/summarize-tool-result.js";

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
