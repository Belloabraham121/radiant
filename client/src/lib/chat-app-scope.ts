import { z } from "zod";

export const chatAppScopeSchema = z.discriminatedUnion("kind", [
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

export type ChatAppScope = z.infer<typeof chatAppScopeSchema>;

export type ChatAppScopeGroup =
  | "chat_draft"
  | "chat_project"
  | "installed"
  | "deployed";

export type ChatAppScopeCandidate = {
  key: string;
  name: string;
  tagline?: string;
  group: ChatAppScopeGroup;
  scope: ChatAppScope;
};

const STORAGE_PREFIX = "radiant:chat-app-scope:";

export function chatAppScopeStorageKey(sessionId?: string): string {
  return `${STORAGE_PREFIX}${sessionId ?? "new"}`;
}

export function loadStoredChatAppScope(sessionId?: string): ChatAppScope | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(chatAppScopeStorageKey(sessionId));
    if (!raw) {
      return null;
    }
    return chatAppScopeSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveStoredChatAppScope(sessionId: string | undefined, scope: ChatAppScope | null): void {
  if (typeof window === "undefined") {
    return;
  }
  const key = chatAppScopeStorageKey(sessionId);
  if (!scope) {
    window.localStorage.removeItem(key);
    return;
  }
  window.localStorage.setItem(key, JSON.stringify(scope));
}

export function groupLabel(group: ChatAppScopeGroup): string {
  switch (group) {
    case "chat_draft":
      return "Chat draft";
    case "chat_project":
      return "In this chat";
    case "installed":
      return "Installed";
    case "deployed":
      return "Deployed";
    default:
      return group;
  }
}

/** Parse `@project` or `@project uniswap` (or `@uniswap`) from the composer tail. */
export function parseComposerAppMention(input: string): {
  open: boolean;
  filter: string;
} {
  const match = input.match(/(?:^|\s)@([\w\s]*)$/);
  if (!match) {
    return { open: false, filter: "" };
  }

  const raw = match[1] ?? "";
  const normalized = raw.trim().toLowerCase();
  if (normalized === "project" || normalized.startsWith("project ")) {
    const filter = normalized === "project" ? "" : normalized.slice("project ".length).trim();
    return { open: true, filter };
  }

  if (raw.length === 0) {
    return { open: true, filter: "" };
  }

  return { open: true, filter: raw.trim().toLowerCase() };
}

export function stripComposerAppMention(input: string): string {
  return input.replace(/(?:^|\s)@[\w\s]*$/, "").trimEnd();
}

/** @deprecated Use parseComposerAppMention */
export const parseComposerSlashCommand = parseComposerAppMention;

/** @deprecated Use stripComposerAppMention */
export const stripComposerSlashCommand = stripComposerAppMention;

export function scopeToChipLabel(scope: ChatAppScope): string {
  if (scope.kind === "installation") {
    return scope.name;
  }
  if (scope.kind === "session_draft") {
    return `${scope.name} · draft`;
  }
  if (scope.source === "deployed") {
    return `${scope.name} · deployed`;
  }
  if (scope.source === "chat") {
    return `${scope.name} · this chat`;
  }
  return scope.name;
}
