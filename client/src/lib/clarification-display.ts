import type { ClarificationAnswer, PendingClarification } from "@/lib/chat-api";

/** Human-readable label for a clarification answer shown in the chat transcript. */
export function clarificationAnswerDisplayText(
  pending: PendingClarification,
  answer: ClarificationAnswer,
): string {
  if (answer.confirm !== undefined) {
    return answer.confirm === "yes" ? "Yes" : "No";
  }

  if (answer.value !== undefined) {
    return String(answer.value);
  }

  if (answer.selected_option_id) {
    const option = pending.options?.find((item) => item.id === answer.selected_option_id);
    return option?.label ?? answer.selected_option_id;
  }

  if (answer.selected_option_ids?.length) {
    return answer.selected_option_ids
      .map((id) => pending.options?.find((item) => item.id === id)?.label ?? id)
      .join(", ");
  }

  return "Answered";
}
