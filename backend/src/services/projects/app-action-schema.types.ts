import type { AppActionName, AppActionParamField } from "./app-action.types.js";

export const PROJECT_ACTION_SCHEMA_VERSION = 2 as const;

export type ProjectActionSchemaProtocol = "deepbook" | "polymarket" | "custom";

/** Persisted per-project action schema (Phase 6 + app-local actions). */
export type ProjectActionSchema = {
  schema_version: 1 | typeof PROJECT_ACTION_SCHEMA_VERSION;
  app_id: string;
  protocol: ProjectActionSchemaProtocol;
  actions: ProjectActionSchemaAction[];
};

export type ProjectActionSchemaAction = {
  name: AppActionName;
  description: string;
  params: AppActionParamField[];
  /** "onchain" routes through tx pipeline; "app_local" delegates to preview. */
  kind?: "onchain" | "app_local";
};

/** GET .../actions response — schema plus registry metadata for clients and agents. */
export type ProjectActionsCatalogResponse = {
  schema_version: 1 | typeof PROJECT_ACTION_SCHEMA_VERSION;
  app_id: string;
  protocol: ProjectActionSchemaProtocol;
  actions: ProjectActionsCatalogEntry[];
};

export type ProjectActionsCatalogEntry = {
  name: AppActionName;
  description: string;
  protocol: string;
  default_chain_id: string;
  category: string;
  execute_action: string;
  params: AppActionParamField[];
  kind?: "onchain" | "app_local";
};
