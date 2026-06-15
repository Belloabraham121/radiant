import { z } from "zod";
import {
  APP_ACTION_NAMES,
  type AppActionName,
  type AppActionParamField,
} from "./app-action.types.js";
import {
  getAppActionDefinition,
  getAppActionParamSchemaDoc,
} from "./app-action-registry.js";
import {
  PROJECT_ACTION_SCHEMA_VERSION,
  type ProjectActionSchema,
  type ProjectActionSchemaAction,
  type ProjectActionsCatalogEntry,
  type ProjectActionsCatalogResponse,
} from "./app-action-schema.types.js";

/** Minimal project fields needed to resolve an action schema (avoids tight Prisma coupling). */
export type ProjectActionSchemaSource = {
  id: string;
  template: string;
  action_schema?: unknown | null;
};

type ArtifactFileInput = { path: string; content: string };

const appActionParamFieldSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["string", "number", "boolean", "array", "object"]),
  required: z.boolean().optional(),
  description: z.string().optional(),
});

const projectActionSchemaActionSchema = z.object({
  name: z.enum(APP_ACTION_NAMES),
  description: z.string().min(1),
  params: z.array(appActionParamFieldSchema),
});

export const projectActionSchemaSchema = z.object({
  schema_version: z.literal(PROJECT_ACTION_SCHEMA_VERSION),
  app_id: z.string().uuid(),
  protocol: z.enum(["deepbook", "polymarket", "custom"]),
  actions: z.array(projectActionSchemaActionSchema),
});

const DEFAULT_SWAP_TEMPLATE_ACTIONS: AppActionName[] = [
  "swap",
  "flash_loan",
  "stake",
  "unstake",
  "deposit",
  "withdraw",
  "submit_proposal",
  "vote",
];

const EXECUTE_HELPER_PATTERNS: Array<{ pattern: RegExp; action: AppActionName }> = [
  { pattern: /\bexecuteSwap\b/, action: "swap" },
  { pattern: /\bexecuteFlashLoan\b/, action: "flash_loan" },
  { pattern: /\bexecuteStake\b/, action: "stake" },
  { pattern: /\bexecuteUnstake\b/, action: "unstake" },
  { pattern: /\bexecuteAction\s*\(\s*["']deposit["']/, action: "deposit" },
  { pattern: /\bexecuteAction\s*\(\s*["']withdraw["']/, action: "withdraw" },
  { pattern: /\bexecuteAction\s*\(\s*["']flash_loan["']/, action: "flash_loan" },
  { pattern: /\bexecuteAction\s*\(\s*["']stake["']/, action: "stake" },
  { pattern: /\bexecuteAction\s*\(\s*["']unstake["']/, action: "unstake" },
  { pattern: /\bexecuteAction\s*\(\s*["']swap["']/, action: "swap" },
];

function paramDocToFields(name: AppActionName): AppActionParamField[] {
  return getAppActionParamSchemaDoc(name).fields.map((field) => ({
    name: field.name,
    type: field.type as AppActionParamField["type"],
    ...(field.required !== undefined ? { required: field.required } : {}),
    ...(field.description ? { description: field.description } : {}),
  }));
}

function buildActionEntry(name: AppActionName): ProjectActionSchemaAction {
  const definition = getAppActionDefinition(name);
  return {
    name,
    description: definition.description,
    params: paramDocToFields(name),
  };
}

/** Default DeepBook action schema for generated DeFi apps. */
export function buildDefaultDeepBookActionSchema(
  projectId: string,
  actionNames: readonly AppActionName[] = DEFAULT_SWAP_TEMPLATE_ACTIONS,
): ProjectActionSchema {
  const uniqueNames = [...new Set(actionNames)];
  return {
    schema_version: PROJECT_ACTION_SCHEMA_VERSION,
    app_id: projectId,
    protocol: "deepbook",
    actions: uniqueNames.map((name) => buildActionEntry(name)),
  };
}

function emptyCustomSchema(projectId: string): ProjectActionSchema {
  return {
    schema_version: PROJECT_ACTION_SCHEMA_VERSION,
    app_id: projectId,
    protocol: "custom",
    actions: [],
  };
}

function concatArtifactSource(files: ArtifactFileInput[]): string {
  return files.map((file) => `${file.path}\n${file.content}`).join("\n");
}

/** Heuristic: generated app exposes DeFi actions via radiant-client helpers or swap UI. */
export function detectDefiActionNamesFromArtifact(
  files: ArtifactFileInput[],
  _template?: string,
): AppActionName[] {
  const source = concatArtifactSource(files);
  const detected = new Set<AppActionName>();

  if (/from\s+["']@?\/?.*radiant-client["']/.test(source) || /lib\/radiant-client/.test(source)) {
    detected.add("swap");
  }

  for (const { pattern, action } of EXECUTE_HELPER_PATTERNS) {
    if (pattern.test(source)) {
      detected.add(action);
    }
  }

  if (/SwapForm|DexApp|FlashLoan|executeSwap|executeFlashLoan|executeStake|executeUnstake/.test(source)) {
    detected.add("swap");
  }

  if (/DexApp|executeFlashLoan|flashLoanQuote/.test(source)) {
    detected.add("flash_loan");
  }

  return [...detected];
}

export function shouldPersistDefiActionSchema(input: {
  template?: string;
  files: ArtifactFileInput[];
}): boolean {
  return detectDefiActionNamesFromArtifact(input.files, input.template).length > 0;
}

/** Build schema to persist on generate_app when DeFi UI is detected. Returns null for non-DeFi apps. */
export function inferProjectActionSchemaForArtifact(
  projectId: string,
  input: { template?: string; files: ArtifactFileInput[] },
): ProjectActionSchema | null {
  if (!shouldPersistDefiActionSchema(input)) {
    return null;
  }

  const actionNames = detectDefiActionNamesFromArtifact(input.files, input.template);

  if (actionNames.length === 0) {
    return null;
  }

  return buildDefaultDeepBookActionSchema(projectId, actionNames);
}

export function parseStoredProjectActionSchema(value: unknown): ProjectActionSchema | null {
  const parsed = projectActionSchemaSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function resolveStoredOrInferredSchema(project: ProjectActionSchemaSource): ProjectActionSchema {
  const stored = parseStoredProjectActionSchema(project.action_schema);
  if (stored) {
    return stored;
  }

  if (project.template === "swap") {
    return buildDefaultDeepBookActionSchema(project.id, DEFAULT_SWAP_TEMPLATE_ACTIONS);
  }

  return emptyCustomSchema(project.id);
}

function enrichCatalogEntry(action: ProjectActionSchemaAction): ProjectActionsCatalogEntry {
  const definition = getAppActionDefinition(action.name);
  return {
    name: action.name,
    description: action.description,
    protocol: definition.protocol,
    default_chain_id: definition.default_chain_id,
    category: definition.category,
    execute_action: definition.execute_action,
    params: action.params,
  };
}

/** Response for GET .../projects/:id/actions and query_chain project_actions. */
export function buildProjectActionsCatalogResponse(
  project: ProjectActionSchemaSource,
): ProjectActionsCatalogResponse {
  const schema = resolveStoredOrInferredSchema(project);
  return {
    schema_version: schema.schema_version,
    app_id: schema.app_id,
    protocol: schema.protocol,
    actions: schema.actions.map((action) => enrichCatalogEntry(action)),
  };
}
