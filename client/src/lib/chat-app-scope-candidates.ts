import { apiFetch } from "@/lib/api";
import { fetchInstallations } from "@/lib/installations-api";
import { fetchProjects } from "@/lib/projects-api";
import type { ChatAppScopeCandidate } from "@/lib/chat-app-scope";

export type ChatSessionAppScopeResponse = {
  session_id: string;
  draft: {
    has_draft: boolean;
    name?: string;
    revision?: number;
  };
  projects: Array<{
    project_id: string;
    name: string;
    tagline: string;
    status: string;
    artifact_revision: number;
  }>;
};

export async function fetchChatSessionAppScope(
  sessionId: string,
): Promise<ChatSessionAppScopeResponse> {
  return apiFetch<ChatSessionAppScopeResponse>(
    `/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/app-scope`,
  );
}

/**
 * Apps available for @-mention pinning:
 * - this chat's draft + session-linked projects
 * - installed apps (account-wide)
 * - Walrus-deployed projects (account-wide, deduped)
 */
export async function fetchChatAppScopeCandidates(
  sessionId?: string,
): Promise<ChatAppScopeCandidate[]> {
  const [sessionScope, installations, deployedResult] = await Promise.all([
    sessionId ? fetchChatSessionAppScope(sessionId).catch(() => null) : Promise.resolve(null),
    fetchInstallations(),
    fetchProjects({ scope: "deployed", limit: 100 }),
  ]);

  const candidates: ChatAppScopeCandidate[] = [];
  const seenProjectIds = new Set<string>();

  if (sessionScope?.draft.has_draft) {
    const draftName = sessionScope.draft.name ?? "Chat draft";
    candidates.push({
      key: `chat-draft:${sessionScope.session_id}`,
      name: draftName,
      tagline: "Unsaved artifact in this chat",
      group: "chat_draft",
      scope: {
        kind: "session_draft",
        name: draftName,
      },
    });
  }

  if (sessionScope) {
    for (const project of sessionScope.projects) {
      seenProjectIds.add(project.project_id);
      candidates.push({
        key: `chat-project:${project.project_id}`,
        name: project.name,
        tagline: project.tagline,
        group: "chat_project",
        scope: {
          kind: "project",
          project_id: project.project_id,
          name: project.name,
          source: "chat",
        },
      });
    }
  }

  for (const installation of installations) {
    if (!installation.available) {
      continue;
    }
    seenProjectIds.add(installation.source_project_id);
    candidates.push({
      key: `installation:${installation.id}`,
      name: installation.name,
      tagline: installation.tagline,
      group: "installed",
      scope: {
        kind: "installation",
        installation_id: installation.id,
        name: installation.name,
      },
    });
  }

  for (const project of deployedResult.projects) {
    if (seenProjectIds.has(project.id)) {
      continue;
    }
    candidates.push({
      key: `deployed:${project.id}`,
      name: project.name,
      tagline: project.tagline,
      group: "deployed",
      scope: {
        kind: "project",
        project_id: project.id,
        name: project.name,
        source: "deployed",
      },
    });
    seenProjectIds.add(project.id);
  }

  return candidates.sort((left, right) => {
    const groupOrder: Record<ChatAppScopeCandidate["group"], number> = {
      chat_draft: 0,
      chat_project: 1,
      installed: 2,
      deployed: 3,
    };
    const byGroup = groupOrder[left.group] - groupOrder[right.group];
    if (byGroup !== 0) {
      return byGroup;
    }
    return left.name.localeCompare(right.name);
  });
}

export function filterChatAppScopeCandidates(
  candidates: ChatAppScopeCandidate[],
  filter: string,
): ChatAppScopeCandidate[] {
  const term = filter.trim().toLowerCase();
  if (!term) {
    return candidates;
  }
  return candidates.filter((candidate) => {
    const haystack = `${candidate.name} ${candidate.tagline ?? ""}`.toLowerCase();
    return haystack.includes(term);
  });
}
