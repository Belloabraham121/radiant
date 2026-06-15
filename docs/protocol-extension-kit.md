# Protocol extension kit

How to add a new on-chain product (Polymarket, Base DEX, etc.) without rewriting Radiant app actions.

## Architecture

```
POST .../actions/:action
        │
        ▼
 executeAppAction()
        │
        ├── resolveAppProtocolId(action, project.action_schema)
        │
        └── getAppProtocolAdapter(protocol).execute(...)
                    │
                    ├── deepbook  → DeepBookAppAdapter (shipped)
                    ├── custom    → generic execute_transaction wrapper
                    └── polymarket → stub (501 until implemented)
```

**Source of truth for protocol:** `Project.action_schema.protocol` (`deepbook` | `polymarket` | `custom`). Swap-template projects default to `deepbook`.

## Checklist — new protocol

Copy this list for each new integration (e.g. Polymarket on Polygon):

| # | Layer | Task |
| - | ----- | ---- |
| 1 | **Adapter** | Add `backend/src/services/protocols/<name>-app.adapter.ts` implementing `AppProtocolAdapter` |
| 2 | **Registry** | Register in `protocol-adapter-registry.ts` |
| 3 | **Protocol id** | Add to `APP_PROTOCOL_IDS` + `ProjectActionSchemaProtocol` if persisted on projects |
| 4 | **Action names** | Extend `APP_ACTION_NAMES` + `app-action-registry.ts` entries |
| 5 | **Param schemas** | Add Zod schemas in `app-action-param-schemas.ts` |
| 6 | **Mapper** | Map canonical actions → `execute_transaction` or direct chain calls in `app-action-mapper.ts` |
| 7 | **Default schema** | `buildDefault<Protocol>ActionSchema()` in `app-action-schema.service.ts` |
| 8 | **generate_app** | Prompt blurb + artifact detection in `inferProjectActionSchemaForArtifact` |
| 9 | **radiant-client** | Template helpers in `radiant-client-template.ts` |
| 10 | **Agent runtime** | Optional `__radiantAgent.register()` handlers in codegen scaffold |
| 11 | **Agent tools** | `execute_transaction` actions and/or `call_app_action` schema entries |
| 12 | **Tests** | Unit: adapter + mapper; integration: mock sign path |
| 13 | **Docs** | Update `api-ref.md` action table |

## Adapter interface

```typescript
type AppProtocolAdapter = {
  readonly id: AppProtocolId;
  supportedActions(): readonly AppActionName[];
  supportsAction(action: AppActionName): boolean;
  execute(action, params, ctx): Promise<AppActionResult>;
};
```

Reference implementations:

- `deepbook-app.adapter.ts` — production path via `runExecuteTransactionToolWithApproval`
- `polymarket-app.adapter.ts` — stub returning `PROTOCOL_NOT_IMPLEMENTED`

## Polymarket stub

The Polymarket adapter is registered but returns `501 PROTOCOL_NOT_IMPLEMENTED` for all actions. Use it as a template when implementing:

1. CLOB read APIs (quotes, markets)
2. Canonical actions (`place_order`, `cancel_order`, …)
3. EVM signing via existing agent wallet path

Set `action_schema.protocol` to `"polymarket"` on a project to route execution to that adapter (will fail until implemented).

## DeepBook (reference)

DeepBook is fully wired through Phases 1–8:

- Action registry + HTTP routes + `radiant-client` + agent runtime + SSE live mode
- Swap scaffold end-to-end; flash loan / stake / governance scaffolds partial (see agent-app-actions-TODO Phase 10.3)
