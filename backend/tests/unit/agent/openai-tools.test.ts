import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { agentToolDefinitions } from "../../../src/services/agent/tools.js";
import { toOpenAiTools } from "../../../src/services/agent/runtime/openai-tools.js";

describe("toOpenAiTools", () => {
  it("converts agent tool definitions to OpenAI function tools", () => {
    const tools = toOpenAiTools(agentToolDefinitions);

    assert.equal(tools.length, agentToolDefinitions.length);

    for (const [index, tool] of tools.entries()) {
      const definition = agentToolDefinitions[index];
      assert.equal(tool.type, "function");
      assert.equal(tool.function.name, definition.name);
      assert.equal(tool.function.description, definition.description);
      assert.deepEqual(tool.function.parameters, definition.input_schema);
    }
  });

  it("includes query_chain, execute_transaction, call_app_action, and update_memory", () => {
    const names = toOpenAiTools(agentToolDefinitions).map((tool) => tool.function.name);
    assert.ok(names.includes("query_chain"));
    assert.ok(names.includes("execute_transaction"));
    assert.ok(names.includes("call_app_action"));
    assert.ok(names.includes("update_memory"));
  });
});
