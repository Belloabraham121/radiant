export function agentStreamUrl(sessionId: string): string {
  return `/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/agent-stream`;
}
