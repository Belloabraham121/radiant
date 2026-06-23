import {
  buildPersonalityIntroLines,
  buildPersonalityThreadContextLine,
} from "./core/personality.js";
import { buildPermissionLines } from "./core/permissions.js";
import {
  buildDefaultChainLine,
  buildToolRoutingOverviewLines,
  buildToolRoutingWorkflowLines,
} from "./core/tool-routing.js";
import { buildErrorHandlingLines } from "./core/errors.js";
import type { PromptBuildContext, PromptModule, PromptModuleId } from "./types.js";

export const CORE_MODULE_IDS: PromptModuleId[] = [
  "core:personality",
  "core:tool-routing",
  "core:permissions",
  "core:errors",
];

/** Core modules in canonical compose order (Phase 1 — always included in full mode). */
export const CORE_PROMPT_MODULES: PromptModule[] = [
  {
    id: "core:personality",
    layer: "core",
    order: 10,
    build: () => buildPersonalityIntroLines(),
  },
  {
    id: "core:tool-routing",
    layer: "core",
    order: 20,
    build: (ctx) => buildDefaultChainLine(ctx),
  },
  {
    id: "core:permissions",
    layer: "core",
    order: 30,
    build: (ctx) => buildPermissionLines(ctx),
  },
  {
    id: "core:errors",
    layer: "core",
    order: 900,
    build: () => buildErrorHandlingLines(),
  },
];

export function buildToolRoutingOverviewModuleLines(): string[] {
  return buildToolRoutingOverviewLines();
}

export const PROMPT_MODULES: Record<PromptModuleId, PromptModule> = Object.fromEntries(
  CORE_PROMPT_MODULES.map((module) => [module.id, module]),
) as Record<PromptModuleId, PromptModule>;

/** Core lines at the start of the prompt — excludes errors (interleaved after governance in Phase 1). */
export function buildCoreModuleLines(ctx: PromptBuildContext): string[] {
  const sorted = CORE_PROMPT_MODULES.filter((m) => m.id !== "core:errors").sort(
    (a, b) => a.order - b.order,
  );
  return sorted.flatMap((module) => module.build(ctx));
}

export function buildCoreErrorsModuleLines(): string[] {
  return buildErrorHandlingLines();
}

/** Thread context line — composed after legacy protocol content, before extras. */
export function buildPersonalityThreadContextLines(): string[] {
  return buildPersonalityThreadContextLine();
}

/** Tool-routing workflow lines — interleaved in legacy block until Phase 2 split. */
export function buildToolRoutingWorkflowInterleavedLines(): string[] {
  return buildToolRoutingWorkflowLines();
}
