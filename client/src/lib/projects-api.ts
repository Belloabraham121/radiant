import { apiFetch } from "@/lib/api";
import type { ArtifactPayload } from "@/lib/artifact-types";

export type ProjectSummary = {
  id: string;
  session_id: string | null;
  name: string;
  tagline: string;
  template: string;
  status: string;
  accent: string;
  walrus_url: string | null;
  artifact_revision: number;
  updated_at: string;
  created_at: string;
};

export type ArtifactRevisionSummary = {
  revision: number;
  file_count: number;
  created_at: string;
};

export type ProjectsPagination = {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
};

export type ProjectsListResult = {
  projects: ProjectSummary[];
  pagination?: ProjectsPagination;
};

export async function fetchProjects(params?: {
  page?: number;
  limit?: number;
  search?: string;
  scope?: "all" | "saved" | "deployed";
}): Promise<ProjectsListResult> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.search?.trim()) query.set("search", params.search.trim());
  if (params?.scope && params.scope !== "all") query.set("scope", params.scope);
  const suffix = query.size ? `?${query.toString()}` : "";
  return apiFetch<ProjectsListResult>(`/api/v1/projects${suffix}`);
}

/** @deprecated Prefer fetchProjects for paginated listing. */
export async function fetchAllProjects(): Promise<ProjectSummary[]> {
  const data = await fetchProjects({ limit: 100 });
  return data.projects;
}

export async function fetchSessionProjects(sessionId: string): Promise<ProjectSummary[]> {
  const data = await apiFetch<{ projects: ProjectSummary[] }>(
    `/api/v1/projects?session_id=${encodeURIComponent(sessionId)}`,
  );
  return data.projects;
}

export async function fetchProjectRevisions(projectId: string): Promise<{
  project_id: string;
  current_revision: number;
  revisions: ArtifactRevisionSummary[];
}> {
  return apiFetch(`/api/v1/projects/${projectId}/revisions`);
}

export async function fetchProjectArtifact(
  projectId: string,
  revision?: number,
): Promise<ArtifactPayload> {
  const query = revision != null ? `?revision=${revision}` : "";
  const data = await apiFetch<{
    project: { artifact: ArtifactPayload };
  }>(`/api/v1/projects/${projectId}${query}`);
  return data.project.artifact;
}

export async function restoreProjectRevision(
  projectId: string,
  revision: number,
): Promise<ArtifactPayload> {
  const data = await apiFetch<{ artifact: ArtifactPayload }>(
    `/api/v1/projects/${projectId}/restore`,
    {
      method: "POST",
      body: JSON.stringify({ revision }),
    },
  );
  return data.artifact;
}

export async function saveSessionDraftToProject(
  sessionId: string,
  body?: { name?: string; tagline?: string; project_id?: string },
): Promise<{ artifact: ArtifactPayload; project_id: string; saved_to_project: boolean }> {
  return apiFetch(`/api/v1/chat/sessions/${sessionId}/draft/save`, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}

export async function deleteProject(projectId: string): Promise<{ deleted: boolean; project_id: string }> {
  return apiFetch(`/api/v1/projects/${projectId}`, { method: "DELETE" });
}
