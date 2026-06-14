import { apiFetch } from "@/lib/api";
import type { ArtifactPayload } from "@/lib/artifact-types";

export type InstallationSummary = {
  id: string;
  source_project_id: string;
  name: string;
  tagline: string;
  accent: string;
  category: string;
  pinned_revision: number | null;
  installed_at: string;
  available: boolean;
};

export async function fetchInstallations(): Promise<InstallationSummary[]> {
  const data = await apiFetch<{ installations: InstallationSummary[] }>("/api/v1/installations");
  return data.installations;
}

export async function fetchInstallationArtifact(installationId: string): Promise<{
  installation: {
    id: string;
    source_project_id: string;
    pinned_revision: number | null;
    installed_at: string;
  };
  artifact: ArtifactPayload;
}> {
  return apiFetch(`/api/v1/installations/${installationId}`);
}
