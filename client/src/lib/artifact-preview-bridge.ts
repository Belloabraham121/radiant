/** Parent ↔ iframe preview bridge — API proxy + agent event relay (Phase 5). */

export const PREVIEW_MESSAGE_TYPE = "radiant-artifact-preview";
export const PREVIEW_NAVIGATE_TYPE = "radiant-artifact-preview-navigate";
export const PREVIEW_API_REQUEST = "radiant-preview-api";
export const PREVIEW_API_RESPONSE = "radiant-preview-api-response";
export const RADIANT_AGENT_EVENT_TYPE = "radiant-agent-event";
export const RADIANT_SESSION_ID_HEADER = "x-radiant-session-id";

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
};

export function isAppActionApiPath(path: string): boolean {
  return /\/actions\/[^/?#]+/.test(path);
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
