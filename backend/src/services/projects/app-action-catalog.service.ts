import type { Project } from "@prisma/client";
import { buildProjectActionsCatalogResponse } from "./app-action-schema.service.js";

/** Per-project action schema for GET .../actions (Phase 6). */
export function listAppActionsCatalogForProject(project: Project) {
  return buildProjectActionsCatalogResponse(project);
}
