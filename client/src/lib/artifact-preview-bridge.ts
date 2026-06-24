/** Parent ↔ iframe preview bridge — API proxy + agent event relay (Phase 5). */

export const PREVIEW_MESSAGE_TYPE = "radiant-artifact-preview";
export const PREVIEW_NAVIGATE_TYPE = "radiant-artifact-preview-navigate";
export const PREVIEW_API_REQUEST = "radiant-preview-api";
export const PREVIEW_API_RESPONSE = "radiant-preview-api-response";
export const RADIANT_AGENT_EVENT_TYPE = "radiant-agent-event";
export const PREVIEW_TX_APPROVAL_REQUEST = "radiant-tx-approval-request";
export const PREVIEW_TX_APPROVAL_RESOLVED = "radiant-tx-approval-resolved";
export const PREVIEW_EXECUTE_RESULT = "radiant-preview-execute-result";
export const RADIANT_SESSION_ID_HEADER = "x-radiant-session-id";

const UUID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

const BLOCKED_PREVIEW_API_EXACT = new Set(["/api/v1/chat", "/api/v1/proxy"]);

const BLOCKED_PREVIEW_API_PREFIXES = [
  "/api/v1/auth/",
  "/api/v1/agent/permissions",
  "/api/v1/agent/transactions",
  "/api/v1/wallets/",
  "/api/v1/deploy/",
  "/api/v1/notifications/",
];

export type PreviewApiRequestMessage = {
  type: typeof PREVIEW_API_REQUEST;
  requestId: string;
  path: string;
  method?: string;
  body?: string;
};

export type PreviewApiResponseMessage = {
  type: typeof PREVIEW_API_RESPONSE;
  requestId: string;
  status?: number;
  body?: string;
  error?: string;
};

/** Live agent animation events — parent forwards SSE payloads to iframe (Phase 8). */
export type RadiantAgentStreamEvent = {
  type: typeof RADIANT_AGENT_EVENT_TYPE;
  action?: string;
  params?: Record<string, unknown>;
  step?: string;
  target?: string;
  digest?: string;
  refresh?: boolean;
  active?: boolean;
  animate?: boolean;
  code?: string;
  message?: string;
  value?: unknown;
  pending?: Record<string, unknown>;
};

export type PreviewTxApprovalResolvedMessage = {
  type: typeof PREVIEW_TX_APPROVAL_RESOLVED;
  pendingId: string;
  status: "executed" | "rejected" | "error";
  digest?: string;
  errorMessage?: string;
};

export type PreviewExecuteResultMessage = {
  type: typeof PREVIEW_EXECUTE_RESULT;
  action: string;
  status: "executed" | "approval_required" | "error";
  digest?: string;
  message?: string;
  pending?: Record<string, unknown>;
};

export function isAppActionApiPath(path: string): boolean {
  return /\/actions\/[^/?#]+/.test(path);
}

export function isNotificationApiPath(path: string): boolean {
  return /\/notifications(\/|$)/.test(path);
}

function normalizePreviewApiPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed.startsWith("/")) {
    return `/${trimmed}`;
  }
  return trimmed.split(/[?#]/)[0] ?? trimmed;
}

function matchesScopedPrefix(
  path: string,
  prefix: string,
  expectedId?: string,
): boolean {
  const re = new RegExp(`^${prefix}/(${UUID_PATTERN})(/.*)?$`, "i");
  const match = path.match(re);
  if (!match) {
    return false;
  }
  if (expectedId && match[1]?.toLowerCase() !== expectedId.toLowerCase()) {
    return false;
  }
  return true;
}

function isAllowedScopedSubpath(path: string, basePrefix: string): boolean {
  const suffix = path.slice(basePrefix.length);
  if (!suffix || suffix === "/") {
    return false;
  }
  return (
    /^\/(?:data(?:\/[^/]+)?|shared\/[^/]+|actions(?:\/[^/]+)?|notifications\/schema)$/.test(
      suffix,
    )
  );
}

/** Allowlist for preview iframe API proxy — rejects auth, proxy, wallet, and global routes. */
export function isAllowedPreviewApiPath(
  rawPath: string,
  scope: {
    projectId?: string;
    installationId?: string;
    sessionId?: string;
  },
): boolean {
  const path = normalizePreviewApiPath(rawPath);

  if (BLOCKED_PREVIEW_API_EXACT.has(path)) {
    return false;
  }

  for (const blocked of BLOCKED_PREVIEW_API_PREFIXES) {
    if (path === blocked.replace(/\/$/, "") || path.startsWith(blocked)) {
      return false;
    }
  }

  if (path === "/api/v1/platform/radiant-client") {
    return true;
  }

  if (scope.installationId) {
    const prefix = `/api/v1/installations/${scope.installationId}`;
    if (matchesScopedPrefix(path, "/api/v1/installations", scope.installationId)) {
      return isAllowedScopedSubpath(path, prefix);
    }
    return false;
  }

  if (scope.projectId) {
    const prefix = `/api/v1/projects/${scope.projectId}`;
    if (matchesScopedPrefix(path, "/api/v1/projects", scope.projectId)) {
      return isAllowedScopedSubpath(path, prefix);
    }
  }

  if (scope.sessionId) {
    const prefix = `/api/v1/chat/sessions/${scope.sessionId}`;
    if (matchesScopedPrefix(path, "/api/v1/chat/sessions", scope.sessionId)) {
      const suffix = path.slice(prefix.length);
      return /^\/(?:data(?:\/[^/]+)?|actions(?:\/[^/]+)?|transactions(?:\/[^/]+)?)$/.test(
        suffix,
      );
    }
  }

  return false;
}

/** Rewrite project-scoped API paths to installation paths when previewing an installed app. */
export function rewritePreviewApiPath(
  path: string,
  projectId?: string,
  installationId?: string,
): string {
  if (!installationId || !projectId) {
    return path;
  }

  const projectPrefix = `/api/v1/projects/${projectId}/`;
  const installationPrefix = `/api/v1/installations/${installationId}/`;

  if (path.startsWith(projectPrefix)) {
    return installationPrefix + path.slice(projectPrefix.length);
  }

  return path;
}

export function buildPreviewFetchHeaders(
  init: RequestInit | undefined,
  options: { sessionId?: string; jsonBody?: boolean; path: string },
): Headers {
  const headers = new Headers(init?.headers);
  if (options.jsonBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (options.sessionId && isAppActionApiPath(options.path)) {
    headers.set(RADIANT_SESSION_ID_HEADER, options.sessionId);
  }
  return headers;
}

export async function proxyPreviewApiRequest(
  message: PreviewApiRequestMessage,
  options: {
    projectId?: string;
    installationId?: string;
    sessionId?: string;
  },
): Promise<{ response: PreviewApiResponseMessage; path: string }> {
  const path = rewritePreviewApiPath(message.path ?? "", options.projectId, options.installationId);

  if (!isAllowedPreviewApiPath(path, options)) {
    return {
      path,
      response: {
        type: PREVIEW_API_RESPONSE,
        requestId: message.requestId,
        error: "Preview API path is not allowed",
      },
    };
  }

  const hasBody = Boolean(message.body);

  try {
    const res = await fetch(path, {
      method: message.method ?? "GET",
      body: message.body,
      credentials: "include",
      headers: buildPreviewFetchHeaders(undefined, {
        sessionId: options.sessionId,
        jsonBody: hasBody,
        path,
      }),
    });
    const text = await res.text();
    return {
      path,
      response: {
        type: PREVIEW_API_RESPONSE,
        requestId: message.requestId,
        status: res.status,
        body: text,
      },
    };
  } catch (err) {
    return {
      path,
      response: {
        type: PREVIEW_API_RESPONSE,
        requestId: message.requestId,
        error: err instanceof Error ? err.message : "Request failed",
      },
    };
  }
}

export function postAgentEventToPreviewIframe(
  iframe: HTMLIFrameElement | null | undefined,
  event: Omit<RadiantAgentStreamEvent, "type">,
): void {
  iframe?.contentWindow?.postMessage({ type: RADIANT_AGENT_EVENT_TYPE, ...event }, "*");
}
