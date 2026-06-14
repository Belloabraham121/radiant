import type { AppActionName, AppActionParamField } from "./app-action.types.js";

export const PROJECT_ACTION_SCHEMA_VERSION = 1 as const;

export type ProjectActionSchemaProtocol = "deepbook" | "custom";

/** Persisted per-project action schema (Phase 6). */
export type ProjectActionSchema = {
  schema_version: typeof PROJECT_ACTION_SCHEMA_VERSION;
  app_id: string;
  protocol: ProjectActionSchemaProtocol;
  actions: ProjectActionSchemaAction[];
};

export type ProjectActionSchemaAction = {
  name: AppActionName;
  description: string;
  params: AppActionParamField[];
};

/** GET .../actions response — schema plus registry metadata for clients and agents. */
export type ProjectActionsCatalogResponse = {
  schema_version: typeof PROJECT_ACTION_SCHEMA_VERSION;
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
};
