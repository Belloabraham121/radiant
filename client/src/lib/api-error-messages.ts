export type ApiFailureKind = "network" | "timeout" | "unreachable" | "invalid";

function pathnameOf(path: string): string {
  return path.split("?")[0] ?? path;
}

function isMutatingMethod(method: string): boolean {
  const upper = method.toUpperCase();
  return upper !== "GET" && upper !== "HEAD";
}

/**
 * User-facing message for non-JSON / proxy / network failures, keyed by API path.
 */
export function messageForApiFailure(
  path: string,
  kind: ApiFailureKind,
  method = "GET",
): string {
  const pathname = pathnameOf(path);
  const mutating = isMutatingMethod(method);

  if (pathname === "/api/v1/auth/me") {
    if (kind === "timeout") {
      return "Loading account settings took too long or the connection dropped. Wait a moment and try again.";
    }
    if (kind === "network" || kind === "unreachable") {
      return "Could not load your account settings. Make sure the backend is running.";
    }
  }

  if (pathname === "/api/v1/auth/register-wallet") {
    if (kind === "timeout") {
      return "Setting up your agent wallet timed out. Wait a moment and try again.";
    }
    return "Could not set up your agent wallet. Make sure the backend is running.";
  }

  if (pathname === "/api/v1/chat" && mutating) {
    if (kind === "timeout") {
      return (
        "The agent request took too long or the connection dropped. " +
        "Your backend may still be processing — wait a moment and refresh the chat. " +
        "If it keeps happening, try a shorter question first."
      );
    }
    return "Could not reach your agent. Make sure the backend is running.";
  }

  if (pathname.startsWith("/api/v1/chat/sessions/") && pathname.endsWith("/messages")) {
    if (kind === "timeout") {
      return "Could not load this conversation — the request timed out. Wait a moment and try again.";
    }
    return "Could not load this conversation. Make sure the backend is running.";
  }

  if (pathname === "/api/v1/chat/sessions" || pathname.startsWith("/api/v1/chat/sessions/")) {
    if (kind === "timeout") {
      return "Could not load your chats — the request timed out. Wait a moment and refresh.";
    }
    return "Could not load your chats. Make sure the backend is running.";
  }

  if (pathname.startsWith("/api/v1/wallets/")) {
    if (kind === "timeout") {
      return "Loading wallet data timed out. Wait a moment and try again.";
    }
    return "Could not load wallet data. Make sure the backend is running.";
  }

  if (pathname.startsWith("/api/v1/agent/permissions")) {
    if (mutating) {
      if (kind === "timeout") {
        return "Saving agent permissions timed out. Your changes may not have been saved — try again.";
      }
      return "Could not save agent permissions. Try again.";
    }
    if (kind === "timeout") {
      return "Could not load agent permissions — the request timed out. Wait a moment and try again.";
    }
    return "Could not load agent permissions. Make sure the backend is running.";
  }

  if (pathname.startsWith("/api/v1/agent/transactions")) {
    if (kind === "timeout") {
      return "Loading agent activity timed out. Wait a moment and try again.";
    }
    return "Could not load agent activity. Make sure the backend is running.";
  }

  if (pathname.startsWith("/api/v1/projects")) {
    if (kind === "timeout") {
      return "Loading projects timed out. Wait a moment and try again.";
    }
    return "Could not load projects. Make sure the backend is running.";
  }

  if (pathname.startsWith("/api/v1/installations")) {
    if (kind === "timeout") {
      return "Loading this app timed out. Wait a moment and try again.";
    }
    return "Could not load this app. Make sure the backend is running.";
  }

  if (pathname.startsWith("/api/v1/apps/")) {
    if (kind === "timeout") {
      return "This action timed out. Wait a moment and try again.";
    }
    return "Could not complete this action. Make sure the backend is running.";
  }

  switch (kind) {
    case "network":
    case "unreachable":
      return "Could not reach the API server. Make sure the backend is running (npm run dev in backend/).";
    case "timeout":
      return "The request timed out or the connection dropped. Wait a moment and try again.";
    default:
      return "Invalid API response";
  }
}

/** Map chat stream error codes to clearer copy (used by useChatSession). */
export function messageForChatStreamError(code: string): string | null {
  switch (code) {
    case "CHAT_STREAM_INCOMPLETE":
      return "Connection lost while the agent was responding. Refresh the chat to see if a reply was saved.";
    case "CHAT_STREAM_EMPTY":
      return "The agent returned an empty response. Try sending your message again.";
    case "CHAT_STREAM_FAILED":
      return "Could not reach your agent. Try again.";
    case "RATE_LIMITED":
    case "LIFI_RATE_LIMITED":
      return "Cross-chain execution is temporarily rate limited. Wait a moment, then try Approve again.";
    case "SQUID_NO_ROUTE":
      return "No alternate route is available for this transfer right now. Try a different amount or pair.";
    case "SQUID_UNAVAILABLE":
      return "Alternate routing is temporarily unavailable. Try again later.";
    default:
      return null;
  }
}
