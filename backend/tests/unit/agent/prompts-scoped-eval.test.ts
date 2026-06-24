import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSystemPrompt } from "../../../src/services/agent/runtime/prompts.js";
import { resolveOptionalPromptModules } from "../../../src/services/agent/prompts/resolve-modules.js";
import { defaultAgentPermissions } from "../../../src/services/agent/agent-permissions.service.js";

const baseInput = {
  chainId: "sui" as const,
  permissions: defaultAgentPermissions(),
};

type EvalScenario = {
  name: string;
  userMessage: string;
  includes?: string[];
  excludes?: string[];
  optionalIncludes?: string[];
  optionalExcludes?: string[];
};

const EVAL_SCENARIOS: EvalScenario[] = [
  {
    name: "chat-only swap",
    userMessage: "swap 10 SUI to USDC",
    includes: ["For token swaps on Sui with no saved project context"],
    excludes: ["DeepBook Margin enables leveraged trading", "DeepBook Predict is a prediction market"],
    optionalIncludes: ["protocol:deepbook:swap"],
    optionalExcludes: ["protocol:deepbook:margin", "protocol:deepbook:predict"],
  },
  {
    name: "DeepBook deposit",
    userMessage: "deposit 5 SUI to my DeepBook balance manager",
    includes: ["deepbook_deposit"],
    excludes: ["DeepBook Margin enables leveraged trading"],
    optionalIncludes: ["protocol:deepbook:balance"],
  },
  {
    name: "margin research",
    userMessage: "how does margin trading work on DeepBook?",
    includes: ["DeepBook Margin enables leveraged trading"],
    excludes: ["DeepBook Predict is a prediction market"],
    optionalIncludes: ["protocol:deepbook:margin"],
    optionalExcludes: ["protocol:deepbook:predict"],
  },
  {
    name: "build swap UI",
    userMessage: "build a swap UI like Uniswap",
    includes: ["generate_app", "CRITICAL — edit_app"],
    excludes: ["DeepBook Margin enables leveraged trading"],
    optionalIncludes: ["artifact:build", "artifact:defi-ui"],
    optionalExcludes: ["protocol:deepbook:margin", "protocol:deepbook:swap"],
  },
  {
    name: "edit artifact follow-up",
    userMessage: "make the background dark",
    includes: ["CRITICAL — edit_app surgical edits"],
    optionalIncludes: ["artifact:edit"],
  },
  {
    name: "notification reminder",
    userMessage: "remind me in 10 minutes to check my balance",
    includes: ["createNotificationRule"],
    optionalIncludes: ["platform:notifications"],
    excludes: ["DeepBook Margin enables leveraged trading"],
  },
  {
    name: "flash loan research",
    userMessage: "recommend a flash loan strategy for 5000 USDC",
    includes: ["Flash loans require Allow flash loans"],
    excludes: ["DeepBook Margin enables leveraged trading"],
    optionalIncludes: ["protocol:deepbook:flash-loan"],
  },
  {
    name: "flash loan execution",
    userMessage: "execute the flash loan round trip now",
    includes: ["Flash loans require Allow flash loans"],
    optionalIncludes: ["protocol:deepbook:flash-loan"],
  },
];

describe("scoped prompt eval matrix (Phase 8)", () => {
  for (const scenario of EVAL_SCENARIOS) {
    it(scenario.name, () => {
      const scoped = buildSystemPrompt({
        mode: "scoped",
        userMessage: scenario.userMessage,
      });

      for (const snippet of scenario.includes ?? []) {
        assert.ok(scoped.includes(snippet), `expected scoped prompt to include: ${snippet}`);
      }
      for (const snippet of scenario.excludes ?? []) {
        assert.ok(!scoped.includes(snippet), `expected scoped prompt to exclude: ${snippet}`);
      }

      const optional = resolveOptionalPromptModules({
        ...baseInput,
        userMessage: scenario.userMessage,
      });
      for (const moduleId of scenario.optionalIncludes ?? []) {
        assert.ok(optional.includes(moduleId as never), `expected optional module ${moduleId}`);
      }
      for (const moduleId of scenario.optionalExcludes ?? []) {
        assert.ok(!optional.includes(moduleId as never), `expected to omit module ${moduleId}`);
      }
    });
  }

  it("scoped prompts are smaller than full mode on average", () => {
    const full = buildSystemPrompt({ mode: "full" });
    let scopedTotal = 0;
    for (const scenario of EVAL_SCENARIOS) {
      scopedTotal += buildSystemPrompt({
        mode: "scoped",
        userMessage: scenario.userMessage,
      }).length;
    }
    const scopedAverage = scopedTotal / EVAL_SCENARIOS.length;
    assert.ok(scopedAverage < full.length * 0.85, "scoped average should be materially smaller than full");
  });

  it("defaults to scoped mode when mode is omitted", () => {
    const implicit = buildSystemPrompt({ userMessage: "swap 10 SUI to USDC" });
    const explicit = buildSystemPrompt({ mode: "scoped", userMessage: "swap 10 SUI to USDC" });
    assert.equal(implicit, explicit);
    assert.ok(!implicit.includes("DeepBook Margin enables leveraged trading"));
  });
});
