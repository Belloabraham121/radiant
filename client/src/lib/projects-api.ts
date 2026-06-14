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

export async function fetchAllProjects(): Promise<ProjectSummary[]> {
  const data = await apiFetch<{ projects: ProjectSummary[] }>("/api/v1/projects");
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
