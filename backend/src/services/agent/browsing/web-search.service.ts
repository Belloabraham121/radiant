import { AppError } from "../../../errors/app-error.js";
import { logger } from "../../../shared/logger.js";

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export type WebSearchOutput = {
  query: string;
  results: SearchResult[];
  rate_limit: { remaining: number; limit: number; window: string };
};

// --- Rate limiter (in-memory, per-user, sliding window) ---

type RateBucket = { count: number; resetAt: number };

const userBuckets = new Map<string, RateBucket>();

const PROVIDER_LIMITS: Record<string, { maxPerWindow: number; windowMs: number; windowLabel: string }> = {
  brave: { maxPerWindow: 15, windowMs: 60 * 60 * 1000, windowLabel: "hour" },
  exa:   { maxPerWindow: 10, windowMs: 60 * 60 * 1000, windowLabel: "hour" },
};

function checkRateLimit(userId: string, provider: string): { remaining: number; limit: number; window: string } {
  const config = PROVIDER_LIMITS[provider] ?? PROVIDER_LIMITS.brave!;
  const key = `${provider}:${userId}`;
  const now = Date.now();

  let bucket = userBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + config.windowMs };
    userBuckets.set(key, bucket);
  }

  if (bucket.count >= config.maxPerWindow) {
    const minsLeft = Math.ceil((bucket.resetAt - now) / 60_000);
    throw new AppError(
      429,
      "SEARCH_RATE_LIMITED",
      `You've used all ${config.maxPerWindow} web searches this ${config.windowLabel}. ` +
      `Try again in ~${minsLeft} minute${minsLeft === 1 ? "" : "s"}. ` +
      `Use browse_webpage to read pages you already found, or answer from context you already have.`,
    );
  }

  bucket.count += 1;
  return {
    remaining: config.maxPerWindow - bucket.count,
    limit: config.maxPerWindow,
    window: config.windowLabel,
  };
}

// Periodic cleanup of expired buckets (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of userBuckets) {
    if (now >= bucket.resetAt) userBuckets.delete(key);
  }
}, 10 * 60 * 1000).unref();

// --- Brave Search ---

async function braveSearch(query: string, count: number): Promise<SearchResult[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) {
    throw new AppError(500, "SEARCH_NOT_CONFIGURED", "BRAVE_SEARCH_API_KEY is not set.");
  }

  const params = new URLSearchParams({
    q: query,
    count: String(Math.min(count, 20)),
  });

  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers: { "X-Subscription-Token": apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.warn("Brave Search API error", { status: res.status, body: body.slice(0, 300) });
    throw new AppError(502, "SEARCH_API_ERROR", `Brave Search returned ${res.status}`);
  }

  const data = (await res.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
  };

  return (data.web?.results ?? []).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: r.description ?? "",
  }));
}

// --- Exa.ai ---

async function exaSearch(query: string, count: number): Promise<SearchResult[]> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    throw new AppError(500, "SEARCH_NOT_CONFIGURED", "EXA_API_KEY is not set.");
  }

  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      numResults: Math.min(count, 10),
      type: "auto",
      contents: { text: { maxCharacters: 300 } },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.warn("Exa API error", { status: res.status, body: body.slice(0, 300) });
    throw new AppError(502, "SEARCH_API_ERROR", `Exa returned ${res.status}`);
  }

  const data = (await res.json()) as {
    results?: Array<{ title?: string; url?: string; text?: string }>;
  };

  return (data.results ?? []).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: r.text ?? "",
  }));
}

// --- Provider dispatch ---

export async function webSearch(query: string, count = 5, userId?: string): Promise<WebSearchOutput> {
  const provider = process.env.WEB_SEARCH_PROVIDER ?? "brave";
  const rateLimit = checkRateLimit(userId ?? "anonymous", provider);

  let results: SearchResult[];
  switch (provider) {
    case "brave":
      results = await braveSearch(query, count);
      break;
    case "exa":
      results = await exaSearch(query, count);
      break;
    default:
      throw new AppError(500, "SEARCH_NOT_CONFIGURED", `Unknown WEB_SEARCH_PROVIDER: ${provider}`);
  }

  return { query, results, rate_limit: rateLimit };
}
