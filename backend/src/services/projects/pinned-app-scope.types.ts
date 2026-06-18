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

const PINNED_UI_CHANGES =
  "UI / code changes (fix a chart, change colors, add a field, update layout, rename labels): " +
  "the pinned app's current source is included below (or call read_artifact). " +
  "Apply surgical edits with edit_app — change only what the user asked for. " +
  "Never describe a UI fix without calling edit_app in the same turn. " +
  "Use generate_app only if they explicitly want a brand-new app from scratch with no pinned artifact. " +
  "The platform routes edits to this pinned app automatically — never ask the user for project ids or tool names.";

const PINNED_EXECUTE_IN_APP =
  "In-app actions (swap, deposit, submit a form, run a margin order): " +
  "the user pinned this app and expects you to act INSIDE it — they watch the preview while fields fill and buttons click. " +
  "Use call_app_action (not execute_transaction). Do not only describe what you will do — run the action. " +
  "The preview shows field fills, highlights, then an in-app confirmation modal.";

const PINNED_ACTION_FLOW =
  "For in-app actions: optionally call query_chain project_actions or session_actions (pinned scope applies automatically), " +
  "then call call_app_action with the matching action and params. " +
  "Reply briefly after the action runs (e.g. 'Running swap in your app — confirm in the preview.'). " +
  "Skip list_session_projects — scope is already set.";

const PINNED_INSTALLATION_ACTION_FLOW =
  "For in-app actions on an installed app: optionally call query_chain project_actions {}, " +
  "then call call_app_action (installation scope applies automatically if omitted). " +
  "Reply briefly after the action runs. Never pass app_name — other apps in this chat are irrelevant.";

const PINNED_INSTALLATION_LIMIT =
  "Installed apps cannot be edited in place — UI/code changes require the app author's project. " +
  "You can still run in-app actions and answer questions.";

export function formatPinnedAppScopeForPrompt(scope: PinnedAppScope): string {
  if (scope.kind === "installation") {
    return [
      `User pinned INSTALLED app: "${scope.name}".`,
      PINNED_INSTALLATION_LIMIT,
      PINNED_EXECUTE_IN_APP,
      PINNED_INSTALLATION_ACTION_FLOW,
    ].join(" ");
  }

  if (scope.kind === "session_draft") {
    return [
      `User pinned chat app: "${scope.name}" (session draft).`,
      PINNED_UI_CHANGES,
      PINNED_EXECUTE_IN_APP,
      PINNED_ACTION_FLOW,
      "Deploy: deploy_app { use_session_draft: true } auto-saves then publishes on the explorer.",
    ].join(" ");
  }

  return [
    `User pinned saved app: "${scope.name}".`,
    PINNED_UI_CHANGES,
    PINNED_EXECUTE_IN_APP,
    PINNED_ACTION_FLOW,
    "Deploy: deploy_app with pinned project scope.",
  ].join(" ");
}

export type CallAppActionScopeFields = {
  project_id?: string;
  installation_id?: string;
  app_name?: string;
  use_session_draft?: boolean;
};

export type ArtifactToolScopeFields = {
  project_id?: string | null;
};

export function hasCallAppActionScope(fields: CallAppActionScopeFields): boolean {
  return Boolean(
    fields.project_id ||
      fields.installation_id ||
      fields.app_name?.trim() ||
      fields.use_session_draft,
  );
}

export function hasArtifactToolScope(fields: ArtifactToolScopeFields): boolean {
  return Boolean(fields.project_id?.trim());
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

/** Apply chat-pinned app scope when the agent omits edit_app / generate_app / read_artifact project_id. */
export function mergePinnedAppScopeIntoArtifactTool<T extends ArtifactToolScopeFields>(
  input: T,
  pinned?: PinnedAppScope | null,
): T {
  if (!pinned || hasArtifactToolScope(input)) {
    return input;
  }

  if (pinned.kind === "project") {
    return { ...input, project_id: pinned.project_id };
  }

  return input;
}

export function scopeDisplayName(scope: PinnedAppScope): string {
  return scope.name;
}

export type NotificationRuleScopeFields = {
  project_id?: string;
  installation_id?: string;
};

export function hasNotificationRuleScope(fields: NotificationRuleScopeFields): boolean {
  return Boolean(fields.project_id || fields.installation_id);
}

/** Apply chat-pinned app scope when the agent omits notification rule scope fields. */
export function mergePinnedAppScopeIntoNotificationRule<T extends NotificationRuleScopeFields>(
  input: T,
  pinned?: PinnedAppScope | null,
): T {
  if (!pinned || hasNotificationRuleScope(input)) {
    return input;
  }

  if (pinned.kind === "installation") {
    return { ...input, installation_id: pinned.installation_id };
  }

  if (pinned.kind === "project") {
    return { ...input, project_id: pinned.project_id };
  }

  return input;
}
