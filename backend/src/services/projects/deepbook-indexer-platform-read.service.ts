import { AppError } from "../../errors/app-error.js";
import { findUserByPrivyId } from "../auth/user.repository.js";
import { findProjectByIdForUser } from "./project.repository.js";
import { findSessionForUser } from "../conversation/session.repository.js";
import { findInstallationForUser } from "../apps/app-installation.repository.js";
import {
  getDeepBookOhlcvForHttp,
  getDeepBookTradesForHttp,
  getDeepBookVolumeForHttp,
} from "../defi/deepbook/deepbook-indexer-app-read.service.js";

type IndexerReadFn = (privyUserId: string, query: unknown) => Promise<unknown>;

async function assertProjectOwner(privyUserId: string, projectId: string): Promise<void> {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }
  const project = await findProjectByIdForUser(projectId, user.id);
  if (!project) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
  }
}

async function assertSessionOwner(privyUserId: string, sessionId: string): Promise<void> {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }
  const session = await findSessionForUser(sessionId, user.id);
  if (!session) {
    throw new AppError(404, "SESSION_NOT_FOUND", "Chat session not found");
  }
}

async function assertInstallationAccess(privyUserId: string, installationId: string): Promise<void> {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }
  const installation = await findInstallationForUser(installationId, user.id);
  if (!installation) {
    throw new AppError(404, "INSTALLATION_NOT_FOUND", "App installation not found");
  }
}

function forProject(read: IndexerReadFn) {
  return async (privyUserId: string, projectId: string, query: unknown) => {
    await assertProjectOwner(privyUserId, projectId);
    return read(privyUserId, query);
  };
}

function forSession(read: IndexerReadFn) {
  return async (privyUserId: string, sessionId: string, query: unknown) => {
    await assertSessionOwner(privyUserId, sessionId);
    return read(privyUserId, query);
  };
}

function forInstallation(read: IndexerReadFn) {
  return async (privyUserId: string, installationId: string, query: unknown) => {
    await assertInstallationAccess(privyUserId, installationId);
    return read(privyUserId, query);
  };
}

const INDEXER_READS = {
  ohlcv: getDeepBookOhlcvForHttp,
  trades: getDeepBookTradesForHttp,
  volume: getDeepBookVolumeForHttp,
} as const;

export type DeepbookIndexerReadRoute = {
  path: string;
  project: (privyUserId: string, projectId: string, query: unknown) => Promise<unknown>;
  session: (privyUserId: string, sessionId: string, query: unknown) => Promise<unknown>;
  installation: (privyUserId: string, installationId: string, query: unknown) => Promise<unknown>;
};

export const DEEPBOOK_INDEXER_READ_ROUTES: DeepbookIndexerReadRoute[] = [
  {
    path: "ohlcv",
    project: forProject(INDEXER_READS.ohlcv),
    session: forSession(INDEXER_READS.ohlcv),
    installation: forInstallation(INDEXER_READS.ohlcv),
  },
  {
    path: "trades",
    project: forProject(INDEXER_READS.trades),
    session: forSession(INDEXER_READS.trades),
    installation: forInstallation(INDEXER_READS.trades),
  },
  {
    path: "volume",
    project: forProject(INDEXER_READS.volume),
    session: forSession(INDEXER_READS.volume),
    installation: forInstallation(INDEXER_READS.volume),
  },
];
