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
import {
  buildArtifactBuildLines,
  buildArtifactBuildSwapVsBuildLine,
} from "./artifacts/build.js";
import { buildArtifactEditLines } from "./artifacts/edit.js";
import { buildArtifactDefiUiLines } from "./artifacts/defi-ui.js";
import { buildDeepBookEnvLines } from "./protocols/deepbook/env.js";
import { buildDeepBookBalanceLines } from "./protocols/deepbook/balance.js";
import {
  buildDeepBookSwapExecuteLines,
  buildDeepBookSwapLinesBeforeWorkflow,
} from "./protocols/deepbook/swap.js";
import { buildDeepBookOrdersLines } from "./protocols/deepbook/orders.js";
import { buildDeepBookFlashLoanLines } from "./protocols/deepbook/flash-loan.js";
import { buildDeepBookStakeLines } from "./protocols/deepbook/stake.js";
import { buildDeepBookGovernanceLines } from "./protocols/deepbook/governance.js";
import { buildDeepBookMarginLines } from "./protocols/deepbook/margin.js";
import { buildDeepBookPredictLines } from "./protocols/deepbook/predict.js";
import { buildPlatformBrowsingLines } from "./platform/browsing.js";
import { buildPlatformStorageLines } from "./platform/storage.js";
import { buildPlatformNotificationsLines } from "./platform/notifications.js";
import { buildPlatformExplorerLines } from "./platform/explorer.js";
import type { PromptBuildContext, PromptModule, PromptModuleId } from "./types.js";

export const CORE_MODULE_IDS: PromptModuleId[] = [
  "core:personality",
  "core:tool-routing",
  "core:tool-routing:overview",
  "core:permissions",
  "core:tool-routing:workflow",
  "core:errors",
  "core:personality:context",
];

export const ALL_PROMPT_MODULES: PromptModule[] = [
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
    id: "core:tool-routing:overview",
    layer: "core",
    order: 35,
    build: () => buildToolRoutingOverviewLines(),
  },
  {
    id: "core:tool-routing:workflow",
    layer: "core",
    order: 50,
    build: () => buildToolRoutingWorkflowLines(),
  },
  {
    id: "core:errors",
    layer: "core",
    order: 900,
    build: () => buildErrorHandlingLines(),
  },
  {
    id: "core:personality:context",
    layer: "core",
    order: 990,
    build: () => buildPersonalityThreadContextLine(),
  },
  {
    id: "protocol:deepbook:env",
    layer: "protocol",
    order: 100,
    build: () => buildDeepBookEnvLines(),
  },
  {
    id: "protocol:deepbook:balance",
    layer: "protocol",
    order: 110,
    build: () => buildDeepBookBalanceLines(),
  },
  {
    id: "protocol:deepbook:swap",
    layer: "protocol",
    order: 120,
    build: () => buildDeepBookSwapLinesBeforeWorkflow(),
  },
  {
    id: "artifact:build:swap-vs-build",
    layer: "artifact",
    order: 130,
    build: () => buildArtifactBuildSwapVsBuildLine(),
  },
  {
    id: "protocol:deepbook:orders",
    layer: "protocol",
    order: 140,
    build: () => buildDeepBookOrdersLines(),
  },
  {
    id: "protocol:deepbook:flash-loan",
    layer: "protocol",
    order: 150,
    build: () => buildDeepBookFlashLoanLines(),
  },
  {
    id: "protocol:deepbook:stake",
    layer: "protocol",
    order: 160,
    build: () => buildDeepBookStakeLines(),
  },
  {
    id: "protocol:deepbook:governance",
    layer: "protocol",
    order: 170,
    build: () => buildDeepBookGovernanceLines(),
  },
  {
    id: "artifact:build",
    layer: "artifact",
    order: 200,
    build: () => buildArtifactBuildLines(),
  },
  {
    id: "artifact:edit",
    layer: "artifact",
    order: 210,
    build: () => buildArtifactEditLines(),
  },
  {
    id: "artifact:defi-ui",
    layer: "artifact",
    order: 220,
    build: () => buildArtifactDefiUiLines(),
  },
  {
    id: "platform:browsing",
    layer: "platform",
    order: 300,
    build: () => buildPlatformBrowsingLines(),
  },
  {
    id: "platform:storage",
    layer: "platform",
    order: 310,
    build: () => buildPlatformStorageLines(),
  },
  {
    id: "platform:notifications",
    layer: "platform",
    order: 320,
    build: () => buildPlatformNotificationsLines(),
  },
  {
    id: "platform:explorer",
    layer: "platform",
    order: 330,
    build: () => buildPlatformExplorerLines(),
  },
  {
    id: "protocol:deepbook:margin",
    layer: "protocol",
    order: 400,
    build: () => buildDeepBookMarginLines(),
  },
  {
    id: "protocol:deepbook:predict",
    layer: "protocol",
    order: 410,
    build: () => buildDeepBookPredictLines(),
  },
];

export const ALL_MODULE_IDS: PromptModuleId[] = ALL_PROMPT_MODULES.map((module) => module.id);

export const PROMPT_MODULES: Record<PromptModuleId, PromptModule> = Object.fromEntries(
  ALL_PROMPT_MODULES.map((module) => [module.id, module]),
) as Record<PromptModuleId, PromptModule>;

type ComposeStep =
  | { kind: "module"; id: PromptModuleId }
  | { kind: "lines"; build: () => string[] };

/** Full-mode line sequence — some modules contribute lines in multiple segments. */
const FULL_MODE_COMPOSE_STEPS: ComposeStep[] = [
  { kind: "module", id: "core:personality" },
  { kind: "module", id: "core:tool-routing" },
  { kind: "module", id: "core:permissions" },
  { kind: "module", id: "core:tool-routing:overview" },
  { kind: "module", id: "protocol:deepbook:env" },
  { kind: "module", id: "protocol:deepbook:balance" },
  { kind: "lines", build: buildDeepBookSwapLinesBeforeWorkflow },
  { kind: "module", id: "artifact:build:swap-vs-build" },
  { kind: "module", id: "core:tool-routing:workflow" },
  { kind: "lines", build: buildDeepBookSwapExecuteLines },
  {
    kind: "lines",
    build: () => buildDeepBookOrdersLines().slice(0, 2),
  },
  { kind: "module", id: "protocol:deepbook:flash-loan" },
  { kind: "module", id: "protocol:deepbook:stake" },
  { kind: "module", id: "protocol:deepbook:governance" },
  { kind: "module", id: "core:errors" },
  {
    kind: "lines",
    build: () => buildArtifactBuildLines().slice(0, 3),
  },
  { kind: "module", id: "artifact:edit" },
  {
    kind: "lines",
    build: () => buildArtifactBuildLines().slice(3, 7),
  },
  { kind: "module", id: "artifact:defi-ui" },
  { kind: "module", id: "platform:browsing" },
  { kind: "module", id: "platform:storage" },
  { kind: "module", id: "platform:notifications" },
  {
    kind: "lines",
    build: () => [buildArtifactBuildLines()[7]],
  },
  { kind: "module", id: "platform:explorer" },
  {
    kind: "lines",
    build: () => [buildDeepBookOrdersLines()[2]],
  },
  { kind: "module", id: "protocol:deepbook:margin" },
  { kind: "module", id: "protocol:deepbook:predict" },
  { kind: "module", id: "core:personality:context" },
];

/** Builds all prompt lines in full mode (Phase 2 — registry-only composition). */
export function buildFullModePromptLines(ctx: PromptBuildContext): string[] {
  return FULL_MODE_COMPOSE_STEPS.flatMap((step) => {
    if (step.kind === "lines") {
      return step.build();
    }
    return PROMPT_MODULES[step.id].build(ctx);
  });
}

/** @deprecated Use buildFullModePromptLines — kept for unit tests. */
export function buildCoreModuleLines(ctx: PromptBuildContext): string[] {
  return [
    ...buildPersonalityIntroLines(),
    ...buildDefaultChainLine(ctx),
    ...buildPermissionLines(ctx),
  ];
}

export function buildToolRoutingOverviewModuleLines(): string[] {
  return buildToolRoutingOverviewLines();
}

export function buildCoreErrorsModuleLines(): string[] {
  return buildErrorHandlingLines();
}

export function buildPersonalityThreadContextLines(): string[] {
  return buildPersonalityThreadContextLine();
}

export function buildToolRoutingWorkflowInterleavedLines(): string[] {
  return buildToolRoutingWorkflowLines();
}
