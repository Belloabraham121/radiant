import OpenAI from "openai";
import { getAgentProvider, getOpenAiConfig } from "../../../config/agent.js";
import { AppError } from "../../../errors/app-error.js";
import { WORKFLOW_PLANNER_SYSTEM_PROMPT } from "./planner-prompt.js";
import type { PlannerOutput } from "./planner.types.js";
import { normalizePlannerAssumptions } from "./planner-assumptions.js";
import {
  looksLikeWorkflowMessage,
  planWorkflowHeuristic,
} from "./heuristic-planner.js";

type PlannerHandler = (message: string) => Promise<PlannerOutput | null>;

let plannerHandlerForTests: PlannerHandler | null = null;

export function setPlannerHandlerForTests(handler: PlannerHandler | null): void {
  plannerHandlerForTests = handler;
}

function parsePlannerJson(raw: string): PlannerOutput {
  const parsed = JSON.parse(raw) as PlannerOutput;
  if (!Array.isArray(parsed.steps) || typeof parsed.confidence !== "number") {
    throw new Error("Invalid planner JSON shape");
  }
  return {
    is_multi_step: Boolean(parsed.is_multi_step),
    steps: parsed.steps,
    assumptions: normalizePlannerAssumptions(parsed.assumptions),
    confidence: parsed.confidence,
    needs_clarification: Boolean(parsed.needs_clarification),
    clarification: parsed.clarification,
  };
}

const RESEARCH_ONLY_PATTERN =
  /\b(recommend|suggest|advise|what.*(?:should|would|could) (?:i|you)|what (?:position|strategy|option)|explain|walk me through|tell me (?:about|what|how)|how (?:does|do|can|would)|what (?:can|are|is) )/i;

function isResearchOnlyMessage(message: string): boolean {
  if (!RESEARCH_ONLY_PATTERN.test(message)) return false;
  const hasExplicitMultiAction =
    /\b(then|after that|when you're done|and (?:also|then)|,\s*(?:then|also))\b/i.test(message) &&
    /\b(swap|deposit|withdraw|transfer|stake|cancel|place)\b/i.test(message);
  return !hasExplicitMultiAction;
}

async function planWorkflowWithOpenAi(message: string): Promise<PlannerOutput | null> {
  if (isResearchOnlyMessage(message)) {
    return null;
  }

  const { apiKey, model } = getOpenAiConfig();
  if (!apiKey) {
    return planWorkflowHeuristic(message);
  }

  const client = new OpenAI({ apiKey });

  try {
    const response = await client.chat.completions.create({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: WORKFLOW_PLANNER_SYSTEM_PROMPT },
        {
          role: "user",
          content:
            `Parse this message into a workflow plan JSON:\n\n${message}\n\n` +
            `Schema: { is_multi_step, steps: [{ action, label, params, project_id?, installation_id?, depends_on?: { after_step_index, only_if_success?, only_if_condition? } }], assumptions: [], confidence: 0-1, needs_clarification, clarification?: { question, step_index?, kind } }`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return planWorkflowHeuristic(message);
    }

    const plan = parsePlannerJson(content);
    if (!plan.is_multi_step || plan.steps.length < 2) {
      return null;
    }
    return plan;
  } catch {
    return planWorkflowHeuristic(message);
  }
}

export async function planWorkflowMessage(message: string): Promise<PlannerOutput | null> {
  if (plannerHandlerForTests) {
    return plannerHandlerForTests(message);
  }

  // Compound intents (swap + balance, swap + build, flash loan gates) are resolved by the
  // LLM planner — not regex on user text. Heuristic fallback handles explicit multi-action
  // chains only (e.g. "swap X, then deposit Y").
  if (getAgentProvider() === "openai" && getOpenAiConfig().apiKey) {
    const llmPlan = await planWorkflowWithOpenAi(message);
    if (llmPlan) {
      return llmPlan;
    }
  }

  if (!looksLikeWorkflowMessage(message)) {
    return null;
  }

  return planWorkflowHeuristic(message);
}

export async function planWorkflowMessageOrThrow(message: string): Promise<PlannerOutput> {
  const plan = await planWorkflowMessage(message);
  if (!plan) {
    throw new AppError(400, "PLANNER_NO_WORKFLOW", "Message does not look like a multi-step workflow.");
  }
  return plan;
}
