# Chat & memory — implementation TODO

Personal agent chat for Radiant: **persistent threads**, **full context within a session**, and **lightweight user memory**. One doc for backend, client, and agent runtime.

**MVP principle:** Context lives **inside the current chat session only**. If you leave a thread and come back later, the agent sees **everything said in that thread**. A **new chat** starts fresh thread context. **No** cross-conversation search, embeddings, or RAG retriever in MVP.

**AI provider (MVP):** **[OpenAI](https://platform.openai.com/docs)** Chat Completions API with function calling. Production chat uses OpenAI when `OPENAI_API_KEY` is set. **Stub** runtime for local dev without an API key. Adapter interface allows other providers later; **do not** wire Claude for this milestone.

---

## Product behavior (MVP)

| Scenario                            | Expected behavior                                                                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| User sends messages in a chat       | Messages saved; agent replies with tools; UI shows history                                                                              |
| User refreshes the page             | Same `session_id` → same messages reload                                                                                                |
| User opens an old chat from sidebar | Full transcript for **that** session loads; agent continues with full thread context                                                    |
| User clicks “New chat”              | New `ChatSession`; empty history; agent has no prior messages from other threads                                                        |
| User asks “what’s my balance?”      | `query_chain` tool (existing)                                                                                                           |
| Large transfer                      | `pending_transaction` + approval modal (existing)                                                                                       |
| User memory                         | Small durable facts/preferences (e.g. default chain, display name hints) injected into system prompt — **not** a dump of all past chats |

### Explicitly out of scope (MVP)

- `search_conversations` / RAG / embeddings / “remember that other chat we had”
- Walrus blob memory (README north star — Postgres first)
- Streaming tokens (SSE / WebSocket) — follow-up
- Multiple named agents per user (one Radiant agent; provider adapter only)
- Anthropic / Claude runtime (removed; OpenAI + stub only)
- Public “search all my chats” UI endpoint
- Loading **all** user threads into one LLM context

---

## Architecture

```text
Client (/app, /app/chat/[sessionId])
    │
    ├── GET  /api/v1/chat/sessions
    ├── POST /api/v1/chat/sessions
    ├── GET  /api/v1/chat/sessions/:id/messages
    └── POST /api/v1/chat                    (send message / approve tx)
            │
            ▼
    services/conversation/                     (sessions + messages CRUD)
            │
            ▼
    services/agent/chat-orchestrator.ts      (load thread → runtime → persist)
            │
            ├── services/memory/             (user-level AgentMemory JSON)
            ├── services/agent/runtime/      (OpenAI production · stub dev)
            └── services/agent/tools.ts      (query_chain, execute_transaction, update_memory)
```

**Session context rule:** When building the LLM `messages[]` array, load **only** `ChatMessage` rows for the current `session_id`, oldest → newest, capped by a token/window limit (e.g. last 50 messages or ~8k tokens).

**Memory rule:** Load `AgentMemory` for the user once per turn; inject into **system** prompt. Optional `update_memory` tool writes back facts — does **not** replace thread history.

---

## Data model (Postgres / Prisma)

### `ChatSession`

One row = one sidebar thread (“section”).

| Column       | Type        | Notes                                        |
| ------------ | ----------- | -------------------------------------------- |
| `id`         | UUID PK     | Client uses this as `session_id`             |
| `user_id`    | FK → `User` | Scoped to owner                              |
| `title`      | TEXT        | Auto from first user message; editable later |
| `created_at` | TIMESTAMPTZ |                                              |
| `updated_at` | TIMESTAMPTZ | Bump on each new message                     |

Indexes: `(user_id, updated_at DESC)` for sidebar list.

### `ChatMessage`

| Column       | Type               | Notes                                          |
| ------------ | ------------------ | ---------------------------------------------- |
| `id`         | UUID PK            |                                                |
| `session_id` | FK → `ChatSession` | CASCADE delete                                 |
| `role`       | ENUM               | `user` \| `assistant` \| `system` \| `tool`    |
| `content`    | TEXT               | Plain text (tool summaries for assistant)      |
| `tool_calls` | JSONB nullable     | `[{ name, result }]` when assistant used tools |
| `created_at` | TIMESTAMPTZ        |                                                |

Indexes: `(session_id, created_at ASC)` for history load.

### `AgentMemory`

One row per user (or JSONB column on `User` — pick one table for clarity).

| Column       | Type                | Notes           |
| ------------ | ------------------- | --------------- |
| `user_id`    | FK → `User` @unique |                 |
| `data`       | JSONB               | See shape below |
| `updated_at` | TIMESTAMPTZ         |                 |

```typescript
// MVP memory shape — small, not full chat archive
type AgentMemoryData = {
  preferences: {
    default_chain_id?: string;
    // future: tone, currency display, etc.
  };
  facts: Array<{
    key: string;
    value: string;
    updated_at: string; // ISO
  }>;
};
```

**Not stored in memory MVP:** full transcripts, cross-session summaries, credentials (separate vault feature later).

---

## API contract

All routes require `privy-token` cookie. Never accept `user_id` or wallet in body.

### Sessions

**`GET /api/v1/chat/sessions`**

```json
{
  "success": true,
  "data": {
    "sessions": [
      {
        "id": "uuid",
        "title": "Japan trip savings",
        "updated_at": "2026-06-12T…",
        "preview": "What's my SUI balance?"
      }
    ]
  }
}
```

**`POST /api/v1/chat/sessions`**

```json
// Request: {} or { "title": "optional" }
// Response: { "id", "title", "created_at" }
```

**`GET /api/v1/chat/sessions/:sessionId/messages`**

```json
{
  "success": true,
  "data": {
    "session": { "id", "title", "updated_at" },
    "messages": [
      { "id", "role", "content", "tool_calls", "created_at" }
    ]
  }
}
```

404 if session not owned by current user.

### Send message (extend existing)

**`POST /api/v1/chat`**

```json
// Request
{
  "message": "What's my balance?",
  "session_id": "uuid",           // required once sessions exist; create session if omitted?
  "approve_transaction_id": "uuid" // optional — existing approval flow
}

// Response
{
  "reply": "…",
  "session_id": "uuid",
  "mode": "openai" | "stub",
  "tool_calls": [ … ],
  "pending_transaction": null,
  "message_id": "uuid"            // new: id of persisted assistant message
}
```

**Orchestrator steps:**

1. Resolve `User` from `privyUserId`
2. Get or create `ChatSession` (verify ownership)
3. Insert user `ChatMessage`
4. Load session messages + `AgentMemory`
5. `AgentRuntime.runTurn(…)`
6. Insert assistant `ChatMessage` (+ `tool_calls` JSON)
7. Apply `update_memory` tool side effects if any
8. Update session `title` (if first message) and `updated_at`
9. Return response

---

## OpenAI implementation (MVP AI)

Radiant’s agent brain for chat + memory is **OpenAI**. Replace the current Claude-first path in `chat.service.ts` / `claude-agent.ts` with an OpenAI runtime behind a small adapter.

### Dependency

```bash
cd backend && npm install openai
```

Use the official [`openai`](https://www.npmjs.com/package/openai) Node SDK (not raw `fetch`), typed client, server-side only.

### Environment

Add to `backend/.env.example` and `backend/src/config/agent.ts`:

```bash
# --- Agent (OpenAI) ---
AGENT_PROVIDER=openai          # openai | stub
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini       # default; gpt-4o for higher quality
OPENAI_MAX_TOOL_STEPS=6        # tool-call loop cap per user message
```

| Variable                | Purpose                                           |
| ----------------------- | ------------------------------------------------- |
| `AGENT_PROVIDER`        | `openai` when key present; force `stub` for tests |
| `OPENAI_API_KEY`        | Server-only; never `NEXT_PUBLIC_*`                |
| `OPENAI_MODEL`          | Chat model with **tools** support                 |
| `OPENAI_MAX_TOOL_STEPS` | Prevent infinite tool loops                       |

**Remove from default path:** `ANTHROPIC_API_KEY` / `claude-agent.ts` selection in `chat.service.ts`. Keep file until OpenAI runtime is verified, then delete or move to `runtimes/_legacy/`.

### API surface

**Endpoint:** `POST https://api.openai.com/v1/chat/completions`

**Request shape (per turn):**

```typescript
{
  model: OPENAI_MODEL,
  messages: [
    { role: "system", content: buildSystemPrompt({ memoryBlock, chainRules }) },
    // … session history from ChatMessage rows (user + assistant only)
    { role: "user", content: "latest user message" },  // already persisted before call
  ],
  tools: toOpenAiTools(agentToolDefinitions),  // query_chain, execute_transaction, update_memory
  tool_choice: "auto",
  max_tokens: 1024,
}
```

**Do not** send wallet addresses in messages — tools resolve wallet from `privyUserId` (existing behavior).

### Tool schema mapping

Existing tools use a shared JSON-schema shape in `execute-transaction.tool.ts`, `query-chain.tool.ts`, etc. Add converter:

`backend/src/services/agent/runtime/openai-tools.ts`

```typescript
// agentToolDefinitions → OpenAI tools[] format
{ type: "function", function: { name, description, parameters } }
```

Register for MVP:

| Tool                  | OpenAI `function.name` | Handler                        |
| --------------------- | ---------------------- | ------------------------------ |
| `query_chain`         | `query_chain`          | `runAgentTool` (existing)      |
| `execute_transaction` | `execute_transaction`  | `runAgentTool` + approval gate |
| `update_memory`       | `update_memory`        | `agent-memory.service` merge   |

### Tool-call loop (`openai.runtime.ts`)

Mirror the loop in `claude-agent.ts` (max steps), adapted to OpenAI message format:

```text
1. Call chat.completions with messages + tools
2. If assistant message has tool_calls:
   a. For each tool_call: runAgentTool(privyUserId, name, JSON.parse(arguments))
   b. Append assistant message (with tool_calls) to working messages
   c. Append role: "tool" messages with tool_call_id + JSON result string
   d. If execute_transaction → approval_required, set pending_transaction; stop or continue per product rules
   e. Repeat from step 1 (until no tool_calls or MAX_TOOL_STEPS)
3. Extract final assistant text → reply
4. Return { reply, tool_calls, pending_transaction, mode: "openai" }
```

**Tool result content:** Short JSON string (balance summary, tx digest, memory ack) — same helpers as `summarizeToolResult` in `claude-agent.ts`.

### Session history → OpenAI messages

Orchestrator loads `ChatMessage` rows for `session_id` (oldest first, capped):

| DB `role`   | OpenAI `role`   | Notes                                                                                  |
| ----------- | --------------- | -------------------------------------------------------------------------------------- |
| `user`      | `user`          | `content` as-is                                                                        |
| `assistant` | `assistant`     | `content` as-is; omit re-sending old `tool_calls` in MVP (text-only history is enough) |
| `system`    | skip            | System prompt rebuilt each turn                                                        |
| `tool`      | skip in history | Tool results folded into assistant `content` at persist time if needed                 |

**MVP simplification:** Persist assistant **final text** after tool loop completes; store `tool_calls` JSON on the row for UI receipts only. OpenAI context = system + user/assistant text pairs.

### Adapter interface

Location: `backend/src/services/agent/runtime/types.ts`

```typescript
type AgentRuntimeId = "openai" | "stub";

interface AgentRuntime {
  readonly id: AgentRuntimeId;
  runTurn(input: AgentTurnInput): Promise<AgentTurnResult>;
}
```

Factory: `getAgentRuntime()` in `runtime/index.ts`

```typescript
// openai when AGENT_PROVIDER=openai && OPENAI_API_KEY
// stub when AGENT_PROVIDER=stub || !OPENAI_API_KEY
```

### System prompt (`runtime/prompts.ts`)

Built once per turn, passed as OpenAI `system` message:

- Radiant identity — personal onchain agent
- Wallet resolved from session — never ask for agent wallet address
- Default chain + auto-approve thresholds (`approvalThresholdLabel`)
- **Memory block** — formatted `AgentMemory.data`
- Tool usage: `query_chain` for balances; `execute_transaction` for transfers; `update_memory` for stable prefs/facts only
- **No cross-session knowledge** — only this thread’s messages + memory JSON

### Response contract

Update `ChatResponse.mode`:

```typescript
mode: "openai" | "stub"; // replace "claude"
```

Client `chat-api.ts` types updated accordingly.

### Errors

| OpenAI / network   | Map to                    |
| ------------------ | ------------------------- |
| 401 / invalid key  | `502` `OPENAI_AUTH_ERROR` |
| 429                | `503` `OPENAI_RATE_LIMIT` |
| 5xx                | `502` `OPENAI_ERROR`      |
| Tool loop exceeded | `500` `AGENT_TOOL_LOOP`   |

On OpenAI failure in production: optional fallback to stub with logged warning (config flag `AGENT_FALLBACK_STUB=true`) — default **off** so misconfig is visible.

### Files to add / change

| Action    | Path                                                                           |
| --------- | ------------------------------------------------------------------------------ |
| Add       | `src/config/agent.ts` — `getOpenAiConfig()`, `getAgentProvider()`              |
| Add       | `src/services/agent/runtime/types.ts`                                          |
| Add       | `src/services/agent/runtime/prompts.ts`                                        |
| Add       | `src/services/agent/runtime/openai-tools.ts`                                   |
| Add       | `src/services/agent/runtime/openai.runtime.ts`                                 |
| Add       | `src/services/agent/runtime/stub.runtime.ts`                                   |
| Add       | `src/services/agent/runtime/index.ts`                                          |
| Change    | `src/services/agent/chat-orchestrator.ts` — call `getAgentRuntime().runTurn()` |
| Change    | `src/services/agent/chat.service.ts` — orchestrator only; drop Claude branch   |
| Change    | `src/services/agent/agent.types.ts` — `mode: "openai" \| "stub"`               |
| Deprecate | `src/services/agent/claude-agent.ts` — remove after OpenAI path ships          |
| Change    | `backend/.env.example` — OpenAI vars; comment Anthropic as legacy              |

### OpenAI implementation checklist

| Status | Task                                                                    | Owner     |
| ------ | ----------------------------------------------------------------------- | --------- |
| [x]    | `npm install openai`                                                    | [Backend] |
| [x]    | `getOpenAiConfig()` + env validation                                    | [Backend] |
| [x]    | `toOpenAiTools()` from existing tool definitions                        | [Backend] |
| [x]    | `openai.runtime.ts` — client, completions, tool loop                    | [Backend] |
| [x]    | `prompts.ts` — system prompt + memory block                             | [Backend] |
| [x]    | `getAgentRuntime()` factory (openai vs stub)                            | [Backend] |
| [x]    | Wire orchestrator; remove Claude default from `chat.service.ts`         | [Backend] |
| [x]    | `ChatResponse.mode` + client types → `openai` \| `stub`                 | [Both]    |
| [x]    | Unit test: tool schema converter                                        | [Backend] |
| [x]    | Integration test: mock OpenAI or stub-only CI; manual OpenAI smoke test | [Backend] |
| [x]    | Delete or archive `claude-agent.ts`                                     | [Backend] |

### Tools (MVP)

| Tool                  | Status  | Notes                            |
| --------------------- | ------- | -------------------------------- |
| `query_chain`         | Exists  | Exposed to OpenAI                |
| `execute_transaction` | Exists  | + approval gate                  |
| `update_memory`       | **New** | OpenAI function + memory service |

**Not in MVP:** `search_conversations`, `manage_credentials`, `deploy_app`, …

---

## Client work

### Routes

| Path                           | Purpose                                            |
| ------------------------------ | -------------------------------------------------- |
| `/app`                         | Redirect to latest session or empty new-chat state |
| `/app/chat/[sessionId]`        | Active thread (recommended)                        |
| Or query `?session=` on `/app` | Simpler MVP if dynamic route deferred              |

### Components / lib

| Task             | File                                                                  |
| ---------------- | --------------------------------------------------------------------- |
| Session list API | `lib/chat-api.ts` — `fetchSessions`, `createSession`, `fetchMessages` |
| Session hook     | `hooks/useChatSession.ts` — load messages, send, optimistic UI        |
| Sidebar          | Replace mock `CHATS` from `app-data.ts` with real sessions            |
| Chat page        | Remove seed `MESSAGES`; load from API; title from session             |
| Receipts         | Map `tool_calls` → existing receipt UI (balance, tx sent)             |
| New chat         | Sidebar “New chat” → `POST /sessions` → navigate                      |

### UX details

- Loading skeleton while fetching messages
- Empty state: “Start a conversation with your agent”
- On send failure: show error bubble, don’t drop user message
- `session_id` in React state + URL so refresh restores thread
- Approval modal unchanged (`approve_transaction_id`)

---

## Backend tasks

### Phase A — Schema & conversation layer

| Status | Task                                                                                 | Owner     |
| ------ | ------------------------------------------------------------------------------------ | --------- |
| [x]    | Prisma: `ChatSession`, `ChatMessage` models + migration                              | [Backend] |
| [x]    | `services/conversation/session.repository.ts` — CRUD, list by user, ownership checks | [Backend] |
| [x]    | `services/conversation/message.repository.ts` — append, list by session              | [Backend] |
| [x]    | `GET/POST /api/v1/chat/sessions`                                                     | [Backend] |
| [x]    | `GET /api/v1/chat/sessions/:id/messages`                                             | [Backend] |
| [x]    | Tests: cannot read another user's session (401/404)                                  | [Backend] |

### Phase B — Orchestrator & persistence

| Status | Task                                                                    | Owner     |
| ------ | ----------------------------------------------------------------------- | --------- |
| [x]    | `services/agent/chat-orchestrator.ts` — load thread → runtime → persist | [Backend] |
| [x]    | Refactor `handleChatMessage` to use orchestrator (keep approval path)   | [Backend] |
| [x]    | Auto-title session from first user message (truncate ~60 chars)         | [Backend] |
| [x]    | Context window cap (max messages or chars per turn)                     | [Backend] |
| [x]    | Integration test: two messages in session → second turn includes first  | [Backend] |

### Phase C — Agent runtime (OpenAI)

| Status | Task                                                                          | Owner     |
| ------ | ----------------------------------------------------------------------------- | --------- |
| [x]    | `AgentRuntime` interface + `getAgentRuntime()` factory                        | [Backend] |
| [x]    | `openai.runtime.ts` — Chat Completions + function calling + tool loop         | [Backend] |
| [x]    | `stub.runtime.ts` — wrap existing `stub-agent.ts` logic                       | [Backend] |
| [x]    | `AGENT_PROVIDER` + `OPENAI_*` in `config/agent.ts` and `.env.example`         | [Backend] |
| [x]    | `ChatResponse.mode`: `openai` \| `stub` (deprecate `claude` as default)       | [Backend] |
| [x]    | Delete `claude-agent.ts` (optional Claude runtime not kept)                   | [Backend] |

### Phase D — User memory (lightweight)

| Status | Task                                                                   | Owner     |
| ------ | ---------------------------------------------------------------------- | --------- |
| [ ]    | Prisma: `AgentMemory` table (or `User.agent_memory` JSONB) + migration | [Backend] |
| [ ]    | `services/memory/agent-memory.service.ts` — load, merge, default empty | [Backend] |
| [ ]    | `update_memory` tool + wire in `tools.ts`                              | [Backend] |
| [ ]    | Inject memory block into system prompt in orchestrator                 | [Backend] |
| [ ]    | Unit test: `update_memory` merges facts without wiping thread          | [Backend] |

### Phase E — Docs & cleanup

| Status | Task                                                           | Owner     |
| ------ | -------------------------------------------------------------- | --------- |
| [ ]    | Update `backend/api-ref.md` with session + message endpoints   | [Backend] |
| [ ]    | Update `client/AGENTS.md` — chat session flow, no mock `CHATS` | [Client]  |
| [ ]    | Remove or gate mock `CHATS` / `MESSAGES` in `app-data.ts`      | [Client]  |

---

## Client tasks

| Status | Task                                               | Owner    |
| ------ | -------------------------------------------------- | -------- |
| [ ]    | Extend `chat-api.ts` types for sessions/messages   | [Client] |
| [ ]    | Sidebar: real session list + “New chat”            | [Client] |
| [ ]    | Chat page: load history on mount; no seed messages | [Client] |
| [ ]    | URL ↔ `session_id` sync                            | [Client] |
| [ ]    | Display `mode` / errors; tool receipts from API    | [Client] |
| [ ]    | Empty + loading states                             | [Client] |

---

## Memory vs session context (cheat sheet)

```text
┌─────────────────────────────────────────────────────────┐
│  CURRENT SESSION (ChatMessage rows)                      │
│  • Full back-and-forth in this thread only               │
│  • Reloaded when user returns to this chat               │
│  • Sent to OpenAI as messages[]                          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  USER MEMORY (AgentMemory JSON)                          │
│  • Small stable facts & preferences                      │
│  • Same across all sessions                              │
│  • System prompt only — not a transcript                 │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  OTHER SESSIONS                                          │
│  • Not loaded into context in MVP                        │
│  • User must open that chat to continue that thread      │
└─────────────────────────────────────────────────────────┘
```

---

## Exit criteria (MVP done)

1. User can create multiple chats; each appears in the sidebar with a real title.
2. Leaving and returning to a chat shows **full** prior messages; new messages continue with correct context (agent “remembers” the **session**).
3. New chat has **no** messages from other sessions.
4. OpenAI answers with tools when `AGENT_PROVIDER=openai`; stub works without API key.
5. `update_memory` can store at least one fact and it appears in the next turn’s behavior (via system prompt).
6. No cross-session retrieval code shipped.

---

## Future (post-MVP) — do not build now

| Feature                            | Notes                                    |
| ---------------------------------- | ---------------------------------------- |
| Cross-conversation RAG             | `search_conversations` tool + embeddings |
| Session auto-summaries             | For long threads or future RAG           |
| Walrus encrypted memory            | Swap `AgentMemory` storage adapter       |
| Streaming                          | `POST /chat` SSE or WebSocket            |
| Other LLM providers (Claude, etc.) | New `AgentRuntime` impl behind factory   |
| Thread search UI                   | Reuse indexer from RAG phase             |

---

## References

- Existing chat route: `backend/src/api/routes/v1/chat/chat.ts`
- Orchestration (to refactor): `backend/src/services/agent/chat.service.ts`
- Agent runtime: `backend/src/services/agent/runtime/`
- OpenAI docs: https://platform.openai.com/docs/guides/function-calling
- Tools: `backend/src/services/agent/tools.ts`
- Client chat UI: `client/src/app/app/page.tsx`
- Mock data to remove: `client/src/lib/app-data.ts` (`CHATS`, `MESSAGES`)
- Product vision (Walrus, full tools): `README.md` § Agent Memory
