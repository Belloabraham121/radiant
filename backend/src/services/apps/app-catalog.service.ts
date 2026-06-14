import { z } from "zod";
import { AppError } from "../../errors/app-error.js";
import { prisma } from "../../infrastructure/postgres/client.js";
import { buildProjectActionsCatalogResponse } from "../projects/app-action-schema.service.js";
import type { ProjectActionSchemaSource } from "../projects/app-action-schema.service.js";
import {
  APP_CATEGORIES,
  type PublicAppActionSummary,
  type PublicAppListing,
  type PublicAppsCatalog,
} from "./app-catalog.types.js";

const listAppsQuerySchema = z.object({
  category: z.enum(APP_CATEGORIES).optional(),
  search: z.string().trim().optional(),
  sort: z.enum(["newest", "installs", "name"]).default("newest"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

function truncateCreator(address: string | undefined): string {
  if (!address) return "anonymous";
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function publicActionsForProject(project: ProjectActionSchemaSource): PublicAppActionSummary[] {
  const catalog = buildProjectActionsCatalogResponse(project);
  return catalog.actions.map((action) => ({
    name: action.name,
    description: action.description,
    category: action.category,
  }));
}

function toListing(
  project: {
    id: string;
    name: string;
    tagline: string;
    template: string;
    category: string;
    accent: string;
    fee_bps: number;
    artifact_revision: number;
    created_at: Date;
    action_schema?: unknown | null;
    user: { agent_wallets: Array<{ chain_type: string; address: string }> };
  },
  installCount: number,
): PublicAppListing {
  const suiWallet = project.user.agent_wallets.find((w) => w.chain_type === "sui");
  return {
    id: project.id,
    name: project.name,
    tagline: project.tagline,
    description: project.tagline || `${project.template} app on Radiant`,
    category: project.category,
    accent: project.accent,
    fee_bps: project.fee_bps,
    template: project.template,
    install_count: installCount,
    creator: truncateCreator(suiWallet?.address),
    published_at: project.created_at.toISOString(),
    artifact_revision: project.artifact_revision,
    available_actions: publicActionsForProject(project),
  };
}

export async function listPublicApps(query: unknown): Promise<PublicAppsCatalog> {
  const params = listAppsQuerySchema.parse(query);
  const where = {
    is_public: true,
    status: "live" as const,
    ...(params.category ? { category: params.category } : {}),
    ...(params.search
      ? {
          OR: [
            { name: { contains: params.search, mode: "insensitive" as const } },
            { tagline: { contains: params.search, mode: "insensitive" as const } },
            { category: { contains: params.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const orderBy =
    params.sort === "name"
      ? ({ name: "asc" } as const)
      : ({ created_at: "desc" } as const);

  const skip = (params.page - 1) * params.limit;

  const [rows, totalApps, installAgg] = await Promise.all([
    prisma.project.findMany({
      where,
      include: {
        user: { include: { agent_wallets: true } },
        _count: { select: { installations: true } },
      },
      orderBy,
      skip,
      take: params.limit,
    }),
    prisma.project.count({ where }),
    prisma.appInstallation.count({
      where: { source_project: { is_public: true, status: "live" } },
    }),
  ]);

  let apps = rows.map((row) => toListing(row, row._count.installations));
  if (params.sort === "installs") {
    apps = apps.sort((a, b) => b.install_count - a.install_count || a.name.localeCompare(b.name));
  }

  return {
    apps,
    stats: {
      total_apps: totalApps,
      total_installs: installAgg,
    },
  };
}

export async function getPublicApp(projectId: string): Promise<PublicAppListing> {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      is_public: true,
      status: "live",
    },
    include: {
      user: { include: { agent_wallets: true } },
      _count: { select: { installations: true } },
    },
  });

  if (!project) {
    throw new AppError(404, "APP_NOT_FOUND", "Public app not found");
  }

  return toListing(project, project._count.installations);
}
