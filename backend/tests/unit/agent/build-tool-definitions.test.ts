import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { resetChainConfigCacheForTests } from "../../../src/config/chains.js";
import { buildQueryChainToolDefinition } from "../../../src/services/agent/tools/build-tool-definitions.js";
import { denyDefaultAgentPermissions } from "../../../src/services/agent/agent-permissions.service.js";

describe("buildAgentToolDefinitions", () => {
  afterEach(() => {
    delete process.env.ENABLED_CHAINS;
    resetChainConfigCacheForTests();
  });

  it("stellar-only deploy exposes stellar queries, not deepbook_pools", () => {
    process.env.ENABLED_CHAINS = "stellar";
    resetChainConfigCacheForTests();

    const definition = buildQueryChainToolDefinition({
      enabledChains: ["stellar"],
      permissions: denyDefaultAgentPermissions(),
    });

    const queryEnum = (
      definition.input_schema.properties as {
        query: { enum: string[] };
      }
    ).query.enum;

    assert.ok(queryEnum.includes("balance"));
    assert.ok(queryEnum.includes("stellar_swap_quote"));
    assert.equal(queryEnum.includes("deepbook_pools"), false);
    assert.equal(queryEnum.includes("swap_quote"), false);
  });

  it("sui deploy includes deepbook_pools when sui is enabled", () => {
    const definition = buildQueryChainToolDefinition({
      enabledChains: ["sui"],
      permissions: {
        ...denyDefaultAgentPermissions(),
        allow_margin: true,
        allow_predict: true,
        allow_flash_loans: true,
        allow_governance: true,
      },
    });

    const queryEnum = (
      definition.input_schema.properties as {
        query: { enum: string[] };
      }
    ).query.enum;

    assert.ok(queryEnum.includes("deepbook_pools"));
    assert.ok(queryEnum.includes("swap_quote"));
  });
});
