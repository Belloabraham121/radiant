#!/usr/bin/env tsx
/**
 * Manual demo helper for live agent SSE (Phase 8).
 *
 * In-process listener (same Node process as the API — dev with single worker):
 *   npx tsx scripts/demo-agent-stream.ts <chat-session-uuid>
 *
 * Browser SSE (requires privy-token cookie from a logged-in session):
 *   curl -N -b "privy-token=YOUR_TOKEN" \\
 *     http://localhost:3001/api/v1/chat/sessions/<session-uuid>/agent-stream
 *
 * Then trigger an agent swap with the artifact preview open in chat so SSE + broadcast fire.
 */
import { subscribeAgentStream } from "../src/services/agent/agent-stream.service.js";

const sessionId = process.argv[2];

if (!sessionId) {
  console.error("Usage: npx tsx scripts/demo-agent-stream.ts <chat-session-uuid>");
  console.error("");
  console.error("Open the chat thread + artifact preview, then ask the agent to swap.");
  console.error("Events print here when this script shares the same Node process as the API.");
  process.exit(1);
}

console.log(`Listening for agent stream on session ${sessionId}…`);
console.log("Press Ctrl+C to stop.\n");

subscribeAgentStream(sessionId, (event) => {
  console.log(JSON.stringify(event));
});

setInterval(() => {
  // Keep process alive.
}, 60_000);
