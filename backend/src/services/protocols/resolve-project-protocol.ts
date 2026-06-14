import { getAppActionDefinition } from "../projects/app-action-registry.js";
import {
  parseStoredProjectActionSchema,
  type ProjectActionSchemaSource,
} from "../projects/app-action-schema.service.js";
import type { AppActionName } from "../projects/app-action.types.js";
import type { AppProtocolId } from "./app-protocol-adapter.types.js";

function schemaProtocolFromProject(project: ProjectActionSchemaSource): AppProtocolId | null {
  const stored = parseStoredProjectActionSchema(project.action_schema);
  if (stored?.protocol === "deepbook") {
    return "deepbook";
  }
  if (stored?.protocol === "polymarket") {
    return "polymarket";
  }
  if (stored?.protocol === "custom") {
    return "custom";
  }

  if (project.template === "swap") {
    return "deepbook";
  }

  return null;
}

/**
 * Resolve which protocol adapter should execute an app action.
 * Project schema protocol wins when set; otherwise infer from action registry metadata.
 */
export function resolveAppProtocolId(
  action: AppActionName,
  project?: ProjectActionSchemaSource | null,
): AppProtocolId {
  const fromProject = project ? schemaProtocolFromProject(project) : null;
  if (fromProject === "polymarket") {
    return "polymarket";
  }

  const actionProtocol = getAppActionDefinition(action).protocol;
  if (actionProtocol === "deepbook") {
    return "deepbook";
  }

  if (fromProject === "deepbook") {
    return "deepbook";
  }

  return "custom";
}
