import {
  getMarginManagerInfoForHttp,
  getMarginOpenOrdersForHttp,
  getMarginPoolInfoForHttp,
  getMarginRiskRatioForHttp,
  getMarginTpslInfoForHttp,
  getMarginLiquidationsForHttp,
  getMarginCollateralHistoryForHttp,
  getMarginLoanHistoryForHttp,
  getMarginAtRiskStatesForHttp,
  getMarginManagersInfoForHttp,
  getMarginManagerCreatedForHttp,
  getMarginSupplyHistoryForHttp,
  getMarginIndexerSupplyForHttp,
  getMarginManagerStateForHttp,
} from "../defi/deepbook/deepbook-margin-app-read.service.js";
import { AppError } from "../../errors/app-error.js";
import { findUserByPrivyId } from "../auth/user.repository.js";
import { findProjectByIdForUser } from "./project.repository.js";
import { findSessionForUser } from "../conversation/session.repository.js";
import { findInstallationForUser } from "../apps/app-installation.repository.js";

type MarginReadFn = (privyUserId: string, query: unknown) => Promise<unknown>;

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

function forProject(read: MarginReadFn) {
  return async (privyUserId: string, projectId: string, query: unknown) => {
    await assertProjectOwner(privyUserId, projectId);
    return read(privyUserId, query);
  };
}

function forSession(read: MarginReadFn) {
  return async (privyUserId: string, sessionId: string, query: unknown) => {
    await assertSessionOwner(privyUserId, sessionId);
    return read(privyUserId, query);
  };
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

function forInstallation(read: MarginReadFn) {
  return async (privyUserId: string, installationId: string, query: unknown) => {
    await assertInstallationAccess(privyUserId, installationId);
    return read(privyUserId, query);
  };
}

const MARGIN_READS = {
  tpslInfo: getMarginTpslInfoForHttp,
  liquidations: getMarginLiquidationsForHttp,
  collateralHistory: getMarginCollateralHistoryForHttp,
  loanHistory: getMarginLoanHistoryForHttp,
  atRiskStates: getMarginAtRiskStatesForHttp,
  managersInfo: getMarginManagersInfoForHttp,
  managerCreated: getMarginManagerCreatedForHttp,
  supplyHistory: getMarginSupplyHistoryForHttp,
  indexerSupply: getMarginIndexerSupplyForHttp,
  managerState: getMarginManagerStateForHttp,
} as const;

export const marginTpslInfoForProject = forProject(MARGIN_READS.tpslInfo);
export const marginLiquidationsForProject = forProject(MARGIN_READS.liquidations);
export const marginCollateralHistoryForProject = forProject(MARGIN_READS.collateralHistory);
export const marginLoanHistoryForProject = forProject(MARGIN_READS.loanHistory);
export const marginAtRiskStatesForProject = forProject(MARGIN_READS.atRiskStates);
export const marginManagersInfoForProject = forProject(MARGIN_READS.managersInfo);
export const marginManagerCreatedForProject = forProject(MARGIN_READS.managerCreated);
export const marginSupplyHistoryForProject = forProject(MARGIN_READS.supplyHistory);
export const marginIndexerSupplyForProject = forProject(MARGIN_READS.indexerSupply);
export const marginManagerStateForProject = forProject(MARGIN_READS.managerState);

export const marginTpslInfoForSession = forSession(MARGIN_READS.tpslInfo);
export const marginLiquidationsForSession = forSession(MARGIN_READS.liquidations);
export const marginCollateralHistoryForSession = forSession(MARGIN_READS.collateralHistory);
export const marginLoanHistoryForSession = forSession(MARGIN_READS.loanHistory);
export const marginAtRiskStatesForSession = forSession(MARGIN_READS.atRiskStates);
export const marginManagersInfoForSession = forSession(MARGIN_READS.managersInfo);
export const marginManagerCreatedForSession = forSession(MARGIN_READS.managerCreated);
export const marginSupplyHistoryForSession = forSession(MARGIN_READS.supplyHistory);
export const marginIndexerSupplyForSession = forSession(MARGIN_READS.indexerSupply);
export const marginManagerStateForSession = forSession(MARGIN_READS.managerState);

export const marginTpslInfoForInstallation = forInstallation(MARGIN_READS.tpslInfo);
export const marginLiquidationsForInstallation = forInstallation(MARGIN_READS.liquidations);
export const marginCollateralHistoryForInstallation = forInstallation(MARGIN_READS.collateralHistory);
export const marginLoanHistoryForInstallation = forInstallation(MARGIN_READS.loanHistory);
export const marginAtRiskStatesForInstallation = forInstallation(MARGIN_READS.atRiskStates);
export const marginManagersInfoForInstallation = forInstallation(MARGIN_READS.managersInfo);
export const marginManagerCreatedForInstallation = forInstallation(MARGIN_READS.managerCreated);
export const marginSupplyHistoryForInstallation = forInstallation(MARGIN_READS.supplyHistory);
export const marginIndexerSupplyForInstallation = forInstallation(MARGIN_READS.indexerSupply);
export const marginManagerStateForInstallation = forInstallation(MARGIN_READS.managerState);

export type MarginDeepbookReadRoute = {
  path: string;
  project: (privyUserId: string, projectId: string, query: unknown) => Promise<unknown>;
  session: (privyUserId: string, sessionId: string, query: unknown) => Promise<unknown>;
  installation: (privyUserId: string, installationId: string, query: unknown) => Promise<unknown>;
};

export const MARGIN_DEEPBOOK_READ_ROUTES: MarginDeepbookReadRoute[] = [
  {
    path: "margin-tpsl-info",
    project: marginTpslInfoForProject,
    session: marginTpslInfoForSession,
    installation: marginTpslInfoForInstallation,
  },
  {
    path: "margin-liquidations",
    project: marginLiquidationsForProject,
    session: marginLiquidationsForSession,
    installation: marginLiquidationsForInstallation,
  },
  {
    path: "margin-collateral-history",
    project: marginCollateralHistoryForProject,
    session: marginCollateralHistoryForSession,
    installation: marginCollateralHistoryForInstallation,
  },
  {
    path: "margin-loan-history",
    project: marginLoanHistoryForProject,
    session: marginLoanHistoryForSession,
    installation: marginLoanHistoryForInstallation,
  },
  {
    path: "margin-at-risk-states",
    project: marginAtRiskStatesForProject,
    session: marginAtRiskStatesForSession,
    installation: marginAtRiskStatesForInstallation,
  },
  {
    path: "margin-managers-info",
    project: marginManagersInfoForProject,
    session: marginManagersInfoForSession,
    installation: marginManagersInfoForInstallation,
  },
  {
    path: "margin-manager-created",
    project: marginManagerCreatedForProject,
    session: marginManagerCreatedForSession,
    installation: marginManagerCreatedForInstallation,
  },
  {
    path: "margin-supply-history",
    project: marginSupplyHistoryForProject,
    session: marginSupplyHistoryForSession,
    installation: marginSupplyHistoryForInstallation,
  },
  {
    path: "margin-indexer-supply",
    project: marginIndexerSupplyForProject,
    session: marginIndexerSupplyForSession,
    installation: marginIndexerSupplyForInstallation,
  },
  {
    path: "margin-manager-state",
    project: marginManagerStateForProject,
    session: marginManagerStateForSession,
    installation: marginManagerStateForInstallation,
  },
];

// Re-export existing margin reads for route registration convenience.
export {
  getMarginManagerInfoForHttp,
  getMarginOpenOrdersForHttp,
  getMarginPoolInfoForHttp,
  getMarginRiskRatioForHttp,
};
