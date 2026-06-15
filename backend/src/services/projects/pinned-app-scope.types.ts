import { z } from "zod";

export const pinnedAppScopeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("project"),
    project_id: z.string().uuid(),
    name: z.string().min(1).max(120),
    source: z.enum(["saved", "deployed", "chat"]).optional(),
  }),
  z.object({
    kind: z.literal("installation"),
    installation_id: z.string().uuid(),
    name: z.string().min(1).max(120),
  }),
  z.object({
    kind: z.literal("session_draft"),
    name: z.string().min(1).max(120),
  }),
]);

export type PinnedAppScope = z.infer<typeof pinnedAppScopeSchema>;

const PINNED_EXECUTE_IN_APP =
  "Execute through this app's UI in the artifact preview — the app runs its own flow (quotes, forms, confirm modal). " +
  "Do not use execute_transaction. Do not describe filling forms; the user asked you to act in the app. ";

const PINNED_ACTION_FLOW =
  "1) Call query_chain session_actions (chat draft) or project_actions for this pinned app to learn available actions and param names. " +
  "2) Call call_app_action with the matching action and params — execution is delegated to the preview iframe. " +
  "Skip list_session_projects; scope is already set. ";

export function formatPinnedAppScopeForPrompt(scope: PinnedAppScope): string {
  if (scope.kind === "installation") {
    return (
      `User pinned app: "${scope.name}" (installation_id: ${scope.installation_id}). ` +
      PINNED_EXECUTE_IN_APP +
      PINNED_ACTION_FLOW +
      `Use call_app_action with installation_id "${scope.installation_id}".`
    );
  }

  if (scope.kind === "session_draft") {
    return (
      `User pinned app: "${scope.name}" (chat draft in this session). ` +
      PINNED_EXECUTE_IN_APP +
      PINNED_ACTION_FLOW +
      `Use call_app_action with use_session_draft: true and app_name "${scope.name}".`
    );
  }

  return (
    `User pinned app: "${scope.name}" (project_id: ${scope.project_id}). ` +
    PINNED_EXECUTE_IN_APP +
    PINNED_ACTION_FLOW +
    `Use call_app_action with project_id "${scope.project_id}".`
  );
}

export type CallAppActionScopeFields = {
  project_id?: string;
  installation_id?: string;
  app_name?: string;
  use_session_draft?: boolean;
};

export function hasCallAppActionScope(fields: CallAppActionScopeFields): boolean {
  return Boolean(
    fields.project_id ||
      fields.installation_id ||
      fields.app_name?.trim() ||
      fields.use_session_draft,
  );
}

/** Apply chat-pinned app scope when the agent omits call_app_action scope fields. */
export function mergePinnedAppScopeIntoCallAppAction<T extends CallAppActionScopeFields>(
  input: T,
  pinned?: PinnedAppScope | null,
): T {
  if (!pinned || hasCallAppActionScope(input)) {
    return input;
  }

  if (pinned.kind === "installation") {
    return { ...input, installation_id: pinned.installation_id };
  }

  if (pinned.kind === "session_draft") {
    return {
      ...input,
      use_session_draft: true,
      app_name: pinned.name,
    };
  }

  return { ...input, project_id: pinned.project_id };
}

export function scopeDisplayName(scope: PinnedAppScope): string {
  return scope.name;
}
