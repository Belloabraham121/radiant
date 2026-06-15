import { getSessionDraftSummaryForUser } from "./generate-app.service.js";
import { listSessionProjectsForUser } from "./project-artifact.service.js";

export type ChatSessionAppScope = {
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

export async function getChatSessionAppScopeForUser(
  privyUserId: string,
  sessionId: string,
): Promise<ChatSessionAppScope> {
  const [draft, projects] = await Promise.all([
    getSessionDraftSummaryForUser(privyUserId, sessionId),
    listSessionProjectsForUser(privyUserId, sessionId),
  ]);

  return {
    session_id: sessionId,
    draft,
    projects: projects.map((project) => ({
      project_id: project.project_id,
      name: project.name,
      tagline: project.tagline,
      status: project.status,
      artifact_revision: project.artifact_revision,
    })),
  };
}
