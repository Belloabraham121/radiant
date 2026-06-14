/**
 * GPT-5 and o-series models use `max_completion_tokens` instead of `max_tokens`.
 * @see https://platform.openai.com/docs/api-reference/chat/create
 */
export function openAiUsesMaxCompletionTokens(model: string): boolean {
  const id = model.trim().toLowerCase();
  if (!id) return false;
  if (id.includes("gpt-5") || id.startsWith("gpt-5")) return true;
  if (/^o\d/.test(id)) return true;
  return false;
}

export function openAiMaxOutputTokens(
  model: string,
  limit: number,
): { max_tokens?: number; max_completion_tokens?: number } {
  if (openAiUsesMaxCompletionTokens(model)) {
    return { max_completion_tokens: limit };
  }
  return { max_tokens: limit };
}
