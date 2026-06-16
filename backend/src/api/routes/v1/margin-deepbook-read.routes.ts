import type { Request, Response, NextFunction, Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { ok } from "../../../utils/http-response.js";
import { MARGIN_DEEPBOOK_READ_ROUTES } from "../../../services/projects/margin-app-platform-read.service.js";

type ScopeKind = "project" | "session" | "installation";

function scopeParam(kind: ScopeKind): string {
  switch (kind) {
    case "project":
      return "projectId";
    case "session":
      return "sessionId";
    case "installation":
      return "installationId";
  }
}

function basePath(kind: ScopeKind): string {
  switch (kind) {
    case "project":
      return "/api/v1/projects";
    case "session":
      return "/api/v1/chat/sessions";
    case "installation":
      return "/api/v1/installations";
  }
}

export function registerMarginDeepbookReadRoutes(router: Router, kind: ScopeKind): void {
  const idParam = scopeParam(kind);
  const prefix = basePath(kind);

  for (const route of MARGIN_DEEPBOOK_READ_ROUTES) {
    const handler =
      kind === "project"
        ? route.project
        : kind === "session"
          ? route.session
          : route.installation;

    router.get(
      `${prefix}/:${idParam}/deepbook/${route.path}`,
      requireAuth,
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const scopeId = req.params[idParam];
          const data = await handler(req.user.privyUserId, scopeId, req.query);
          return ok(req, res, data);
        } catch (err) {
          next(err);
        }
      },
    );
  }
}
