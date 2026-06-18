import type { ExecutionStep } from "@/lib/chat-execution-steps";
import type { StreamExecutionStepPayload } from "@/lib/chat-execution-steps";
import type { AgentStatusPhraseCategory } from "@/lib/agent-status-phrases";

export type AgentStatusCategory = AgentStatusPhraseCategory;

export function inferStatusCategoryFromStep(
  step: Pick<
    StreamExecutionStepPayload,
    "id" | "label" | "status" | "detail" | "status_category"
  >,
): AgentStatusCategory {
  if (step.status_category) {
    return step.status_category;
  }

  if (
    step.status === "warning" &&
    /approval|confirm|waiting|preview/i.test(`${step.detail ?? ""} ${step.label}`)
  ) {
    return "waiting";
  }

  const hay = `${step.id} ${step.label} ${step.detail ?? ""}`.toLowerCase();

  if (/web.?search|browse|searching the web|browsing/.test(hay)) {
    return "browsing";
  }

  if (/call.?api|api.?call|calling.*api|external.*request/.test(hay)) {
    return "calling_api";
  }

  if (
    /swap|bridge|execute|flash|quote|bundle|transaction|margin|deposit|withdraw|stake|liquidat|repay|borrow|supply/.test(
      hay,
    )
  ) {
    return "defi";
  }

  if (/build|generat|writ|app|artifact/.test(hay)) {
    return "thinking";
  }

  if (/query|fetch|read|scan|check|pool|balance|oracle|route|price|liquidity/.test(hay)) {
    return "researching";
  }

  if (step.status === "running") {
    return "researching";
  }

  return "thinking";
}

export function inferStatusCategoryFromExecutionSteps(
  steps: ExecutionStep[],
): AgentStatusCategory {
  const running = [...steps].reverse().find((step) => step.status === "running");
  if (running) {
    return inferStatusCategoryFromStep(running);
  }

  const waiting = steps.find(
    (step) =>
      step.status === "warning" &&
      /approval|confirm|waiting|preview/i.test(`${step.detail ?? ""} ${step.label}`),
  );
  if (waiting) {
    return "waiting";
  }

  if (steps.length > 0) {
    return inferStatusCategoryFromStep(steps[steps.length - 1]!);
  }

  return "thinking";
}

export function isAgentStatusCategory(value: string): value is AgentStatusCategory {
  return (
    value === "thinking" ||
    value === "researching" ||
    value === "browsing" ||
    value === "calling_api" ||
    value === "defi" ||
    value === "playful" ||
    value === "waiting"
  );
}
