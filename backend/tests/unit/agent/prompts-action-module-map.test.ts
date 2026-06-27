import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  QUERY_TYPE_PROMPT_MODULES,
  listMappedPromptModuleIds,
  resolvePromptModulesForExecuteAction,
  resolvePromptModulesForQueryType,
} from "../../../src/services/agent/prompts/action-module-map.js";
import {
  ALL_MODULE_IDS,
  ALL_PROMPT_MODULES,
  CORE_MODULE_IDS,
  PROMPT_MODULES,
} from "../../../src/services/agent/prompts/registry.js";
import { PROMPT_MODULE_TRIGGERS } from "../../../src/services/agent/prompts/module-triggers.js";

describe("prompt action-module-map", () => {
  it("maps deepbook_margin_borrow to margin modules only (not swap or predict)", () => {
    const modules = resolvePromptModulesForExecuteAction("deepbook_margin_borrow");
    assert.deepEqual(modules, ["protocol:deepbook:env", "protocol:deepbook:margin"]);
    assert.ok(!modules.includes("protocol:deepbook:swap"));
    assert.ok(!modules.includes("protocol:deepbook:predict"));
  });

  it("maps deepbook_provision_margin_manager to margin (not balance provision)", () => {
    const modules = resolvePromptModulesForExecuteAction("deepbook_provision_margin_manager");
    assert.deepEqual(modules, ["protocol:deepbook:env", "protocol:deepbook:margin"]);
  });

  it("maps wallet swap to swap modules", () => {
    assert.deepEqual(resolvePromptModulesForExecuteAction("swap"), [
      "protocol:deepbook:env",
      "protocol:deepbook:swap",
    ]);
    assert.deepEqual(resolvePromptModulesForExecuteAction("deepbook_swap"), [
      "protocol:deepbook:env",
      "protocol:deepbook:swap",
    ]);
  });

  it("maps balance-manager limit orders to orders (not margin)", () => {
    const modules = resolvePromptModulesForExecuteAction("deepbook_place_limit_order");
    assert.ok(modules.includes("protocol:deepbook:orders"));
    assert.ok(!modules.includes("protocol:deepbook:margin"));
  });

  it("maps margin limit orders to margin module", () => {
    const modules = resolvePromptModulesForExecuteAction("deepbook_margin_place_limit_order");
    assert.deepEqual(modules, ["protocol:deepbook:env", "protocol:deepbook:margin"]);
  });

  it("maps predict execute actions to predict module", () => {
    assert.deepEqual(resolvePromptModulesForExecuteAction("deepbook_predict_mint"), [
      "protocol:deepbook:env",
      "protocol:deepbook:predict",
    ]);
  });

  it("maps margin and predict query types to the correct protocol modules", () => {
    assert.deepEqual(resolvePromptModulesForQueryType("margin_manager_info"), [
      "protocol:deepbook:env",
      "protocol:deepbook:margin",
    ]);
    assert.deepEqual(resolvePromptModulesForQueryType("predict_markets"), [
      "protocol:deepbook:env",
      "protocol:deepbook:predict",
    ]);
    assert.deepEqual(resolvePromptModulesForQueryType("swap_quote"), [
      "protocol:deepbook:env",
      "protocol:deepbook:swap",
    ]);
  });

  it("maps session_actions to artifact modules", () => {
    assert.deepEqual(resolvePromptModulesForQueryType("session_actions"), [
      "artifact:build",
      "artifact:defi-ui",
    ]);
  });

  it("returns empty optional modules for generic wallet balance queries", () => {
    assert.deepEqual(resolvePromptModulesForQueryType("balance"), []);
    assert.deepEqual(resolvePromptModulesForExecuteAction("transfer_native"), []);
  });

  it("only references registered prompt module ids", () => {
    for (const id of listMappedPromptModuleIds()) {
      assert.ok(ALL_MODULE_IDS.includes(id), `unknown module id in map: ${id}`);
    }
    for (const query of Object.keys(QUERY_TYPE_PROMPT_MODULES)) {
      for (const id of resolvePromptModulesForQueryType(query)) {
        assert.ok(ALL_MODULE_IDS.includes(id), `unknown module for query ${query}: ${id}`);
      }
    }
  });
});

describe("prompt module registry triggers (Phase 3)", () => {
  it("exports CORE_MODULE_IDS and ALL_MODULE_IDS from registry", () => {
    assert.equal(CORE_MODULE_IDS.length, 7);
    assert.equal(ALL_MODULE_IDS.length, ALL_PROMPT_MODULES.length);
    assert.equal(ALL_MODULE_IDS.length, 31);
  });

  it("attaches triggers to optional protocol, artifact, and platform modules", () => {
    const optionalIds = ALL_MODULE_IDS.filter((id) => !CORE_MODULE_IDS.includes(id));
    for (const id of optionalIds) {
      assert.ok(
        PROMPT_MODULES[id].triggers ?? PROMPT_MODULE_TRIGGERS[id],
        `missing triggers for ${id}`,
      );
    }
  });

  it("margin module triggers include deepbook_margin_borrow", () => {
    const actions = PROMPT_MODULE_TRIGGERS["protocol:deepbook:margin"]?.executeActions ?? [];
    assert.ok(actions.includes("deepbook_margin_borrow"));
  });
});
