import type { ClarificationGap } from "../workflow/clarification.types.js";
import type { WorkflowPlan } from "../workflow/workflow.types.js";
import type { ClarificationQuestionContext } from "./clarification-question-context.js";
import { synthesizeClarificationQuestion } from "./clarification-question-synthesizer.js";
import { toWorkflowQuestionContext } from "./workflow-clarification-context.js";

export async function synthesizeWorkflowClarificationGap(
  plan: WorkflowPlan,
  gap: ClarificationGap,
): Promise<ClarificationGap> {
  return enrichGapWithSynthesizedQuestion(gap, toWorkflowQuestionContext(plan, gap));
}

export async function enrichGapWithSynthesizedQuestion(
  gap: ClarificationGap,
  context: ClarificationQuestionContext,
): Promise<ClarificationGap> {
  const template = {
    question: context.template_question,
    hint: context.template_hint ?? gap.hint,
  };

  const synthesized = await synthesizeClarificationQuestion(context, template);

  return {
    ...gap,
    question: synthesized.question,
    hint: synthesized.hint ?? gap.hint,
  };
}

export async function startClarificationWithQuestion<TIntent>(
  input: {
    sessionId: string;
    intent: TIntent;
    gap: ClarificationGap;
    toQuestionContext: (intent: TIntent, gap: ClarificationGap) => ClarificationQuestionContext;
    startSession: (enrichedGap: ClarificationGap) => { id: string };
    buildOutcome: (question: string, clarificationId: string, enrichedGap: ClarificationGap) => unknown;
  },
): Promise<unknown> {
  const context = input.toQuestionContext(input.intent, input.gap);
  const enrichedGap = await enrichGapWithSynthesizedQuestion(input.gap, context);
  const state = input.startSession(enrichedGap);
  return input.buildOutcome(enrichedGap.question, state.id, enrichedGap);
}
