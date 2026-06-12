import { getDeepBookEnv } from "../../../config/deepbook.js";
import {
  classifyWorkflowSegment,
  splitWorkflowSegments,
} from "./workflow-parser.js";
import type {
  PlannerOutput,
  PlannedStep,
  PlanSlot,
} from "./planner.types.js";
import type { WorkflowStep } from "./workflow.types.js";

const IMPLICIT_DEPOSIT = /\bdeposit\s+(?:it|that|this|them|am)\b/i;
const IMPLICIT_REF_PHRASE = /\b(?:it|that|this|them|am|the\s+(?:output|result|swap))\b/i;

function splitMessageSegments(message: string): string[] {
  const trimmed = message.trim();
  if (!trimmed) return [];

  const sequential = splitWorkflowSegments(trimmed);
  if (sequential.length >= 2) {
    return sequential;
  }

  const commaParts = trimmed
    .split(
      /\s*,\s*(?=(?:swap|deposit|withdraw|with\s*all|transfer|send|order|buy|sell|cancel|place|click|comot|put)\b)/i,
    )
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (commaParts.length >= 2) {
    return commaParts;
  }

  return [trimmed];
}

function normalizeTypoSegment(segment: string): {
  normalized: string;
  assumptions: PlannerOutput["assumptions"];
} {
  const assumptions: PlannerOutput["assumptions"] = [];
  let normalized = segment;

  if (/\bwith\s*all\b/i.test(segment) && !/\bwithdraw\b/i.test(segment)) {
    normalized = segment.replace(/\bwith\s*all\b/gi, "withdraw all");
    assumptions.push({
      field: "action",
      interpreted: "withdraw all",
      from_phrase: segment.match(/\bwith\s*all\b/i)?.[0] ?? "with all",
    });
  }

  if (/\bcomot\b/i.test(segment)) {
    normalized = segment.replace(/\bcomot\b/gi, "withdraw");
    assumptions.push({
      field: "action",
      interpreted: "withdraw",
      from_phrase: "comot",
    });
  }

  if (/\bdepost\b/i.test(segment)) {
    normalized = segment.replace(/\bdepost\b/gi, "deposit");
    assumptions.push({
      field: "action",
      interpreted: "deposit",
      from_phrase: "depost",
    });
  }

  if (/\bwap\b/i.test(normalized) && !/\bswap\b/i.test(normalized)) {
    normalized = normalized.replace(/\bwap\b/gi, "swap");
    assumptions.push({
      field: "action",
      interpreted: "swap",
      from_phrase: "wap",
    });
  }

  return { normalized, assumptions };
}

function workflowStepToPlanned(
  step: WorkflowStep,
  stepIndex: number,
  segment: string,
): PlannedStep | null {
  if (step.kind === "execute") {
    const params: Record<string, PlanSlot | string | number | boolean> = {
      ...(step.input.params as Record<string, PlanSlot | string | number | boolean>),
    };

    if (
      step.input.action === "deepbook_deposit" &&
      (IMPLICIT_DEPOSIT.test(segment) ||
        (/\bdeposit\b/i.test(segment) && !/\d/.test(segment) && IMPLICIT_REF_PHRASE.test(segment)))
    ) {
      const priorIndex = stepIndex - 1;
      if (priorIndex >= 0) {
        params.amount_display = {
          kind: "ref",
          step_index: priorIndex,
          field: "output_amount",
        };
        params.coin_key = {
          kind: "ref",
          step_index: priorIndex,
          field: "output_coin",
        };
      }
    }

    return {
      action: step.input.action as PlannedStep["action"],
      label: step.label,
      params,
    };
  }

  if (step.kind === "query") {
    return {
      action: "query",
      label: step.label,
      params: {
        query: step.input.query,
        ...(step.input.params as Record<string, string | number | boolean>),
      },
    };
  }

  return null;
}

export function looksLikeWorkflowMessage(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return false;

  const actionPattern =
    /\b(swap|deposit|withdraw|with\s*all|transfer|send|order|buy|sell|cancel|place|click|comot|put)\b/gi;
  const matches = trimmed.match(actionPattern);
  if (matches && matches.length >= 2) return true;

  if (splitWorkflowSegments(trimmed).length >= 2) return true;

  const commaParts = trimmed.split(/\s*,\s*/);
  if (commaParts.length >= 2) {
    const withActions = commaParts.filter((part) => actionPattern.test(part));
    if (withActions.length >= 2) return true;
  }

  return false;
}

export function planWorkflowHeuristic(message: string): PlannerOutput | null {
  if (!looksLikeWorkflowMessage(message)) {
    return null;
  }

  const segments = splitMessageSegments(message);
  const allAssumptions: PlannerOutput["assumptions"] = [];
  const steps: PlannedStep[] = [];

  for (let index = 0; index < segments.length; index += 1) {
    const { normalized, assumptions } = normalizeTypoSegment(segments[index]);
    allAssumptions.push(...assumptions);

    const classified = classifyWorkflowSegment(normalized);

    if (classified.kind === "agent") {
      const orderLike = /\b(order|buy|sell)\b/i.test(normalized);
      if (orderLike) {
        const buyMatch = normalized.match(
          /buy\s+([\d.,]+)\s*(sui|usdc).*(?:at|@)\s*([\d.,]+)/i,
        );
        if (buyMatch) {
          steps.push({
            action: "deepbook_place_limit_order",
            label: `Limit buy ${buyMatch[1]} ${buyMatch[2].toUpperCase()}`,
            params: {
              pool_key: getDeepBookEnv().defaultPool,
              quantity: Number(buyMatch[1].replace(/,/g, "")),
              price: Number(buyMatch[3].replace(/,/g, "")),
              side: "buy",
            },
          });
          continue;
        }

        allAssumptions.push({
          field: `step${index}.action`,
          interpreted: "limit order (details incomplete)",
          from_phrase: normalized.slice(0, 40),
        });
      }

      const depositImplicit =
        /\bdeposit\b/i.test(normalized) &&
        (IMPLICIT_DEPOSIT.test(normalized) ||
          (IMPLICIT_REF_PHRASE.test(normalized) && !/\d/.test(normalized)));

      if (depositImplicit && index > 0) {
        steps.push({
          action: "deepbook_deposit",
          label: "Deposit prior step output",
          params: {
            amount_display: {
              kind: "ref",
              step_index: index - 1,
              field: "output_amount",
            },
            coin_key: {
              kind: "ref",
              step_index: index - 1,
              field: "output_coin",
            },
          },
        });
        continue;
      }

      continue;
    }

    const planned = workflowStepToPlanned(classified, index, normalized);
    if (planned) {
      steps.push(planned);
    }
  }

  if (steps.length < 2) {
    return null;
  }

  let confidence = 0.95;
  let needs_clarification = false;
  let clarification: PlannerOutput["clarification"];

  if (allAssumptions.length > 0) {
    confidence = 0.78;
    needs_clarification = true;
    const first = allAssumptions[0];
    clarification = {
      question: `Did you mean ${first.interpreted} (from "${first.from_phrase}")?`,
      kind: "intent",
      step_index: 0,
    };
  }

  for (let i = 0; i < steps.length; i += 1) {
    const params = steps[i].params;
    for (const val of Object.values(params)) {
      if (typeof val === "object" && val !== null && "kind" in val) {
        const slot = val as PlanSlot;
        if (slot.kind === "ref" || slot.kind === "missing") {
          confidence = Math.min(confidence, 0.75);
          needs_clarification = true;
          clarification = {
            question: `Should I use the output from step ${slot.kind === "ref" ? slot.step_index + 1 : i} for ${steps[i].label}?`,
            kind: "amount_ref",
            step_index: i,
          };
        }
      }
    }

    if (steps[i].action === "deepbook_place_limit_order") {
      const price = params.price;
      if (price === undefined || price === null) {
        confidence = 0.6;
        needs_clarification = true;
        clarification = {
          question: `What price should I use for the limit order in step ${i + 1}?`,
          kind: "intent",
          step_index: i,
        };
      }
    }
  }

  return {
    is_multi_step: true,
    steps,
    assumptions: allAssumptions,
    confidence,
    needs_clarification,
    clarification,
  };
}
