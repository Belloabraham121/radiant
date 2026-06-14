import { API_BASE_URL } from "@/lib/api-config";

/** Agent turns may run many tool + LLM steps — avoid the default ~30s rewrite proxy limit. */
export const maxDuration = 300;

const CHAT_UPSTREAM_TIMEOUT_MS = 5 * 60 * 1000;

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  const cookie = request.headers.get("cookie");
  const url = new URL(request.url);
  const stream = url.searchParams.get("stream") === "1";
  const accept = request.headers.get("accept") ?? "";
  const upstreamUrl = stream
    ? `${API_BASE_URL}/api/v1/chat?stream=1`
    : `${API_BASE_URL}/api/v1/chat`;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(stream || accept.includes("text/event-stream")
          ? { Accept: "text/event-stream" }
          : {}),
        ...(cookie ? { cookie } : {}),
      },
      body,
      signal: AbortSignal.timeout(CHAT_UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const timedOut = /timeout|aborted/i.test(message);
    return Response.json(
      {
        success: false,
        data: null,
        meta: { correlation_id: "proxy", timestamp: new Date().toISOString() },
        error: {
          code: timedOut ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE",
          message: timedOut
            ? "The agent request timed out. Try again — complex research can take a minute."
            : "Could not reach the backend API. Make sure it is running on port 3001.",
        },
      },
      { status: timedOut ? 504 : 502 },
    );
  }

  if (stream) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") ?? "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
    },
  });
}
