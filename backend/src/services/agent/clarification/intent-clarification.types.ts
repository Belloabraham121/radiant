import type { ClarificationGap } from "../workflow/clarification.types.js";
import type {
  ClarificationAction,
  ClarificationQuestionContext,
} from "./clarification-question-context.js";

export type IntentClarificationPlugin<TIntent> = {
  action: ClarificationAction;
  toQuestionContext: (intent: TIntent, gap: ClarificationGap) => ClarificationQuestionContext;
};
