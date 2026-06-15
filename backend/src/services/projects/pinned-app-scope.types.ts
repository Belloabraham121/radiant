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

export function formatPinnedAppScopeForPrompt(scope: PinnedAppScope): string {
  if (scope.kind === "installation") {
    return (
      `User pinned app: "${scope.name}" (installation_id: ${scope.installation_id}). ` +
      `For swaps and other on-chain actions in that app, use call_app_action with installation_id "${scope.installation_id}" — ` +
      `never execute_transaction for swaps. Skip list_session_projects; scope is already set.`
    );
  }

  if (scope.kind === "session_draft") {
    return (
      `User pinned app: "${scope.name}" (chat draft in this session). ` +
      `For swaps and other on-chain actions, use call_app_action with use_session_draft: true and app_name "${scope.name}" — ` +
      `never execute_transaction for swaps. Skip list_session_projects; scope is already set.`
    );
  }

  return (
    `User pinned app: "${scope.name}" (project_id: ${scope.project_id}). ` +
    `For swaps and other on-chain actions in that app, use call_app_action with project_id "${scope.project_id}" — ` +
    `never execute_transaction for swaps. Skip list_session_projects; scope is already set.`
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
