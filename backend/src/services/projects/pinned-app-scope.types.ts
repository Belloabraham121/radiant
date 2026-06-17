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
  "The user pinned this app and expects you to act INSIDE it — they will see the app preview open and watch " +
  "you drive the UI in real time (fields filling, buttons clicking, confirmations appearing). " +
  "Do NOT use execute_transaction. Do NOT describe what you will do — just do it via call_app_action. " +
  "The preview handles the visual feedback: field fills with delays, button highlights, then an in-app confirmation modal. ";

const PINNED_ACTION_FLOW =
  "1) Call query_chain session_actions (chat draft) or project_actions for this pinned app to learn available actions and param names. " +
  "2) Call call_app_action with the matching action and params — execution is delegated to the preview iframe which drives the UI step by step. " +
  "3) The user sees the agent filling fields, clicking buttons, and a confirmation modal in the preview — your reply should be brief (e.g. 'Running swap in your app — confirm in the preview.'). " +
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
      `Use call_app_action with use_session_draft: true and app_name "${scope.name}". ` +
      `When the user asks to deploy this app, call deploy_app { use_session_draft: true } — it auto-saves the draft and publishes on the Radiant explorer. Never refuse deploy without calling deploy_app.`
    );
  }

  return (
    `User pinned app: "${scope.name}" (project_id: ${scope.project_id}). ` +
    PINNED_EXECUTE_IN_APP +
    PINNED_ACTION_FLOW +
    `Use call_app_action with project_id "${scope.project_id}". ` +
    `When the user asks to deploy, call deploy_app { project_id: "${scope.project_id}" }.`
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
