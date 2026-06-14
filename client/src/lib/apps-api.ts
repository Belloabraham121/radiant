import { apiFetch } from "@/lib/api";
import type { Agent, AgentCategory } from "@/lib/explorer-data";

export type PublicAppListing = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  accent: string;
  fee_bps: number;
  template: string;
  install_count: number;
  creator: string;
  published_at: string;
  artifact_revision: number;
};

export type PublicAppsCatalog = {
  apps: PublicAppListing[];
  stats: {
    total_apps: number;
    total_installs: number;
  };
};

export type PublishState = {
  id: string;
  is_public: boolean;
  fee_bps: number;
  category: string;
  tagline: string;
  status: string;
  can_publish: boolean;
};

export type PublishPayload = {
  is_public: boolean;
  fee_bps?: number;
  category?: AgentCategory;
  tagline?: string;
};

function hashSeed(id: string): number {
  let seed = 0;
  for (let i = 0; i < id.length; i++) {
    seed = (seed + id.charCodeAt(i) * (i + 1)) | 0;
  }
  return Math.abs(seed);
}

/** Map API listing to explorer Agent shape (mock stats until on-chain registry). */
export function listingToAgent(listing: PublicAppListing): Agent {
  const seed = hashSeed(listing.id);
  const installs = listing.install_count;
  return {
    id: listing.id,
    name: listing.name,
    tagline: listing.tagline,
    description: listing.description,
    category: listing.category as AgentCategory,
    accent: listing.accent,
    feeBps: listing.fee_bps,
    uses: installs,
    txCount: installs * 12 + (seed % 400),
    volumeSui: installs * 80 + (seed % 2000),
    tvlSui: installs * 40 + (seed % 800),
    feesEarnedSui: Math.round((installs * listing.fee_bps) / 100),
    creator: listing.creator,
    deployedAt: new Date(listing.published_at).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    walrusUrl: "Runs in Radiant",
  };
}

export async function fetchPublicApps(params?: {
  category?: AgentCategory;
  search?: string;
  sort?: "newest" | "installs" | "name";
}): Promise<PublicAppsCatalog> {
  const query = new URLSearchParams();
  if (params?.category) query.set("category", params.category);
  if (params?.search) query.set("search", params.search);
  if (params?.sort) query.set("sort", params.sort);
  const suffix = query.size ? `?${query.toString()}` : "";
  return apiFetch<PublicAppsCatalog>(`/api/v1/apps${suffix}`);
}

export async function fetchPublicApp(projectId: string): Promise<PublicAppListing> {
  const data = await apiFetch<{ app: PublicAppListing }>(`/api/v1/apps/${projectId}`);
  return data.app;
}

export async function installPublicApp(projectId: string): Promise<{
  installation_id: string;
  already_installed: boolean;
  source_project_id: string;
  app_name: string;
}> {
  return apiFetch(`/api/v1/apps/${projectId}/install`, { method: "POST" });
}

export async function fetchPublishState(projectId: string): Promise<PublishState> {
  return apiFetch(`/api/v1/projects/${projectId}/publish`);
}

export async function publishProject(projectId: string, body: PublishPayload): Promise<PublishState> {
  return apiFetch(`/api/v1/projects/${projectId}/publish`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
