export type WaitlistSignupResult = {
  email: string;
  created: boolean;
};

export type WaitlistSource = "hero" | "footer";

type WaitlistEnvelope = {
  success: boolean;
  data: WaitlistSignupResult | null;
  error: { code: string; message: string; details?: unknown } | null;
};

export class WaitlistError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "WaitlistError";
    this.status = status;
    this.code = code;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidWaitlistEmail(email: string): boolean {
  const trimmed = email.trim();
  return trimmed.length > 0 && trimmed.length <= 320 && EMAIL_RE.test(trimmed);
}

/**
 * Public waitlist signup — cookie-less plain fetch (no Privy / apiFetch credentials).
 */
export async function joinWaitlist(
  email: string,
  source?: WaitlistSource,
): Promise<WaitlistSignupResult> {
  const trimmed = email.trim();
  if (!isValidWaitlistEmail(trimmed)) {
    throw new WaitlistError(400, "VALIDATION_ERROR", "Enter a valid email address.");
  }

  let response: Response;
  try {
    response = await fetch("/api/v1/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: trimmed,
        ...(source ? { source } : {}),
      }),
    });
  } catch {
    throw new WaitlistError(
      0,
      "NETWORK_ERROR",
      "Could not reach the waitlist. Check your connection and try again.",
    );
  }

  let body: WaitlistEnvelope;
  try {
    body = (await response.json()) as WaitlistEnvelope;
  } catch {
    throw new WaitlistError(
      response.status,
      "PARSE_ERROR",
      "Unexpected response from the waitlist. Please try again.",
    );
  }

  if (!response.ok || !body.success || !body.data) {
    const message =
      body.error?.code === "VALIDATION_ERROR"
        ? "Enter a valid email address."
        : body.error?.message ?? "Could not join the waitlist. Please try again.";
    throw new WaitlistError(
      response.status,
      body.error?.code ?? "REQUEST_FAILED",
      message,
    );
  }

  return body.data;
}
