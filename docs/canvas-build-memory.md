# Canvas build memory

Per-workflow **Builder thread memory** so follow-up build messages ("change Brazil threshold", "why that wiring?") retain intent history. The **graph** remains structural truth (persisted on `CanvasWorkflow.graph`); build messages store **intent and summaries** only.

## Ask vs Build modes

| Mode | `builder_intent` | Behavior |
| ---- | ---------------- | -------- |
| **Build** (default) | `"build"` | Tool loop — `add_node`, `patch_node`, `add_edge`, `complete`; mutates graph |
| **Ask** | `"ask"` | Text-only **Workflow Advisor** — explains graph, no tools, no graph changes |

Intent comes from the **UI toggle** or API field — never from regex on message text.

- Ask: loads graph + `design_notes` + build history; streams answer via `workflow.build.status`; ends with `workflow.build.ack` (not `workflow.build.complete`).
- Build: unchanged tool loop; `edit_intent` / `selected_node_id` from client only (no message-regex patch detection).

## Data model

| Table | Purpose |
| ----- | ------- |
| `CanvasBuildMessage` | `user` / `assistant` rows scoped to `workflow_id` + `user_id` |
| `CanvasWorkflow.design_notes` | Latest Builder `complete` summary (optional display) |

Indexes: `(workflow_id, created_at ASC)` for history load.

## Context rules

| Source | In LLM `messages[]` |
| ------ | ------------------- |
| System prompt | Rebuilt each turn (`buildBuilderSystemPrompt()`) |
| Prior `CanvasBuildMessage` rows | Raw user intent + assistant summaries (capped) |
| Current turn user message | User text + **fresh graph summary** (authoritative) |

**Caps (MVP):** last 20 messages or ~8k chars (`CANVAS_BUILD_MEMORY_MAX_*` in `canvas-build-memory.service.ts`).

**Not merged** into global `AgentMemory` — workflow-local only.

## Persistence timing

1. **Start of turn:** append user message (raw text).
2. **Build — on `complete`:** append assistant summary from tool arg; update `design_notes`.
3. **Ask — on answer:** append assistant reply text; emit `workflow.build.ack` (no `design_notes` update).

Failed builds keep the user row; no assistant row until a successful complete or ask answer.

## API

| Method | Path | Body fields |
| ------ | ---- | ----------- |
| `POST` | `/api/v1/canvas/workflows/:workflowId/build/stream` | `message`, optional `builder_intent` (`ask` \| `build`, default `build`), `selected_node_id`, `edit_intent` |
| `GET` | `/api/v1/canvas/workflows/:workflowId/build/messages` | List build thread for UI reload |
| `DELETE` | `/api/v1/canvas/workflows/:workflowId/build/messages` | Clear workflow build history |

Both require auth + `canvas` feature flag. Ownership enforced via `workflow_id` + `user_id`.

## Client

On workflow load, `CanvasWorkspace` fetches build messages and maps them into `CanvasBuilderActivity`. Submitting a build **appends** to the panel instead of clearing prior turns. In build mode, an **Ask | Build** toggle sets `builder_intent` on stream requests.

## Service entry points

- `backend/src/services/canvas/build/canvas-build-memory.service.ts` — CRUD + context cap
- `backend/src/services/canvas/build/canvas-builder-agent.service.ts` — `executeBuilderTurn` loads history before LLM call

## References

- Chat session memory pattern: `docs/chat-memory-TODO.md`
- Canvas architecture: `docs/canvas-workflows-architecture-TODO.md`
