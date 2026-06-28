import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getNotificationEvaluator,
  registerNotificationEvaluator,
  resetNotificationEvaluatorRegistryForTests,
} from "../../../src/services/notifications/evaluators/registry.js";
import {
  groupPollRulesByEvaluator,
  loadActivePollRuleContexts,
} from "../../../src/services/notifications/notification-poll-rule.loader.js";
import { renderNotificationPresentation } from "../../../src/services/notifications/notification-presentation.service.js";
import type {
  NotificationEvaluator,
  PollRuleEvaluationContext,
} from "../../../src/services/notifications/notification-evaluator.types.js";

describe("notification presentation", () => {
  it("renders templates with fallback values", () => {
    const rendered = renderNotificationPresentation(
      {
        title_template: "Alert {{profit_bps}} bps",
        body_template: "{{route_summary}}",
        deep_link_template: "/app/chat",
      },
      {
        profit_bps: 42,
        route_summary: "SUI_USDC → DEEP_SUI",
      },
      { title: "Fallback", body: "Fallback body", deep_link: "/app/chat" },
    );

    assert.equal(rendered.title, "Alert 42 bps");
    assert.equal(rendered.body, "SUI_USDC → DEEP_SUI");
    assert.equal(rendered.deep_link, "/app/chat");
  });
});

describe("notification evaluator registry", () => {
  it("registers and retrieves evaluators by key", () => {
    resetNotificationEvaluatorRegistryForTests();

    const stub: NotificationEvaluator = {
      key: "test.stub",
      async evaluate() {
        return [];
      },
    };

    registerNotificationEvaluator(stub);
    registerNotificationEvaluator({
      key: "test.other",
      async evaluate() {
        return [];
      },
    });

    assert.equal(getNotificationEvaluator("test.stub")?.key, "test.stub");
    assert.equal(getNotificationEvaluator("missing"), undefined);

    resetNotificationEvaluatorRegistryForTests();
  });
});

describe("poll rule grouping", () => {
  it("groups contexts by evaluator key from type definition", () => {
    const contextA = {
      typeDefinition: { evaluator: "alpha.scanner" },
    } as PollRuleEvaluationContext;
    const contextB = {
      typeDefinition: { evaluator: "beta.scanner" },
    } as PollRuleEvaluationContext;
    const contextC = {
      typeDefinition: { evaluator: "alpha.scanner" },
    } as PollRuleEvaluationContext;

    const grouped = groupPollRulesByEvaluator([contextA, contextB, contextC]);
    assert.equal(grouped.get("alpha.scanner")?.length, 2);
    assert.equal(grouped.get("beta.scanner")?.length, 1);
  });
});

describe("poll rule loader", () => {
  it("exports loadActivePollRuleContexts", () => {
    assert.equal(typeof loadActivePollRuleContexts, "function");
  });
});
