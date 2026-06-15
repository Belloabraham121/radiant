import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../../../src/errors/app-error.js";
import {
  APP_ACTION_NAMES,
  getAppActionDefinition,
  isAppActionName,
  listAppActionDefinitions,
} from "../../../src/services/projects/app-action-registry.js";
import {
  categorizeAppAction,
  mapAppActionToExecuteInput,
  parseAppActionName,
  parseAppActionParams,
  validateAppActionInput,
  mapExecuteActionToAppActionName,
} from "../../../src/services/projects/app-action-mapper.js";

describe("app-action registry", () => {
  it("lists all canonical action names", () => {
    assert.ok(APP_ACTION_NAMES.includes("swap"));
    assert.ok(APP_ACTION_NAMES.includes("flash_loan"));
    assert.equal(listAppActionDefinitions().length, APP_ACTION_NAMES.length);
  });

  it("isAppActionName rejects execute_transaction action strings", () => {
    assert.equal(isAppActionName("swap"), true);
    assert.equal(isAppActionName("deepbook_flash_loan"), false);
  });

  it("maps swap to execute_transaction swap on sui", () => {
    const definition = getAppActionDefinition("swap");
    assert.equal(definition.execute_action, "swap");
    assert.equal(definition.category, "swap");
    assert.equal(definition.default_chain_id, "sui");
  });

  it("maps flash_loan to deepbook_flash_loan", () => {
    const definition = getAppActionDefinition("flash_loan");
    assert.equal(definition.execute_action, "deepbook_flash_loan");
    assert.equal(definition.category, "flash_loan");
  });

  it("maps deposit to deepbook_deposit with deepbook_balance category", () => {
    assert.equal(getAppActionDefinition("deposit").execute_action, "deepbook_deposit");
    assert.equal(categorizeAppAction("deposit"), "deepbook_balance");
  });
});

describe("app-action mapper", () => {
  it("parseAppActionParams requires swap amount and side", () => {
    assert.throws(
      () => parseAppActionParams("swap", { side: "sell" }),
      (err: unknown) => err instanceof AppError && err.code === "VALIDATION_ERROR",
    );
  });

  it("parseAppActionParams coerces string estimated_out_display to number", () => {
    const parsed = parseAppActionParams("swap", {
      amount: 3.648353,
      side: "buy",
      pool_key: "SUI_USDC",
      estimated_out_display: "4.512",
    });
    assert.equal(parsed.estimated_out_display, 4.512);
    assert.equal(typeof parsed.estimated_out_display, "number");
  });

  it("parseAppActionParams coerces string amount_display to number", () => {
    const parsed = parseAppActionParams("swap", {
      amount_display: "3.648353",
      side: "buy",
    });
    assert.equal(parsed.amount_display, 3.648353);
  });

  it("mapAppActionToExecuteInput passes params through", () => {
    const input = mapAppActionToExecuteInput("swap", {
      amount: 1.5,
      side: "sell",
      pool_key: "SUI_USDC",
    });
    assert.deepEqual(input, {
      chain_id: "sui",
      action: "swap",
      params: {
        amount: 1.5,
        side: "sell",
        pool_key: "SUI_USDC",
      },
    });
  });

  it("validateAppActionInput runs DeepBook swap validation", () => {
    assert.throws(
      () =>
        validateAppActionInput("swap", {
          amount: -1,
          side: "sell",
        }),
      (err: unknown) => err instanceof AppError,
    );
  });

  it("validateAppActionInput accepts valid stake params shape", () => {
    const input = validateAppActionInput("stake", {
      amount_display: 10,
      pool_key: "SUI_USDC",
    });
    assert.equal(input.action, "deepbook_stake");
    assert.equal(input.params.amount_display, 10);
  });

  it("parseAppActionName throws for unknown actions", () => {
    assert.throws(
      () => parseAppActionName("deepbook_swap"),
      (err: unknown) =>
        err instanceof AppError &&
        err.code === "VALIDATION_ERROR" &&
        Array.isArray((err.details as { known_actions?: string[] })?.known_actions),
    );
  });

  it("mapExecuteActionToAppActionName maps swap and deepbook_deposit", () => {
    assert.equal(mapExecuteActionToAppActionName("swap"), "swap");
    assert.equal(mapExecuteActionToAppActionName("deepbook_deposit"), "deposit");
    assert.equal(mapExecuteActionToAppActionName("execute_bytes"), null);
  });
});
