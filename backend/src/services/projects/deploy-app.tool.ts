import { AppError } from "../../errors/app-error.js";
import { publishProjectForUser } from "../apps/app-installation.service.js";
import type { AppCategory } from "../apps/app-catalog.types.js";
import { saveSessionDraftToProjectForUser } from "./generate-app.service.js";
import {
  isUuid,
  resolveAppScope,
  type ResolvedAppScope,
} from "./app-scope-resolver.service.js";
import type { PinnedAppScope } from "./pinned-app-scope.types.js";

export const DEPLOY_APP_TOOL_NAME = "deploy_app" as const;

const DEPLOY_CATEGORIES = new Set<string>([
  "swap",
  "payments",
  "automation",
  "savings",
  "markets",
  "escrow",
  "alerts",
  "offramp",
  "staking",
  "portfolio",
]);

export const deployAppToolDefinition = {
  name: DEPLOY_APP_TOOL_NAME,
  description:
    "Deploy an app to the Radiant explorer so other users can discover and install it. " +
    "Saves the chat draft automatically if needed, marks the project live, and lists it publicly. " +
    "This is in-app deployment only — no Walrus, no external URL, no on-chain transaction. " +
    "CRITICAL: When the user asks to deploy, call this tool immediately — never reply that you cannot deploy without calling it. " +
    "For a chat draft: deploy_app {} or { use_session_draft: true }. " +
    "For a named app: { app_name: \"My App\" }. " +
    "For a saved project: { project_id: \"uuid\" } from list_session_projects.",
  input_schema: {
    type: "object" as const,
    properties: {
      project_id: {
        type: "string",
        description: "Saved project UUID from list_session_projects.",
      },
      app_name: {
        type: "string",
        description: "Match a saved project or chat draft by name in this session.",
      },
      use_session_draft: {
        type: "boolean",
        description: "Deploy the open chat artifact draft (auto-saves before publishing).",
      },
      category: {
        type: "string",
        description:
          "Explorer category: swap, payments, automation, savings, markets, escrow, alerts, offramp, staking, portfolio. Defaults to automation.",
      },
      tagline: {
        type: "string",
        description: "Optional explorer listing tagline.",
      },
    },
    additionalProperties: false,
  },
};

type DeployAppInput = {
  project_id?: string;
  app_name?: string;
  use_session_draft?: boolean;
  category?: string;
  tagline?: string;
};

function mergePinnedScopeIntoDeploy(
  input: DeployAppInput,
  pinned?: PinnedAppScope | null,
): DeployAppInput {
  if (!pinned || input.project_id || input.app_name || input.use_session_draft) {
    return input;
  }
  if (pinned.kind === "session_draft") {
    return { ...input, use_session_draft: true, app_name: pinned.name };
  }
  if (pinned.kind === "project") {
    return { ...input, project_id: pinned.project_id };
  }
  return input;
}

function resolveCategory(value?: string): AppCategory {
  const normalized = value?.trim().toLowerCase();
  if (normalized && DEPLOY_CATEGORIES.has(normalized)) {
    return normalized as AppCategory;
  }
  return "automation";
}

async function resolveDeployProjectId(
  privyUserId: string,
  sessionId: string,
  input: DeployAppInput,
): Promise<{ projectId: string; scope: ResolvedAppScope; savedDraft: boolean }> {
  if (input.project_id) {
    return {
      projectId: input.project_id,
      scope: { kind: "project", project_id: input.project_id, name: input.app_name ?? "Project" },
      savedDraft: false,
    };
  }

  const scope = await resolveAppScope(privyUserId, sessionId, {
    app_name: input.app_name,
    use_session_draft: input.use_session_draft ?? (!input.app_name),
  });

  if (scope.kind === "project") {
    return { projectId: scope.project_id, scope, savedDraft: false };
  }

  const saved = await saveSessionDraftToProjectForUser(privyUserId, sessionId, {});
  return {
    projectId: saved.project_id,
    scope: { kind: "project", project_id: saved.project_id, name: saved.name },
    savedDraft: true,
  };
}

export async function runDeployAppTool(
  privyUserId: string,
  input: Record<string, unknown>,
  context: { sessionId?: string; pinnedAppScope?: PinnedAppScope | null } = {},
): Promise<unknown> {
  const merged = mergePinnedScopeIntoDeploy(
    {
      project_id:
        typeof input.project_id === "string" ? input.project_id.trim() : undefined,
      app_name: typeof input.app_name === "string" ? input.app_name.trim() : undefined,
      use_session_draft: input.use_session_draft === true,
      category: typeof input.category === "string" ? input.category.trim() : undefined,
      tagline: typeof input.tagline === "string" ? input.tagline.trim() : undefined,
    },
    context.pinnedAppScope,
  );

  let projectId = merged.project_id ?? "";

  if (projectId && !isUuid(projectId)) {
    throw new AppError(
      400,
      "INVALID_PROJECT_ID",
      "project_id must be a UUID from list_session_projects — never an app name. Use app_name instead.",
    );
  }

  let savedDraft = false;
  let deployedName = merged.app_name;

  if (!projectId) {
    if (!context.sessionId) {
      throw new AppError(
        400,
        "PROJECT_ID_REQUIRED",
        "project_id or an active chat session with a draft is required.",
      );
    }
    const resolved = await resolveDeployProjectId(
      privyUserId,
      context.sessionId,
      merged,
    );
    projectId = resolved.projectId;
    savedDraft = resolved.savedDraft;
    deployedName = resolved.scope.name;
  }

  const published = await publishProjectForUser(privyUserId, projectId, {
    is_public: true,
    category: resolveCategory(merged.category),
    ...(merged.tagline ? { tagline: merged.tagline } : {}),
  });

  return {
    project_id: projectId,
    is_public: published.is_public,
    status: published.status,
    category: published.category,
    saved_draft: savedDraft,
    message: savedDraft
      ? `Saved "${deployedName}" to Projects and published it on the Radiant explorer.`
      : `Published "${deployedName ?? "your app"}" on the Radiant explorer.`,
  };
}
